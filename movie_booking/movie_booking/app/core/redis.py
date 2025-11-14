"""
Redis client for seat locking with async support
"""
import redis.asyncio as aioredis
from redis.asyncio import Redis
from typing import Optional
from app.core.config import REDIS_URL
import logging

logger = logging.getLogger(__name__)

# Global Redis client instance
_redis_client: Optional[Redis] = None


async def get_redis() -> Redis:
    """
    Dependency to get Redis client instance.
    Returns singleton async Redis connection with optimized settings.
    """
    global _redis_client
    
    if _redis_client is None:
        try:
            _redis_client = await aioredis.from_url(
                REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                socket_connect_timeout=5,
                socket_timeout=2,  # Reduced socket timeout for faster failures
                socket_keepalive=True,  # Keep connection alive
                socket_keepalive_options={},  # OS defaults
                retry_on_timeout=True,  # Retry on timeout
                health_check_interval=30,  # Health check every 30s
                max_connections=50,  # Connection pool size
            )
            # Test connection
            await _redis_client.ping()
            logger.info(f"✓ Redis connected: {REDIS_URL}")
        except Exception as e:
            logger.error(f"✗ Redis connection failed: {e}")
            raise
    
    # Verify connection is still alive
    try:
        await _redis_client.ping()
    except Exception as e:
        logger.warning(f"Redis connection stale, reconnecting: {e}")
        try:
            await _redis_client.close()
        except:
            pass
        _redis_client = None
        return await get_redis()  # Recursive retry
    
    return _redis_client


async def close_redis():
    """Close Redis connection on shutdown"""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
        logger.info("✓ Redis connection closed")


async def health_check_redis() -> dict:
    """
    Health check endpoint for Redis
    Returns connection status and latency
    """
    try:
        redis = await get_redis()
        import time
        start = time.time()
        await redis.ping()
        latency_ms = (time.time() - start) * 1000
        return {
            "status": "healthy",
            "latency_ms": round(latency_ms, 2),
            "url": REDIS_URL.split("@")[-1] if "@" in REDIS_URL else REDIS_URL
        }
    except Exception as e:
        return {
            "status": "unhealthy",
            "error": str(e)
        }

