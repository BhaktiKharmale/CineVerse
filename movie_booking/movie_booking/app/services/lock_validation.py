import json
import logging
from typing import List, Dict, Any, Optional
from redis.asyncio import Redis
from app.core.config import settings

logger = logging.getLogger(__name__)


def _get_seat_lock_key(showtime_id: int, seat_id: int) -> str:
    """Generates a Redis key for a seat lock using configured prefix."""
    prefix = getattr(settings, "SEAT_LOCK_PREFIX", "") or ""
    if prefix and not prefix.endswith(":"):
        prefix = prefix + ":"
    return f"{prefix}seat_lock:{showtime_id}:{seat_id}"


def _extract_owner_from_redis_value(raw_value: Any) -> Optional[str]:
    """
    Accept both JSON blob and plain-string formats:
      - JSON: {"owner": "...", ...}
      - Plain string: "owner-token"
    Return owner string or None.
    """
    if raw_value is None:
        return None

    try:
        # bytes -> decode
        if isinstance(raw_value, (bytes, bytearray)):
            raw_value = raw_value.decode()
    except Exception:
        # decoding failed — treat as unavailable
        return None

    # If it looks like JSON, try parse
    if isinstance(raw_value, str):
        s = raw_value.strip()
        if not s:
            return None
        # quick heuristic: JSON object starts with '{'
        if s.startswith("{") or s.startswith("["):
            try:
                parsed = json.loads(s)
                if isinstance(parsed, dict):
                    # common keys we might have used:
                    return parsed.get("owner") or parsed.get("owner_token") or parsed.get("locked_by")
                # if parsed not dict, fallback to None
                return None
            except Exception:
                # If JSON parse fails, treat the whole string as owner token (legacy behaviour)
                # Example: old code stores owner token as plain string.
                return s
        else:
            # Not JSON — treat as direct owner token
            return s
    # otherwise unknown format
    return None


async def validate_locks_for_booking(
    redis: Redis,
    showtime_id: int,
    seat_ids: List[int],
    owner: Optional[str] = None
) -> Dict[str, Any]:
    """
    Validate that the provided seat_ids are locked and owned by `owner`.
    Returns:
      { valid: bool, invalid_seats: [...], reason: <str> }

    On Redis/inspect errors or ambiguous/non-JSON responses, returns
    {'valid': True, 'warning': 'locks_unavailable'} to avoid blocking the payment flow.
    """
    if not seat_ids:
        return {"valid": False, "invalid_seats": [], "reason": "No seats specified"}

    keys = [_get_seat_lock_key(showtime_id, int(sid)) for sid in seat_ids]
    try:
        # OPTIMIZED: Use MGET for better performance (single call instead of pipeline)
        import asyncio
        try:
            results = await asyncio.wait_for(redis.mget(keys), timeout=0.5)
        except asyncio.TimeoutError:
            logger.warning("validate_locks_for_booking: Redis MGET timeout - treating as locks unavailable")
            # Soft-fail: treat as locks unavailable (caller may retry or proceed depending on policy)
            return {"valid": True, "warning": "locks_unavailable"}
    except Exception as e:
        logger.exception("validate_locks_for_booking: Redis operation failed")
        # Soft-fail: treat as locks unavailable (caller may retry or proceed depending on policy)
        return {"valid": True, "warning": "locks_unavailable"}

    invalid_seats: List[int] = []
    for i, raw in enumerate(results):
        sid = int(seat_ids[i])
        if not raw:
            # no lock present
            invalid_seats.append(sid)
            continue

        # try to extract owner in both JSON and plain-string formats
        try:
            current_owner = _extract_owner_from_redis_value(raw)
        except Exception as ex:
            logger.warning("validate_locks_for_booking: failed to parse lock value for seat %s: %s", sid, ex)
            # Soft-fail in ambiguous parsing so we don't break payment flow
            return {"valid": True, "warning": "locks_unavailable"}

        if owner is not None and owner != "":
            # caller requires specific owner ownership
            if current_owner is None or str(current_owner) != str(owner):
                invalid_seats.append(sid)
        else:
            # caller did not supply an owner; require that seat is locked by someone
            if current_owner is None:
                invalid_seats.append(sid)

    if invalid_seats:
        reason = "Some seats are not locked by the required owner"
        return {"valid": False, "invalid_seats": invalid_seats, "reason": reason}
    return {"valid": True}


async def release_seat_locks_simple(
    redis: Redis,
    showtime_id: int,
    seat_ids: List[int],
    owner: str
) -> Dict[str, Any]:
    """
    Simple lock release for payment completion.
    Deletes locks owned by the specified owner.
    Returns {"released": [...], "not_owned": [...]}
    """
    if not seat_ids:
        return {"released": [], "not_owned": []}

    keys = [_get_seat_lock_key(showtime_id, int(sid)) for sid in seat_ids]
    released: List[int] = []
    not_owned: List[int] = []

    try:
        # first read all lock values
        pipeline = redis.pipeline()
        for k in keys:
            pipeline.get(k)
        lock_data_list = await pipeline.execute()

        # prepare delete pipeline for keys that belong to this owner
        delete_pipeline = redis.pipeline()
        for i, lock_data_json in enumerate(lock_data_list):
            seat_id = seat_ids[i]
            key = keys[i]

            if not lock_data_json:
                # Already released or never existed -> treat as released
                released.append(seat_id)
                continue

            # attempt to extract owner (handles JSON and plain string)
            try:
                current_owner = _extract_owner_from_redis_value(lock_data_json)
            except Exception:
                # parsing ambiguous, be conservative and mark not_owned (so we don't delete someone else's lock)
                not_owned.append(seat_id)
                continue

            if current_owner is None:
                # ambiguous, don't delete; mark as not owned
                not_owned.append(seat_id)
                continue

            if str(current_owner) == str(owner):
                delete_pipeline.delete(key)
                released.append(seat_id)
            else:
                not_owned.append(seat_id)

        # execute delete pipeline (best-effort)
        try:
            await delete_pipeline.execute()
        except Exception:
            logger.exception("release_seat_locks_simple: failed to delete keys after ownership check")
            # If deletes failed, we still return what we intended; mark degraded by leaving not_owned as-is
            return {"released": released, "not_owned": not_owned}

        logger.info(f"Released locks - Showtime: {showtime_id}, Released: {len(released)}, Not owned: {len(not_owned)}")
        return {"released": released, "not_owned": not_owned}

    except Exception as e:
        logger.exception("release_seat_locks_simple: unexpected error")
        return {"released": [], "not_owned": seat_ids}
