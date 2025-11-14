import json
import logging
from typing import List, Dict, Any, Optional
import asyncio
import time

logger = logging.getLogger(__name__)

# Fixed Lua script for atomic multi-seat locking - IGNORES seats already locked by same user
MULTI_LOCK_LUA = """
local locked_seats = {}
local conflicts = {}
local owner = ARGV[1]
local ttl_ms = tonumber(ARGV[2])

for i = 1, #KEYS do
    local key = KEYS[i]
    local current_owner = redis.call('GET', key)
    
    if current_owner then
        -- Seat is already locked
        if current_owner == owner then
            -- Same owner - treat as already locked by us, add to success list
            local seat_id = string.match(key, ":(%d+)$")
            if seat_id then
                table.insert(locked_seats, tonumber(seat_id))
            end
        else
            -- Different owner - this is a real conflict
            local seat_id = string.match(key, ":(%d+)$")
            if seat_id then
                table.insert(conflicts, {tonumber(seat_id), current_owner})
            end
        end
    else
        -- Seat is available, try to lock it
        local result = redis.call('SET', key, owner, 'NX', 'PX', ttl_ms)
        if result then
            local seat_id = string.match(key, ":(%d+)$")
            if seat_id then
                table.insert(locked_seats, tonumber(seat_id))
            end
        else
            -- This should rarely happen (race condition), but handle it
            local seat_id = string.match(key, ":(%d+)$")
            if seat_id then
                table.insert(conflicts, {tonumber(seat_id), "unknown"})
            end
        end
    end
end

-- If any conflicts with other users, release any NEW locks we just acquired
if #conflicts > 0 then
    for i = 1, #KEYS do
        local key = KEYS[i]
        local current_owner = redis.call('GET', key)
        -- Only release if we just locked it (owner matches and TTL is fresh)
        if current_owner == owner then
            -- Check if this was an existing lock (would have longer TTL) vs new lock
            local ttl = redis.call('PTTL', key)
            if ttl > 0 and ttl >= (ttl_ms - 1000) then  -- New lock (TTL close to what we set)
                redis.call('DEL', key)
            end
        end
    end
    return {0, cjson.encode(conflicts)}
end

return {1, cjson.encode(locked_seats)}
"""

# Lua script for extending locks
EXTEND_LUA_SCRIPT = """
local extended = 0
for i = 1, #KEYS do
    local key = KEYS[i]
    local expected_owner = ARGV[1]
    local ttl_ms = tonumber(ARGV[2])
    
    local current_owner = redis.call('GET', key)
    if current_owner == expected_owner then
        redis.call('PEXPIRE', key, ttl_ms)
        extended = extended + 1
    end
end
return extended
"""

# Lua script for releasing locks
RELEASE_LUA_SCRIPT = """
local released = 0
for i = 1, #KEYS do
    local key = KEYS[i]
    local expected_owner = ARGV[1]
    
    local current_owner = redis.call('GET', key)
    if current_owner == expected_owner then
        redis.call('DEL', key)
        released = released + 1
    end
end
return released
"""

def _prefix() -> str:
    """Get the Redis key prefix consistently."""
    try:
        from app.core.config import SEAT_LOCK_PREFIX
        if SEAT_LOCK_PREFIX:
            return str(SEAT_LOCK_PREFIX)
    except Exception:
        pass
    return ""


def _key_for(showtime_id: int, seat_id: int) -> str:
    """Generate consistent Redis key for seat locks."""
    p = _prefix()
    if p:
        if not p.endswith(":"):
            p = p + ":"
        return f"{p}seat_lock:{showtime_id}:{seat_id}"
    return f"seat_lock:{showtime_id}:{seat_id}"


def _key_pattern(showtime_id: int) -> str:
    """Generate key pattern for scanning."""
    p = _prefix()
    if p:
        if not p.endswith(":"):
            p = p + ":"
        return f"{p}seat_lock:{showtime_id}:*"
    return f"seat_lock:{showtime_id}:*"


def _epoch_ms_from_now_plus(ttl_ms: int) -> int:
    """Return epoch milliseconds for now + ttl_ms."""
    return int(time.time() * 1000) + int(ttl_ms)


async def acquire_seat_locks(
    redis,
    showtime_id: int,
    seat_ids: List[int],
    owner: str,
    ttl_ms: int = 180_000,
) -> Dict[str, Any]:
    """
    Atomically lock multiple seats - all succeed or all fail.
    Uses Lua script for atomicity.
    IGNORES seats already locked by the same user (treats them as success).
    """
    if not seat_ids:
        return {"success": False, "locked": [], "conflicts": [], "ttl_ms": int(ttl_ms), "expires_at": _epoch_ms_from_now_plus(ttl_ms)}

    # If Redis is not available, treat all seats as lockable (graceful degradation)
    if redis is None:
        logger.warning("Redis unavailable - treating all seats as lockable")
        expires_at = _epoch_ms_from_now_plus(ttl_ms)
        return {
            "success": True, 
            "locked": seat_ids, 
            "conflicts": [], 
            "ttl_ms": int(ttl_ms), 
            "expires_at": int(expires_at)
        }

    keys = [_key_for(showtime_id, int(sid)) for sid in seat_ids]
    
    try:
        # Use eval instead of register_script to avoid async issues
        # Add timeout to prevent hanging on slow Redis
        result = await asyncio.wait_for(
            redis.eval(MULTI_LOCK_LUA, len(keys), *keys, owner, ttl_ms),
            timeout=1.0  # 1 second timeout for lock operation
        )
        
        # result[0] is success indicator (1 = success, 0 = conflict)
        # result[1] is JSON string of either locked seats or conflicts
        if result[0] == 1:
            # Success - all seats locked or already owned by us
            locked_seats = json.loads(result[1])
            expires_at = _epoch_ms_from_now_plus(ttl_ms)
            logger.info(f"Successfully locked/verified seats {locked_seats} for showtime {showtime_id}, owner: {owner}")
            return {
                "success": True,
                "locked": locked_seats,
                "conflicts": [],
                "ttl_ms": int(ttl_ms),
                "expires_at": int(expires_at)
            }
        else:
            # Conflict - some seats were locked by other users
            conflicts_data = json.loads(result[1])
            conflicts = []
            for conflict in conflicts_data:
                seat_id = conflict[0]
                conflict_owner = conflict[1]
                conflicts.append({
                    "seatId": seat_id,
                    "owner": conflict_owner.decode() if isinstance(conflict_owner, bytes) else conflict_owner
                })
            
            logger.warning(f"Lock conflicts for showtime {showtime_id}: {conflicts}")
            return {
                "success": False,
                "locked": [],
                "conflicts": conflicts,
                "ttl_ms": int(ttl_ms),
                "expires_at": _epoch_ms_from_now_plus(ttl_ms)
            }
            
    except asyncio.TimeoutError:
        logger.warning(f"Redis lock operation timeout for showtime {showtime_id} - using fallback")
        # Fallback to individual locking with proper conflict detection
        return await _acquire_seat_locks_fallback(redis, showtime_id, seat_ids, owner, ttl_ms)
    except Exception as e:
        logger.error(f"Redis error during atomic multi-seat locking: {e}")
        # Fallback to individual locking with proper conflict detection
        return await _acquire_seat_locks_fallback(redis, showtime_id, seat_ids, owner, ttl_ms)


async def _acquire_seat_locks_fallback(redis, showtime_id: int, seat_ids: List[int], owner: str, ttl_ms: int) -> Dict[str, Any]:
    """Fallback method for seat locking if Lua script fails."""
    logger.info(f"Using fallback locking for seats {seat_ids}")
    
    locked = []
    conflicts = []
    
    # First, check all seats for conflicts with OTHER users
    pipe = redis.pipeline()
    for seat_id in seat_ids:
        key = _key_for(showtime_id, seat_id)
        pipe.get(key)
    
    existing_locks = await pipe.execute()
    
    # Check for conflicts with other users only
    for i, seat_id in enumerate(seat_ids):
        existing_lock = existing_locks[i]
        if existing_lock:
            existing_owner = existing_lock.decode() if isinstance(existing_lock, bytes) else existing_lock
            if existing_owner != owner:
                # This is a real conflict - locked by different user
                conflicts.append({
                    "seatId": seat_id,
                    "owner": existing_owner
                })
            else:
                # Already locked by same user - treat as success
                locked.append(seat_id)
    
    if conflicts:
        # Conflicts with other users found, return without locking anything new
        logger.warning(f"Conflicts detected in fallback: {conflicts}")
        return {
            "success": False,
            "locked": [],
            "conflicts": conflicts,
            "ttl_ms": int(ttl_ms),
            "expires_at": _epoch_ms_from_now_plus(ttl_ms)
        }
    
    # No conflicts with other users, proceed with locking only the seats not already locked by us
    seats_to_lock = [sid for sid in seat_ids if sid not in locked]
    
    if seats_to_lock:
        pipe = redis.pipeline()
        for seat_id in seats_to_lock:
            key = _key_for(showtime_id, seat_id)
            pipe.set(key, owner, px=ttl_ms, nx=True)
        
        lock_results = await pipe.execute()
        
        # Check which locks were successful
        for i, seat_id in enumerate(seats_to_lock):
            if lock_results[i]:
                locked.append(seat_id)
            else:
                # This shouldn't happen since we checked first, but handle it
                # Check who owns it now
                current_owner = await redis.get(_key_for(showtime_id, seat_id))
                if current_owner:
                    conflict_owner = current_owner.decode() if isinstance(current_owner, bytes) else current_owner
                    if conflict_owner != owner:
                        conflicts.append({
                            "seatId": seat_id,
                            "owner": conflict_owner
                        })
    
    expires_at = _epoch_ms_from_now_plus(ttl_ms)
    success = len(conflicts) == 0
    
    if success:
        logger.info(f"Fallback locking successful for seats {locked}")
    else:
        logger.warning(f"Fallback locking partial success: locked={locked}, conflicts={conflicts}")
    
    return {
        "success": success,
        "locked": locked,  # Includes seats already locked by us + newly locked seats
        "conflicts": conflicts,
        "ttl_ms": int(ttl_ms),
        "expires_at": int(expires_at)
    }


async def extend_seat_locks(
    redis,
    showtime_id: int,
    seat_ids: List[int],
    owner: str,
    ttl_ms: int = 180_000,
) -> Dict[str, Any]:
    """
    Extend TTL for seats owned by `owner`.
    """
    if not seat_ids:
        return {"extended": [], "not_owned": [], "ttl_ms": int(ttl_ms)}

    # If Redis is not available, treat all as extended
    if redis is None:
        logger.warning("Redis unavailable - treating all seat extensions as successful")
        return {"extended": seat_ids, "not_owned": [], "ttl_ms": int(ttl_ms)}

    extended = []
    not_owned = []
    
    # Use Lua script for atomic extension
    keys = [_key_for(showtime_id, int(sid)) for sid in seat_ids]
    
    try:
        extended_count = await redis.eval(EXTEND_LUA_SCRIPT, len(keys), *keys, owner, ttl_ms)
        extended_count = int(extended_count)
        
        # Determine which seats were extended
        if extended_count == len(seat_ids):
            extended = seat_ids
        elif extended_count > 0:
            # Need to check which ones were extended
            pipe = redis.pipeline()
            for seat_id in seat_ids:
                key = _key_for(showtime_id, seat_id)
                pipe.get(key)
            
            current_owners = await pipe.execute()
            for i, seat_id in enumerate(seat_ids):
                current_owner = current_owners[i]
                if current_owner and (current_owner.decode() if isinstance(current_owner, bytes) else current_owner) == owner:
                    extended.append(seat_id)
                else:
                    not_owned.append(seat_id)
        else:
            not_owned = seat_ids
            
    except Exception as e:
        logger.error(f"Error in extend_seat_locks Lua script: {e}")
        # Fallback to individual extension
        pipe = redis.pipeline()
        for seat_id in seat_ids:
            key = _key_for(showtime_id, seat_id)
            pipe.get(key)
        
        current_owners = await pipe.execute()
        
        pipe = redis.pipeline()
        for i, seat_id in enumerate(seat_ids):
            current_owner = current_owners[i]
            if current_owner and (current_owner.decode() if isinstance(current_owner, bytes) else current_owner) == owner:
                key = _key_for(showtime_id, seat_id)
                pipe.pexpire(key, ttl_ms)
                extended.append(seat_id)
            else:
                not_owned.append(seat_id)
        
        if extended:
            await pipe.execute()
    
    return {"extended": extended, "not_owned": not_owned, "ttl_ms": int(ttl_ms)}


async def release_seat_locks(
    redis,
    showtime_id: int,
    seat_ids: Optional[List[int]] = None,
    owner: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Release locks owned by `owner`.
    """
    released = []
    not_owned = []
    degraded = False

    # If Redis is not available, treat as successful release
    if redis is None:
        logger.warning("Redis unavailable - treating lock release as successful")
        if seat_ids:
            return {"released": seat_ids, "not_owned": [], "degraded": True}
        return {"released": [], "not_owned": [], "degraded": True}

    # If no seat_ids provided -> release all locks owned by owner for this showtime
    if not seat_ids:
        if not owner:
            return {"released": [], "not_owned": [], "degraded": True}
        
        pattern = _key_pattern(showtime_id)
        try:
            keys = []
            async for k in redis.scan_iter(match=pattern):
                key_str = k.decode() if isinstance(k, (bytes, bytearray)) else k
                keys.append(key_str)
        except Exception:
            logger.exception("Redis scan error while releasing seats")
            return {"released": [], "not_owned": [], "degraded": True}

        # Use Lua script for batch release
        try:
            released_count = await redis.eval(RELEASE_LUA_SCRIPT, len(keys), *keys, owner)
            released_count = int(released_count)
            
            # Extract seat_ids from released keys
            for key in keys:
                seat_id_str = key.split(':')[-1]
                if seat_id_str.isdigit():
                    released.append(int(seat_id_str))
            
            # We don't know which ones failed, so assume all succeeded
            logger.info(f"Released {released_count} locks for showtime {showtime_id}")
            
        except Exception as e:
            logger.error(f"Error in release Lua script: {e}")
            # Fallback to individual release
            pipe = redis.pipeline()
            for key in keys:
                pipe.get(key)
            
            owners = await pipe.execute()
            
            pipe = redis.pipeline()
            for key, current_owner in zip(keys, owners):
                if current_owner and (current_owner.decode() if isinstance(current_owner, bytes) else current_owner) == owner:
                    pipe.delete(key)
                    seat_id_str = key.split(':')[-1]
                    if seat_id_str.isdigit():
                        released.append(int(seat_id_str))
                else:
                    seat_id_str = key.split(':')[-1]
                    if seat_id_str.isdigit():
                        not_owned.append(int(seat_id_str))
            
            await pipe.execute()
        
        return {"released": released, "not_owned": not_owned, "degraded": False}

    # If seat_ids provided -> attempt release each
    keys = [_key_for(showtime_id, int(sid)) for sid in seat_ids]
    
    try:
        released_count = await redis.eval(RELEASE_LUA_SCRIPT, len(keys), *keys, owner or "")
        released_count = int(released_count)
        
        # For simplicity, assume all specified seats were released if count matches
        if released_count == len(seat_ids):
            released = seat_ids
        else:
            # Check which ones were actually released
            pipe = redis.pipeline()
            for key in keys:
                pipe.exists(key)
            
            exists_results = await pipe.execute()
            for i, seat_id in enumerate(seat_ids):
                if not exists_results[i]:
                    released.append(seat_id)
                else:
                    not_owned.append(seat_id)
                    
    except Exception as e:
        logger.error(f"Error in release Lua script for specific seats: {e}")
        # Fallback to individual release
        pipe = redis.pipeline()
        for seat_id in seat_ids:
            key = _key_for(showtime_id, seat_id)
            pipe.get(key)
        
        owners = await pipe.execute()
        
        pipe = redis.pipeline()
        for seat_id, current_owner in zip(seat_ids, owners):
            if current_owner and (current_owner.decode() if isinstance(current_owner, bytes) else current_owner) == owner:
                key = _key_for(showtime_id, seat_id)
                pipe.delete(key)
                released.append(seat_id)
            else:
                not_owned.append(seat_id)
        
        await pipe.execute()
    
    return {"released": released, "not_owned": not_owned, "degraded": False}


async def inspect_locks(redis, showtime_id: int, seat_ids: List[int]) -> List[Dict[str, Any]]:
    """
    Inspect owner and TTL for each seatId.
    """
    if not seat_ids:
        return []

    # If Redis is not available, return empty results
    if redis is None:
        return []

    keys = [_key_for(showtime_id, int(sid)) for sid in seat_ids]
    try:
        pipe = redis.pipeline()
        for k in keys:
            pipe.get(k)
            pipe.pttl(k)
        res = await pipe.execute()
    except Exception:
        logger.exception("Redis error during inspect")
        return []

    seats_info = []
    
    for i, sid in enumerate(seat_ids):
        get_val = res[2 * i]
        pttl_val = res[2 * i + 1]
        
        owner_decoded = None
        if get_val is not None:
            try:
                owner_decoded = get_val.decode() if isinstance(get_val, (bytes, bytearray)) else str(get_val)
            except Exception:
                owner_decoded = str(get_val)
                
        ttl_ms = None
        expires_at = None
        try:
            if isinstance(pttl_val, (int, float)) and int(pttl_val) > 0:
                ttl_ms = int(pttl_val)
                expires_at = int(time.time() * 1000) + ttl_ms
        except Exception:
            ttl_ms = None
            expires_at = None

        seats_info.append({
            "seatId": int(sid), 
            "owner": owner_decoded, 
            "ttl_ms": ttl_ms, 
            "expires_at": expires_at
        })

    return seats_info