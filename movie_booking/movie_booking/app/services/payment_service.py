import json
import logging
from typing import List, Dict, Any, Optional
from redis.asyncio import Redis

logger = logging.getLogger(__name__)


def _get_seat_lock_key(showtime_id: int, seat_id: int) -> str:
    """Generates a Redis key for a seat lock using configured prefix."""
    try:
        from app.core.config import SEAT_LOCK_PREFIX
        prefix = SEAT_LOCK_PREFIX or ""
    except Exception:
        prefix = ""
        
    if prefix and not prefix.endswith(":"):
        prefix = prefix + ":"
    return f"{prefix}seat_lock:{showtime_id}:{seat_id}"


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
    """
    if not seat_ids:
        return {"valid": False, "invalid_seats": [], "reason": "No seats specified"}

    keys = [_get_seat_lock_key(showtime_id, int(sid)) for sid in seat_ids]
    try:
        pipeline = redis.pipeline()
        for k in keys:
            pipeline.get(k)
        results = await pipeline.execute()
    except Exception as e:
        logger.error(f"validate_locks_for_booking: Redis pipeline execute failed: {e}")
        return {"valid": False, "invalid_seats": seat_ids, "reason": "Redis unavailable"}

    invalid_seats: List[int] = []
    for i, raw in enumerate(results):
        sid = int(seat_ids[i])
        if not raw:
            # no lock present
            invalid_seats.append(sid)
            continue

        # Extract owner from Redis value (simple string format)
        try:
            current_owner = raw.decode() if isinstance(raw, (bytes, bytearray)) else str(raw)
        except Exception as ex:
            logger.warning(f"validate_locks_for_booking: failed to parse lock value for seat {sid}: {ex}")
            invalid_seats.append(sid)
            continue

        if owner is not None and owner != "":
            # caller requires specific owner ownership
            if current_owner != owner:
                invalid_seats.append(sid)
        else:
            # caller did not supply an owner; require that seat is locked by someone
            if not current_owner:
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
        # Use pipeline for efficiency
        pipeline = redis.pipeline()
        for key in keys:
            pipeline.get(key)
        lock_values = await pipeline.execute()

        # Delete keys that belong to this owner
        delete_pipeline = redis.pipeline()
        for i, lock_value in enumerate(lock_values):
            seat_id = seat_ids[i]
            key = keys[i]

            if not lock_value:
                # Already released or never existed
                not_owned.append(seat_id)
                continue

            # Check owner
            try:
                current_owner = lock_value.decode() if isinstance(lock_value, (bytes, bytearray)) else str(lock_value)
            except Exception:
                current_owner = None

            if current_owner == owner:
                delete_pipeline.delete(key)
                released.append(seat_id)
            else:
                not_owned.append(seat_id)

        # Execute deletions
        await delete_pipeline.execute()

        logger.info(f"Released locks - Showtime: {showtime_id}, Released: {len(released)}, Not owned: {len(not_owned)}")
        return {"released": released, "not_owned": not_owned}

    except Exception as e:
        logger.error(f"release_seat_locks_simple: unexpected error: {e}")
        return {"released": [], "not_owned": seat_ids}