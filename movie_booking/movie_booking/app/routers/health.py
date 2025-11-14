# app/routers/health.py
from typing import Awaitable, cast
from fastapi import APIRouter, Depends, HTTPException
from redis.asyncio.client import Redis  # note: explicit asyncio client import
from app.deps.redis import get_redis

router = APIRouter(prefix="/health", tags=["health"])

@router.get("/redis")
async def redis_health(r: Redis = Depends(get_redis)):
    """
    Lightweight health check for Redis.
    Uses a typed cast so Pyright doesn't complain that ping() is non-awaitable.
    """
    try:
        pong = await cast(Awaitable[bool], r.ping())
        if not pong:
            raise HTTPException(status_code=503, detail="Redis PING returned False")
        info = await r.info("server")
        dbsize = await r.dbsize()
        return {
            "ok": True,
            "dbsize": dbsize,
            "redis_version": info.get("redis_version"),
        }
    except Exception as e:
        # Do not leak secrets; just return an operational error
        raise HTTPException(status_code=503, detail=f"Redis error: {str(e)}") from e


@router.get("/redis/roundtrip")
async def redis_roundtrip(r: Redis = Depends(get_redis)):
    """
    Stronger check: set/get/delete a key with expiry.
    Useful to verify auth, write permissions, and latency.
    """
    key = "health:roundtrip"
    try:
        # Write with short TTL
        await r.set(key, "ok", ex=5)
        val = await r.get(key)
        await r.delete(key)

        if (val or b"").decode("utf-8") != "ok":
            raise HTTPException(status_code=503, detail="Redis roundtrip mismatch")

        info = await r.info("server")
        return {
            "ok": True,
            "mode": "roundtrip",
            "redis_version": info.get("redis_version"),
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Redis roundtrip error: {str(e)}") from e

