# app/core/redis.py
import os
import logging
from typing import Optional, Any
from urllib.parse import urlparse, quote, unquote
import asyncio
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "")
REDIS_SOCKET_TIMEOUT = float(os.getenv("REDIS_SOCKET_TIMEOUT", 1.0))
REDIS_SOCKET_CONNECT_TIMEOUT = float(os.getenv("REDIS_SOCKET_CONNECT_TIMEOUT", 1.0))
REDIS_SSL_VERIFY = os.getenv("REDIS_SSL_VERIFY", "")  # may be empty for non-TLS

_redis_client: Optional[aioredis.Redis] = None


def _parse_redis_url(url: str) -> str:
    """
    Normalize a REDIS_URL so the password is properly URL-encoded exactly once.
    - If the URL already contains percent-encoding, we unquote() then quote() to
      guarantee exactly one proper encoding pass (avoids double-encoding).
    - Leaves other parts of the URL intact.
    """
    if not url:
        return url

    try:
        p = urlparse(url)
        if p.scheme not in ("redis", "rediss"):
            return url

        # Only run normalization when netloc contains '@' (i.e. credentials present)
        if "@" in p.netloc:
            # Extract username and password via urlparse attributes (may be None)
            username = p.username or ""
            password = p.password or ""
            host_port = p.netloc.split("@")[-1]

            # If password is present, ensure exactly-one encoding:
            # 1) unquote existing percent-encoding (so 'abc%40d' -> 'abc@d')
            # 2) quote it again to produce 'abc%40d' (safe)
            if password:
                password_unquoted = unquote(password)
                password_quoted = quote(password_unquoted, safe="")

                if username:
                    netloc = f"{username}:{password_quoted}@{host_port}"
                else:
                    # redis URL without username normally uses :password@host
                    netloc = f":{password_quoted}@{host_port}"

                # Rebuild minimal normalized url
                normalized = f"{p.scheme}://{netloc}{p.path or ''}"
                if p.query:
                    normalized += f"?{p.query}"
                return normalized
    except Exception as e:
        logger.warning("Redis URL parse/normalize failed: %s", e)
    return url


async def _maybe_await(value: Any) -> Any:
    """
    Await value if it is awaitable (coroutine / awaitable object), otherwise return it.
    This avoids 'bool is not awaitable' type errors across redis client versions.
    """
    if asyncio.iscoroutine(value) or hasattr(value, "__await__"):
        return await value  # type: ignore[return-value]
    return value


async def get_redis() -> aioredis.Redis:
    """Return a singleton async Redis client (best-effort connect)."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client

    url = REDIS_URL or os.getenv("REDIS_URL", "")
    if not url:
        raise RuntimeError("REDIS_URL not set")

    # ✅ FIXED: This line was commented out incorrectly - now properly uncommented
    url = _parse_redis_url(url)

    try:
        _redis_client = aioredis.from_url(
            url,
            socket_timeout=REDIS_SOCKET_TIMEOUT,
            socket_connect_timeout=REDIS_SOCKET_CONNECT_TIMEOUT,
            decode_responses=True,
        )

        # quick ping test to validate connectivity + auth
        try:
            ping_result = _redis_client.ping()  # may be bool or awaitable depending on client/stubs
            pong = await _maybe_await(ping_result)
        except Exception as exc_ping:
            # ping failure — raise with helpful message below
            pong = False
            ping_exc = exc_ping
        else:
            ping_exc = None

        if not pong:
            if ping_exc:
                msg = str(ping_exc)
            else:
                msg = "Redis PING returned falsy value"
            # look for common auth/connect failure hints
            if "invalid username-password" in msg or "WRONGPASS" in msg or "NOAUTH" in msg or "Authentication" in msg:
                logger.error("Redis auth failure: %s", msg)
                raise RuntimeError("Redis authentication failed (invalid username/password). Check REDIS_URL/credentials.")
            logger.error("Redis ping/connect error: %s", msg)
            raise RuntimeError(f"Redis connection failed: {msg}")

        logger.info("Connected to Redis at %s", url)
        return _redis_client
    except Exception as exc:
        # If we created a client instance but failed, ensure we don't keep a broken singleton
        try:
            if _redis_client is not None:
                await _maybe_await(_redis_client.close())
        except Exception:
            pass
        _redis_client = None
        # re-raise a clear RuntimeError for callers to handle
        raise RuntimeError(f"Redis connection failed: {exc}")


async def close_redis():
    global _redis_client
    if _redis_client is not None:
        try:
            await _maybe_await(_redis_client.close())
        except Exception:
            pass
        _redis_client = None


async def health_check_redis():
    """Health check endpoint for Redis."""
    try:
        redis_client = await get_redis()
        if redis_client:
            ping_result = redis_client.ping()
            pong = await _maybe_await(ping_result)
            if pong:
                return {"status": "ok", "detail": "Redis is connected and responsive"}
            else:
                return {"status": "error", "detail": "Redis ping returned false"}
        else:
            return {"status": "error", "detail": "Redis client is None"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}