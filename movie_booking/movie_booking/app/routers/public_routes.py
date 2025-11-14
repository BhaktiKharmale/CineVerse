# app/routers/public_routes.py
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query, Body, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import or_, text
from sqlalchemy.exc import ProgrammingError
from app.database.database import get_db
from app.database import models, schemas
from app.utils.poster_url import get_poster_full_url
from redis.asyncio import Redis
import asyncio
import time
import logging
from datetime import datetime, timezone
import json

# use the unified TLS-enabled client getter
from app.core.redis import get_redis, health_check_redis
from app.services import lock_service
from app.core.config import SEAT_LOCK_PREFIX  # ensure consistent prefix

logger = logging.getLogger(__name__)

# Router: DO NOT include "/api" here — main.py mounts this router under "/api"
router = APIRouter(tags=["Public"])

# -------------------------
# WebSocket Connection Manager for Real-time Seat Updates
# -------------------------
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[int, List[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, showtime_id: int):
        await websocket.accept()
        if showtime_id not in self.active_connections:
            self.active_connections[showtime_id] = []
        self.active_connections[showtime_id].append(websocket)
        logger.info(f"🔌 WebSocket connected for showtime {showtime_id}. Total connections: {len(self.active_connections[showtime_id])}")
    
    def disconnect(self, websocket: WebSocket, showtime_id: int):
        if showtime_id in self.active_connections:
            try:
                self.active_connections[showtime_id].remove(websocket)
            except ValueError:
                pass
            if not self.active_connections[showtime_id]:
                del self.active_connections[showtime_id]
            logger.info(f"🔌 WebSocket disconnected for showtime {showtime_id}")
    
    async def send_personal_message(self, message: dict, websocket: WebSocket):
        try:
            await websocket.send_json(message)
        except Exception as e:
            logger.error(f"Error sending WebSocket message: {e}")
    
    async def broadcast_to_showtime(self, showtime_id: int, message: dict):
        """
        Broadcast to all clients for a showtime.
        Sends messages concurrently and handles per-connection errors without
        tearing down other clients. Dead connections are pruned after attempts.
        """
        if showtime_id not in self.active_connections:
            return

        conns = list(self.active_connections.get(showtime_id, []))
        if not conns:
            return

        async def _safe_send(ws: WebSocket):
            try:
                await ws.send_json(message)
                return None
            except Exception as e:
                # return the exception for post-processing (don't re-raise here)
                return e

        tasks = [asyncio.create_task(_safe_send(c)) for c in conns]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # prune connections that failed
        for conn, res in zip(conns, results):
            if isinstance(res, Exception) or res is not None:
                try:
                    self.disconnect(conn, showtime_id)
                except Exception:
                    pass

# Create global connection manager instance
manager = ConnectionManager()

# Function to broadcast seat updates (call this from lock/unlock endpoints)
async def broadcast_seat_update(showtime_id: int):
    """Broadcast seat update to all connected clients for a showtime"""
    try:
        # Get current seat data with ownership information
        from app.database.database import get_db
        from sqlalchemy.orm import Session
        from app.database import models
        
        # Create a new database session for this broadcast
        db_gen = get_db()
        db = next(db_gen)
        
        try:
            # Try to generate the full seat map, but don't block too long
            try:
                seat_data = await asyncio.wait_for(_get_showtime_seats_impl(showtime_id, db, time.monotonic()), timeout=1.0)
            except asyncio.TimeoutError:
                logger.warning(f"⚠ [BROADCAST] seat generation timed out for showtime {showtime_id}")
                seat_data = None
            except Exception as e:
                logger.warning(f"⚠ [BROADCAST] seat generation error for showtime {showtime_id}: {e}")
                seat_data = None
            
            # Format the data for WebSocket - flatten the seats array if available
            flattened_seats = []
            if seat_data and 'sections' in seat_data:
                for section in seat_data.get('sections', []):
                    for row in section.get('rows', []):
                        for seat in row.get('seats', []):
                            flattened_seats.append({
                                'seat_id': seat['seat_id'],
                                'row': seat['row'],
                                'number': seat['num'],
                                'status': seat['status'],
                                'locked_by': seat.get('locked_by'),
                                'label': f"{seat['row']}{seat['num']}"
                            })
                message = {
                    'type': 'seat_update',
                    'seats': flattened_seats,
                    'showtime_id': showtime_id,
                    'timestamp': datetime.now(timezone.utc).isoformat()
                }
            else:
                # lightweight partial message instructing clients to refresh if needed
                message = {
                    'type': 'seat_update_partial',
                    'showtime_id': showtime_id,
                    'timestamp': datetime.now(timezone.utc).isoformat(),
                    'note': 'partial'
                }

            await manager.broadcast_to_showtime(showtime_id, message)
            logger.info(f"📢 Broadcast seat update for showtime {showtime_id} to {len(manager.active_connections.get(showtime_id, []))} clients")
        except Exception as e:
            logger.error(f"Error generating seat data for broadcast: {e}")
        finally:
            # Close the database session
            try:
                db.close()
            except Exception:
                pass
    except Exception as e:
        logger.error(f"Error in broadcast_seat_update: {e}")

async def broadcast_seat_locked(showtime_id: int, seat_id: int, owner: str):
    """Broadcast individual seat lock"""
    message = {
        'type': 'seat_locked',
        'seat': {
            'seat_id': seat_id,
            'status': 'locked',
            'locked_by': owner
        },
        'showtime_id': showtime_id,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    await manager.broadcast_to_showtime(showtime_id, message)

async def broadcast_seat_released(showtime_id: int, seat_id: int):
    """Broadcast individual seat release"""
    message = {
        'type': 'seat_released', 
        'seat': {
            'seat_id': seat_id,
            'status': 'available'
        },
        'showtime_id': showtime_id,
        'timestamp': datetime.now(timezone.utc).isoformat()
    }
    await manager.broadcast_to_showtime(showtime_id, message)


# -------------------------
# GET /movies
# -------------------------
@router.get("/movies")
def list_movies(db: Session = Depends(get_db)):
    try:
        movies = db.query(models.Movie).all()
        result = []
        for m in movies:
            try:
                poster_url = get_poster_full_url(m.poster_url)
                result.append({
                    "id": m.id,
                    "title": m.title,
                    "description": m.synopsis,
                    "synopsis": m.synopsis,
                    "duration": m.runtime,
                    "runtime": m.runtime,
                    "language": m.language,
                    "rating": m.rating,
                    "poster_url": poster_url,
                    "trailer_url": m.trailer_url,
                    "release_date": m.release_date.isoformat() if m.release_date is not None else None,
                    "genre": m.tags,
                    "tags": m.tags,
                })
            except Exception as e:
                logger.error(f"Error processing movie {m.id}: {e}")
                continue
        return result
    except Exception as e:
        logger.error(f"Error in /movies: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error fetching movies: {str(e)}")


# -------------------------
# GET /movies/{movie_id}
# -------------------------
@router.get("/movies/{movie_id}")
def get_movie(movie_id: int, db: Session = Depends(get_db)):
    m = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if m is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movie not found")
    poster_url = get_poster_full_url(m.poster_url)
    return {
        "id": m.id,
        "title": m.title,
        "description": m.synopsis,
        "synopsis": m.synopsis,
        "duration": m.runtime,
        "runtime": m.runtime,
        "language": m.language,
        "rating": m.rating,
        "poster_url": poster_url,
        "trailer_url": m.trailer_url,
        "release_date": m.release_date.isoformat() if m.release_date is not None else None,
        "genre": m.tags,
        "tags": m.tags,
    }


# -------------------------
# GET /theatres/{theatre_id}/movies
# -------------------------
@router.get("/theatres/{theatre_id}/movies")
def get_movies_by_theatre(theatre_id: int, db: Session = Depends(get_db)):
    theatre = db.query(models.Theatre).filter(models.Theatre.id == theatre_id).first()
    if theatre is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Theatre not found")

    movies_set: Dict[int, Any] = {}
    if hasattr(theatre, "showtimes"):
        showtimes_attr = getattr(theatre, "showtimes", None)
        if showtimes_attr is not None:
            for st in showtimes_attr:
                movie = getattr(st, "movie", None)
                if movie is not None:
                    movies_set[movie.id] = movie
    else:
        showtimes = db.query(models.Showtime).filter(models.Showtime.theatre_id == theatre_id).all()
        for st in showtimes:
            if getattr(st, "movie_id", None):
                mv = db.query(models.Movie).filter(models.Movie.id == st.movie_id).first()
                if mv is not None:
                    movies_set[mv.id] = mv

    movies = []
    for m in movies_set.values():
        movies.append({"id": m.id, "title": getattr(m, "title", None), "duration": getattr(m, "duration", None)})
    return movies


# -------------------------
# GET /movies/{movie_id}/showtimes
# -------------------------
@router.get("/movies/{movie_id}/showtimes")
def get_movie_showtimes(
    movie_id: int,
    date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD). If not provided, returns all future showtimes."),
    db: Session = Depends(get_db)
):
    from datetime import datetime, timedelta
    logger.info(f"🔍 GET /movies/{movie_id}/showtimes - Request received (date={date})")
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if movie is None:
        logger.warning(f"❌ Movie {movie_id} not found")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Movie not found")

    query = db.query(models.Showtime).filter(models.Showtime.movie_id == movie_id)
    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
            start_of_day = datetime.combine(target_date, datetime.min.time())
            end_of_day = datetime.combine(target_date, datetime.max.time())
            query = query.filter(
                models.Showtime.start_time >= start_of_day,
                models.Showtime.start_time < end_of_day + timedelta(days=1)
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        now = datetime.utcnow()
        query = query.filter(models.Showtime.start_time >= now)

    showtimes = query.all()
    logger.info(f"✓ Found {len(showtimes)} showtimes for movie_id={movie_id} (date={date})")

    if not showtimes:
        return {"movie_id": movie_id, "date": date, "theatres": []}

    theatre_ids = set(s.theatre_id for s in showtimes if getattr(s, "theatre_id", None))
    theatres_map = {}
    if theatre_ids:
        theatres_query = db.query(models.Theatre.id, models.Theatre.name)\
            .filter(models.Theatre.id.in_(theatre_ids)).all()
        for t_id, t_name in theatres_query:
            theatres_map[t_id] = {"id": t_id, "name": t_name, "location": None}

    theatres_dict: Dict[int, Any] = {}
    for s in showtimes:
        theatre_id = getattr(s, "theatre_id", None)
        if not theatre_id:
            continue
        theatre_info = theatres_map.get(theatre_id)
        if not theatre_info:
            continue
        if theatre_id not in theatres_dict:
            theatres_dict[theatre_id] = {
                "theatre_id": theatre_id,
                "theatre_name": theatre_info["name"],
                "location": theatre_info.get("location"),
                "times": []
            }
        start_time = getattr(s, "start_time", None) or getattr(s, "starts_at", None)
        total_capacity = 216
        # NOTE: some codebases use Booking.show_id vs Booking.showtime_id — adjust if your DB column differs
        booked_count = db.query(models.Booking).filter(models.Booking.show_id == s.id).count()
        available_seats = total_capacity - booked_count
        showtime_status = "available"
        if available_seats <= 0:
            showtime_status = "sold_out"
        elif start_time and start_time < datetime.utcnow():
            showtime_status = "lapsed"
        elif available_seats < total_capacity * 0.3:
            showtime_status = "filling_fast"
        theatres_dict[theatre_id]["times"].append({
            "showtime_id": s.id,
            "start_time": start_time.isoformat() if start_time else None,
            "price": getattr(s, "price", None),
            "available_seats": available_seats,
            "capacity": total_capacity,
            "status": showtime_status,
            "language": getattr(s, "language", None),
            "format": getattr(s, "format", None),
        })

    theatres_list = sorted(theatres_dict.values(), key=lambda x: x["theatre_name"] or "")
    date_used = date if date else None
    if not date_used and showtimes:
        first_showtime = showtimes[0]
        st_dt = getattr(first_showtime, "start_time", None) or getattr(first_showtime, "starts_at", None)
        if st_dt:
            date_used = st_dt.date().isoformat()

    return {"movie_id": movie_id, "date": date_used, "theatres": theatres_list}


# -------------------------
# GET /movies/search?q=...
# -------------------------
@router.get("/movies/search")
def search_movies(q: Optional[str] = Query(None, description="search query for movies"), db: Session = Depends(get_db)):
    if not q:
        return []
    q_like = f"%{q}%"
    title_col = getattr(models.Movie, "title", None)
    desc_col = getattr(models.Movie, "description", None)
    filters = []
    if title_col is not None:
        filters.append(title_col.ilike(q_like))
    if desc_col is not None:
        filters.append(desc_col.ilike(q_like))
    if not filters:
        return []
    movies = db.query(models.Movie).filter(or_(*filters)).all()
    return [{"id": m.id, "title": getattr(m, "title", None), "description": getattr(m, "description", None)} for m in movies]


# -------------------------
# GET /movies/featured
# -------------------------
@router.get("/movies/featured")
def featured_movies(db: Session = Depends(get_db)):
    if hasattr(models.Movie, "is_featured"):
        movies = db.query(models.Movie).filter(models.Movie.is_featured == True).all()
    elif hasattr(models.Movie, "featured"):
        movies = db.query(models.Movie).filter(models.Movie.featured == True).all()
    else:
        movies = []
    return [{"id": m.id, "title": getattr(m, "title", None)} for m in movies]


# -------------------------
# GET /theatres
# -------------------------
@router.get("/theatres")
def list_theatres(db: Session = Depends(get_db)):
    try:
        theatres = db.query(models.Theatre).all()
    except ProgrammingError as exc:
        logger.warning("⚠️ Falling back to raw theatre query due to schema mismatch: %s", exc)
        db.rollback()
        fallback_rows = db.execute(text("SELECT id, name, location_id FROM theatres")).fetchall()
        result: List[Dict[str, Any]] = []
        for row in fallback_rows:
            result.append({
                "id": row.id,
                "name": row.name,
                "location": None,
                "screens": None,
                "location_id": getattr(row, "location_id", None),
            })
        return result

    result = []
    for t in theatres:
        showtimes_attr = getattr(t, "showtimes", None) if hasattr(t, "showtimes") else None
        screens_count = None
        if showtimes_attr is not None:
            try:
                screens_count = len(showtimes_attr)
            except Exception:
                screens_count = None
        result.append({
            "id": t.id,
            "name": getattr(t, "name", None),
            "location_id": getattr(t, "location_id", None),
            "screens": screens_count,
        })
    return result


# -------------------------
# GET /showtimes/{showtime_id}
# -------------------------
@router.get("/showtimes/{showtime_id}")
def get_showtime(showtime_id: int, db: Session = Depends(get_db)):
    s = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
    if s is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Showtime not found")

    movie = None
    if getattr(s, "movie_id", None):
        movie = db.query(models.Movie).filter(models.Movie.id == s.movie_id).first()

    theatre = None
    if getattr(s, "theatre_id", None):
        theatre = db.query(models.Theatre).filter(models.Theatre.id == s.theatre_id).first()

    start_time = getattr(s, "start_time", None) or getattr(s, "starts_at", None)
    end_time = getattr(s, "end_time", None)

    return {
        "id": s.id,
        "movie_id": getattr(s, "movie_id", None),
        "theatre_id": getattr(s, "theatre_id", None),
        "start_time": start_time.isoformat() if start_time is not None else None,
        "end_time": end_time.isoformat() if end_time is not None else None,
        "pricing": {"premium": 350, "regular": 250},
        "movie": {
            "id": getattr(movie, "id", None),
            "title": getattr(movie, "title", None),
            "poster_url": get_poster_full_url(getattr(movie, "poster_url", None)) if movie else None,
            "runtime": getattr(movie, "runtime", None),
            "language": getattr(movie, "language", None),
            "rating": getattr(movie, "rating", None),
        } if movie else None,
        "theatre": {
            "id": getattr(theatre, "id", None),
            "name": getattr(theatre, "name", None),
            "location_id": getattr(theatre, "location_id", None),
        } if theatre else None,
    }


# -------------------------
# Seat layout template cache
# -------------------------
_SEAT_LAYOUT_CACHE: Dict[str, Any] = {}

def _generate_seat_layout_template(theatre_id: int, showtime_id: int):
    cache_key = f"theatre:{theatre_id}"
    if cache_key in _SEAT_LAYOUT_CACHE:
        cached_map, cached_premium, cached_regular = _SEAT_LAYOUT_CACHE[cache_key]
        seat_map: Dict[tuple, int] = {}
        seat_id_counter = showtime_id * 10000

        premium_seats = []
        for seat in cached_premium:
            new_seat_id = seat_id_counter + len(seat_map)
            seat_key = (seat["row"], seat["num"])
            seat_map[seat_key] = new_seat_id
            premium_seats.append({"seat_id": new_seat_id, "num": seat["num"], "row": seat["row"], "status": "available"})

        regular_seats = []
        for seat in cached_regular:
            new_seat_id = seat_id_counter + len(seat_map)
            seat_key = (seat["row"], seat["num"])
            seat_map[seat_key] = new_seat_id
            regular_seats.append({"seat_id": new_seat_id, "num": seat["num"], "row": seat["row"], "status": "available"})
        return seat_map, premium_seats, regular_seats

    premium_rows = ["A", "B", "C", "D", "E", "F"]
    regular_rows = ["G", "H", "I", "J", "K", "L"]
    seats_per_row = 18

    base_premium = [{"row": row, "num": num} for row in premium_rows for num in range(1, seats_per_row + 1)]
    base_regular = [{"row": row, "num": num} for row in regular_rows for num in range(1, seats_per_row + 1)]
    _SEAT_LAYOUT_CACHE[cache_key] = (None, base_premium, base_regular)
    return _generate_seat_layout_template(theatre_id, showtime_id)


# -------------------------
# GET /showtimes/{showtime_id}/seats
# -------------------------
@router.get("/showtimes/{showtime_id}/seats")
async def get_showtime_seats(showtime_id: int, db: Session = Depends(get_db)):
    start_time = time.monotonic()
    logger.info(f"🔍 [SEAT-MAP] GET /showtimes/{showtime_id}/seats - Request received")
    try:
        return await asyncio.wait_for(_get_showtime_seats_impl(showtime_id, db, start_time), timeout=5.0)
    except asyncio.TimeoutError:
        duration_ms = (time.monotonic() - start_time) * 1000
        logger.error(f"❌ [SEAT-MAP] Timeout after {duration_ms:.0f}ms for showtime {showtime_id}")
        return {
            "showtime_id": showtime_id,
            "sections": [],
            "seat_map_unavailable": True,
            "error": "Seat map generation timed out. Please try again."
        }
    except Exception as e:
        duration_ms = (time.monotonic() - start_time) * 1000
        logger.error(f"❌ [SEAT-MAP] Error after {duration_ms:.0f}ms for showtime {showtime_id}: {e}")
        raise


async def _get_showtime_seats_impl(showtime_id: int, db: Session, start_time: float):
    step_start = time.monotonic()
    showtime = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
    db_time_ms = (time.monotonic() - step_start) * 1000
    if showtime is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Showtime not found")

    theatre_id = showtime.theatre_id
    logger.info(f"✓ [SEAT-MAP] Showtime {showtime_id} found (movie_id={showtime.movie_id}, theatre_id={theatre_id}) [db={db_time_ms:.1f}ms]")

    step_start = time.monotonic()
    seat_map, premium_seats, regular_seats = _generate_seat_layout_template(theatre_id, showtime_id)
    template_time_ms = (time.monotonic() - step_start) * 1000

    step_start = time.monotonic()
    bookings = db.query(models.Booking).filter(models.Booking.show_id == showtime_id).all()
    booked_seat_ids = set()
    for booking in bookings:
        seat_numbers_str = getattr(booking, "seat_numbers", None)
        if seat_numbers_str and isinstance(seat_numbers_str, str) and seat_numbers_str.strip():
            seat_numbers = seat_numbers_str.split(",")
            for seat_num in seat_numbers:
                try:
                    seat_id = int(seat_num.strip())
                    booked_seat_ids.add(seat_id)
                except ValueError:
                    for key, sid in seat_map.items():
                        if f"{key[0]}{key[1]}" == seat_num.strip():
                            booked_seat_ids.add(sid)
                            break
    bookings_time_ms = (time.monotonic() - step_start) * 1000

    locked_seat_ids = set()
    locked_seat_owners: Dict[int, str] = {}  # Track seat owners
    redis_time_ms = 0
    step_start = time.monotonic()
    try:
        # OPTIMIZED: Use MGET for bulk operations instead of individual GETs
        redis = await asyncio.wait_for(get_redis(), timeout=0.3)
        
        prefix = f"{SEAT_LOCK_PREFIX}" if SEAT_LOCK_PREFIX else ""
        if prefix and not prefix.endswith(":"):
            prefix = prefix + ":"

        seat_ids_ordered = list(seat_map.values())
        lock_keys = [f"{prefix}seat_lock:{showtime_id}:{seat_id}" for seat_id in seat_ids_ordered]

        # OPTIMIZED: Use MGET to get all values in one call, then check TTL only for non-None values
        try:
            # Batch MGET operation - much faster than individual GETs (1 call instead of N calls)
            # Use shorter timeout and handle gracefully
            try:
                values = await asyncio.wait_for(redis.mget(lock_keys), timeout=0.2)
            except asyncio.TimeoutError:
                # If MGET times out, skip lock status (seats will show as available)
                redis_time_ms = (time.monotonic() - step_start) * 1000
                logger.warning(f"⚠ [SEAT-MAP] Redis MGET timeout after {redis_time_ms:.1f}ms - skipping lock status")
                values = [None] * len(lock_keys)
            
            # Only check TTL for seats that have values (are locked) - this reduces operations significantly
            locked_indices = [i for i, val in enumerate(values) if val is not None]
            
            if locked_indices:
                # Only check TTL for locked seats (much fewer operations than checking all seats)
                # Batch TTL checks in smaller chunks to avoid timeouts
                chunk_size = 50  # Process 50 seats at a time
                all_ttls = []
                
                for chunk_start in range(0, len(locked_indices), chunk_size):
                    chunk_indices = locked_indices[chunk_start:chunk_start + chunk_size]
                    pipe = redis.pipeline()
                    for idx in chunk_indices:
                        pipe.pttl(lock_keys[idx])
                    
                    try:
                        chunk_ttls = await asyncio.wait_for(pipe.execute(), timeout=0.15)
                        all_ttls.extend(chunk_ttls)
                    except asyncio.TimeoutError:
                        # If TTL check times out, assume seats are locked (conservative approach)
                        all_ttls.extend([1] * len(chunk_indices))
                
                ttls = all_ttls
                
                # Process results
                for j, idx in enumerate(locked_indices):
                    if idx < len(seat_ids_ordered):
                        seat_id = seat_ids_ordered[idx]
                        ttl = ttls[j] if j < len(ttls) else None
                        owner = values[idx]
                        
                        # Only add if TTL > 0 (seat is still locked)
                        if ttl and ttl > 0:
                            locked_seat_ids.add(seat_id)
                            if owner:
                                try:
                                    locked_seat_owners[seat_id] = owner.decode('utf-8') if isinstance(owner, (bytes, bytearray)) else str(owner)
                                except Exception:
                                    locked_seat_owners[seat_id] = str(owner)
                            
        except Exception as e:
            redis_time_ms = (time.monotonic() - step_start) * 1000
            logger.warning(f"⚠ [SEAT-MAP] Redis error after {redis_time_ms:.1f}ms: {e} - continuing without lock status")

        redis_time_ms = (time.monotonic() - step_start) * 1000
        logger.debug(f"✓ [SEAT-MAP] Redis check completed: {len(locked_seat_ids)} locked seats [redis={redis_time_ms:.1f}ms]")
    except asyncio.CancelledError:
        raise
    except Exception as e:
        redis_time_ms = (time.monotonic() - step_start) * 1000
        logger.warning(f"⚠ [SEAT-MAP] Redis error after {redis_time_ms:.1f}ms: {e} - continuing without lock status")

    def update_seat_status(seat: dict):
        seat_id = seat["seat_id"]
        if seat_id in booked_seat_ids:
            seat["status"] = "booked"
        elif seat_id in locked_seat_ids:
            seat["status"] = "locked"
            # Add owner information if available
            if seat_id in locked_seat_owners:
                seat["locked_by"] = locked_seat_owners[seat_id]
        return seat

    premium_seats = [update_seat_status(s) for s in premium_seats]
    regular_seats = [update_seat_status(s) for s in regular_seats]

    sections = []
    if premium_seats:
        premium_rows_dict: Dict[str, List[dict]] = {}
        for seat in premium_seats:
            premium_rows_dict.setdefault(seat["row"], []).append(seat)
        sections.append({
            "name": "Premium",
            "price": 350,
            "rows": [{"row": row, "seats": sorted(premium_rows_dict[row], key=lambda s: s["num"])}
                     for row in sorted(premium_rows_dict.keys())]
        })
    if regular_seats:
        regular_rows_dict: Dict[str, List[dict]] = {}
        for seat in regular_seats:
            regular_rows_dict.setdefault(seat["row"], []).append(seat)
        sections.append({
            "name": "Regular",
            "price": 250,
            "rows": [{"row": row, "seats": sorted(regular_rows_dict[row], key=lambda s: s["num"])}
                     for row in sorted(regular_rows_dict.keys())]
        })

    total_seats = sum(len(row["seats"]) for section in sections for row in section["rows"])
    if not sections or sum(len(s["rows"]) for s in sections) == 0:
        logger.error(f"❌ [SEAT-MAP] Generated empty seat layout for showtime {showtime_id}")
        raise HTTPException(status_code=500, detail="Seat layout generation failed. Please contact support.")

    total_time_ms = (time.monotonic() - start_time) * 1000
    logger.info(
        f"✓ [SEAT-MAP] Completed for showtime {showtime_id}: "
        f"{len(sections)} sections, {total_seats} seats, "
        f"{len(booked_seat_ids)} booked, {len(locked_seat_ids)} locked "
        f"[total={total_time_ms:.1f}ms, db={db_time_ms:.1f}ms, template={template_time_ms:.1f}ms, "
        f"bookings={bookings_time_ms:.1f}ms, redis={redis_time_ms:.1f}ms]"
    )
    return {"showtime_id": showtime_id, "sections": sections}


# -------------------------
# POST /showtimes/{showtime_id}/lock-seats (DB fallback)
# -------------------------
@router.post("/showtimes/{showtime_id}/lock-seats")
def lock_seats(
    showtime_id: int,
    payload: schemas.LockSeatsRequest,
    db: Session = Depends(get_db)
):
    seat_ids: List[int] = payload.seat_ids
    if not seat_ids:
        raise HTTPException(status_code=400, detail="seat_ids list is required")

    st = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
    if st is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Showtime not found")

    locked = []
    if hasattr(models, "Seat"):
        if getattr(models.Seat, "showtime_id", None) is not None:
            seats = db.query(models.Seat).filter(models.Seat.id.in_(seat_ids), models.Seat.showtime_id == showtime_id).all()
        else:
            seats = db.query(models.Seat).filter(models.Seat.id.in_(seat_ids)).all()
            seats = [s for s in seats if getattr(s, "showtime_id", None) == showtime_id]

        for s in seats:
            if hasattr(s, "locked"):
                setattr(s, "locked", True)
            elif hasattr(s, "status"):
                try:
                    setattr(s, "status", "locked")
                except Exception:
                    pass
            else:
                try:
                    setattr(s, "locked", True)
                except Exception:
                    pass
            locked.append({"id": s.id, "status": getattr(s, "status", None) or ("locked" if getattr(s, "locked", False) else "unknown")})
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(status_code=500, detail="Failed to lock seats (db commit error)")
    else:
        seats_list = getattr(st, "seats", None) or []
        for s in seats_list:
            if getattr(s, "id", None) in seat_ids:
                if hasattr(s, "locked"):
                    setattr(s, "locked", True)
                elif hasattr(s, "status"):
                    setattr(s, "status", "locked")
                locked.append({"id": s.id, "status": getattr(s, "status", None) or ("locked" if getattr(s, "locked", False) else "unknown")})
        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(status_code=500, detail="Failed to lock seats (db commit error)")

    return {"locked": locked, "count": len(locked)}


# -------------------------
# Redis Seat Locking Endpoints
# -------------------------
@router.post("/showtimes/{showtime_id}/redis-lock-seats", response_model=schemas.RedisLockSeatsResponse)
async def redis_lock_seats(
    showtime_id: int,
    payload: schemas.RedisLockSeatsRequest,
    redis: Redis = Depends(get_redis),
    db: Session = Depends(get_db)
):
    st = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
    if st is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Showtime not found")

    # Acquire locks atomically via lock_service
    result = await lock_service.acquire_seat_locks(
        redis=redis,
        showtime_id=showtime_id,
        seat_ids=payload.seat_ids,
        owner=payload.owner,
        ttl_ms=payload.ttl_ms
    )

    # Normalize locked entries into a list (they may be ints or dicts)
    raw_locked_entries = result.get("locked", []) or []
    locked_ids_for_broadcast: List[int] = []
    for entry in raw_locked_entries:
        try:
            if isinstance(entry, dict):
                sid = entry.get("seatId") or entry.get("seat_id") or entry.get("id")
            else:
                sid = entry
            if sid is None:
                continue
            locked_ids_for_broadcast.append(int(sid))
        except Exception:
            # ignore malformed entries
            continue

    # Broadcast seat updates if locks were successful (only when there are locked ids and no conflicts)
    # OPTIMIZED: Broadcast individual seat locks only (faster than full seat map update)
    if locked_ids_for_broadcast and not result.get("conflicts"):
        # Broadcast individual seat locks (lightweight, doesn't require full seat map generation)
        for seat_id in locked_ids_for_broadcast:
            try:
                asyncio.create_task(broadcast_seat_locked(showtime_id, int(seat_id), payload.owner))
            except Exception:
                logger.exception("Failed to schedule broadcast for seat lock")
        
        # OPTIONAL: Broadcast full seat update in background (can be slow, so do it async)
        # Only if there are connected clients to avoid unnecessary work
        if showtime_id in manager.active_connections and len(manager.active_connections[showtime_id]) > 0:
            asyncio.create_task(broadcast_seat_update(showtime_id))

    # conflicts -> 409 (keep behavior)
    if result.get("conflicts"):
        conflicts = result.get("conflicts") or []
        # normalize numeric fields for client convenience
        ttl_ms_val = int(result.get("ttl_ms", 180000))
        expires_raw = result.get("expires_at")
        expires_at_num = None
        try:
            if isinstance(expires_raw, (int, float)):
                expires_at_num = int(expires_raw)
            elif isinstance(expires_raw, str):
                try:
                    dt = datetime.fromisoformat(expires_raw)
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=timezone.utc)
                    expires_at_num = int(dt.timestamp() * 1000)
                except Exception:
                    try:
                        expires_at_num = int(float(expires_raw))
                    except Exception:
                        expires_at_num = None
        except Exception:
            expires_at_num = None

        if expires_at_num is None:
            expires_at_num = int(time.time() * 1000) + ttl_ms_val

        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "Some seats are already locked by other users",
                "conflicts": conflicts,
                "locked": result.get("locked"),
                "ttl_ms": ttl_ms_val,
                "expires_at": expires_at_num,
            }
        )

    # success path — ensure ttl_ms & expires_at numeric types (Pydantic expects numbers)
    ttl_ms_val = int(result.get("ttl_ms", 180000))
    expires_raw = result.get("expires_at")
    expires_at_num = None
    try:
        if isinstance(expires_raw, (int, float)):
            expires_at_num = int(expires_raw)
        elif isinstance(expires_raw, str):
            try:
                dt = datetime.fromisoformat(expires_raw)
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                expires_at_num = int(dt.timestamp() * 1000)
            except Exception:
                try:
                    # maybe the service returned epoch seconds as string
                    expires_at_num = int(float(expires_raw))
                except Exception:
                    expires_at_num = None
    except Exception:
        expires_at_num = None

    if expires_at_num is None:
        expires_at_num = int(time.time() * 1000) + ttl_ms_val

    # Convert locked entries to a list[int] for the response model
    locked_ids_for_response: List[int] = []
    for entry in raw_locked_entries:
        try:
            if isinstance(entry, dict):
                sid = entry.get("seatId") or entry.get("seat_id") or entry.get("id")
            else:
                sid = entry
            if sid is None:
                continue
            locked_ids_for_response.append(int(sid))
        except Exception:
            continue

    # return Pydantic model with locked: List[int]
    return schemas.RedisLockSeatsResponse(
        success=bool(result.get("success", False)),
        locked=locked_ids_for_response,
        conflicts=result.get("conflicts", []) or [],
        ttl_ms=ttl_ms_val,
        expires_at=expires_at_num,
        showtime_id=showtime_id
    )


@router.post("/showtimes/{showtime_id}/redis-unlock-seats")
async def redis_unlock_seats(
    showtime_id: int,
    payload: Dict[str, Any] = Body(...),
    redis: Redis = Depends(get_redis),
    db: Session = Depends(get_db)
):
    """
    Flexible unlock:
      - Accepts owner and optional seat_ids OR seats[{seatId}] OR lockId (ignored server-side).
      - If seat_ids are omitted, releases **all seats for this showtime owned by `owner`**.
      - Always returns 200; adds {"degraded": true} if Redis was unreachable.
    """
    st = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
    if st is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Showtime not found")

    owner = payload.get("owner")
    if not owner:
        # Some clients send only lockId; we cannot map lockId server-side → treat as success (idempotent)
        return {"released": [], "not_owned": [], "showtime_id": showtime_id, "ok": True}

    # normalize seats
    seat_ids: Optional[List[int]] = None
    if "seat_ids" in payload and isinstance(payload["seat_ids"], list):
        seat_ids = [int(s) for s in payload["seat_ids"] if str(s).isdigit()]
    elif "seats" in payload and isinstance(payload["seats"], list):
        tmp = []
        for s in payload["seats"]:
            if isinstance(s, dict) and ("seatId" in s or "seat_id" in s):
                val = s.get("seatId", s.get("seat_id"))
                try:
                    tmp.append(int(val))
                except Exception:
                    pass
        seat_ids = tmp if tmp else None

    # perform unlock with graceful degrade
    try:
        result = await lock_service.release_seat_locks(
            redis=redis,
            showtime_id=showtime_id,
            seat_ids=seat_ids,   # may be None → release all for owner
            owner=owner
        )
        
        # Broadcast seat updates if seats were released
        released_seats = result.get("released", [])
        if released_seats:
            # Use asyncio.create_task to avoid blocking the response
            asyncio.create_task(broadcast_seat_update(showtime_id))
            # Also broadcast individual seat releases
            for seat_id in released_seats:
                try:
                    sid = int(seat_id) if not isinstance(seat_id, dict) else int(seat_id.get("seatId") or seat_id.get("seat_id") or seat_id.get("id"))
                    asyncio.create_task(broadcast_seat_released(showtime_id, sid))
                except Exception:
                    logger.exception("Failed to schedule broadcast for seat release")
        
        # Do NOT 403; just return what we could release (keeps UI smooth)
        return {"released": released_seats, "not_owned": result.get("not_owned", []), "showtime_id": showtime_id, "ok": True}
    except Exception as e:
        logger.error(f"Error releasing locks (graceful): {e}")
        # degrade gracefully to avoid 500s if Redis blips
        return {"released": [], "not_owned": [], "showtime_id": showtime_id, "ok": True, "degraded": True}


@router.post("/showtimes/{showtime_id}/redis-extend-locks", response_model=schemas.RedisExtendLocksResponse)
async def redis_extend_locks(
    showtime_id: int,
    payload: schemas.RedisExtendLocksRequest,
    redis: Redis = Depends(get_redis),
    db: Session = Depends(get_db)
):
    st = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
    if st is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Showtime not found")

    result = await lock_service.extend_seat_locks(
        redis=redis,
        showtime_id=showtime_id,
        seat_ids=payload.seat_ids,
        owner=payload.owner,
        ttl_ms=payload.ttl_ms
    )
    
    # Broadcast update if locks were extended
    extended_seats = result.get("extended", [])
    if extended_seats:
        asyncio.create_task(broadcast_seat_update(showtime_id))
    
    # don't 403; just report not_owned to client
    return schemas.RedisExtendLocksResponse(
        extended=extended_seats,
        not_owned=result.get("not_owned", []),
        ttl_ms=int(result.get("ttl_ms", 180000)),
        showtime_id=showtime_id
    )


@router.get("/showtimes/{showtime_id}/redis-inspect-locks", response_model=schemas.RedisInspectLocksResponse)
async def redis_inspect_locks(
    showtime_id: int,
    seat_ids: str = Query(..., description="Comma-separated seat IDs, e.g., '101,102,103'"),
    redis: Redis = Depends(get_redis),
    db: Session = Depends(get_db)
):
    st = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
    if st is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Showtime not found")

    try:
        seat_id_list = [int(s.strip()) for s in seat_ids.split(",")]
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid seat_ids format")

    seats = await lock_service.inspect_locks(redis=redis, showtime_id=showtime_id, seat_ids=seat_id_list)
    return schemas.RedisInspectLocksResponse(showtime_id=showtime_id, seats=seats)


# -------------------------
# WebSocket Endpoint for Real-time Seat Updates
# -------------------------
@router.websocket("/showtimes/{showtime_id}/seats/ws")
async def websocket_endpoint(websocket: WebSocket, showtime_id: int):
    """
    WebSocket endpoint for real-time seat updates
    Clients can connect to receive live seat status changes
    
    Authentication: Optional - token can be passed in query string (?token=...)
    If token is provided and invalid, connection will be rejected with 403.
    If no token is provided, connection is allowed (public access for seat updates).
    """
    showtime_id_int = None
    db = None
    
    # Log connection attempt with headers for debugging
    logger.info(f"🔌 WebSocket connection attempt for showtime {showtime_id}")
    logger.debug(f"WebSocket headers: {dict(websocket.headers)}")
    logger.debug(f"WebSocket query params: {dict(websocket.query_params)}")
    
    # IMPORTANT: Accept the connection FIRST before any validation
    # You cannot close a WebSocket before accepting it
    try:
        await websocket.accept()
        logger.info(f"✅ WebSocket connection accepted for showtime {showtime_id}")
    except Exception as e:
        logger.error(f"❌ Failed to accept WebSocket connection for showtime {showtime_id}: {e}", exc_info=True)
        # Connection not accepted, nothing to close
        return
    
    # Validate showtime_id format (simple validation, no DB needed)
    try:
        showtime_id_int = int(showtime_id)
        logger.debug(f"Validated showtime_id: {showtime_id_int}")
    except ValueError:
        logger.warning(f"Invalid showtime_id format: {showtime_id}")
        try:
            await websocket.close(code=1008, reason="Invalid showtime ID")
        except Exception as close_err:
            logger.error(f"Failed to close WebSocket after validation error: {close_err}")
        return
    
    # Optional: Validate token if provided (for future authentication)
    # FIXED: Allow connections even with expired tokens - this is a public endpoint for seat updates
    token = websocket.query_params.get("token")
    if token:
        try:
            from app.auth import decode_access_token
            # Try to decode token - if invalid, log but don't reject (public endpoint)
            decoded = decode_access_token(token)
            logger.debug(f"WebSocket connection authenticated for user: {decoded.get('sub')}")
        except Exception as e:
            # Log warning but allow connection - seat updates are public
            logger.debug(f"Token provided but invalid/expired for WebSocket connection: {e} - allowing public access")
    else:
        logger.debug(f"WebSocket connection without authentication (public access)")
    
    # Check if showtime exists (now safe to close if needed since connection is accepted)
    try:
        db_gen = get_db()
        db = next(db_gen)
        try:
            showtime = db.query(models.Showtime).filter(models.Showtime.id == showtime_id_int).first()
            if not showtime:
                logger.warning(f"Showtime {showtime_id_int} not found in database")
                try:
                    # Check if connection is still open before closing
                    await websocket.close(code=1008, reason="Showtime not found")
                except (WebSocketDisconnect, RuntimeError) as close_err:
                    # Connection already closed, that's fine
                    logger.debug(f"WebSocket already closed when trying to close after showtime not found: {close_err}")
                except Exception as close_err:
                    logger.error(f"Failed to close WebSocket after showtime not found: {close_err}")
                return
            logger.debug(f"Showtime {showtime_id_int} validated successfully")
        except Exception as e:
            logger.error(f"Error validating showtime {showtime_id_int}: {e}", exc_info=True)
            try:
                await websocket.close(code=1011, reason="Internal server error")
            except (WebSocketDisconnect, RuntimeError):
                # Connection already closed, that's fine
                logger.debug("WebSocket already closed when trying to close after validation error")
            except Exception as close_err:
                logger.error(f"Failed to close WebSocket after validation error: {close_err}")
            return
        finally:
            # Close database connection if it was opened
            if db is not None:
                try:
                    db.close()
                except Exception as db_err:
                    logger.debug(f"Error closing database connection: {db_err}")
    except Exception as e:
        logger.error(f"Error getting database connection for showtime {showtime_id_int}: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Database connection error")
        except (WebSocketDisconnect, RuntimeError):
            # Connection already closed, that's fine
            logger.debug("WebSocket already closed when trying to close after DB error")
        except Exception as close_err:
            logger.error(f"Failed to close WebSocket after DB error: {close_err}")
        return
    
    # Add connection to manager (connection already accepted above)
    try:
        if showtime_id_int not in manager.active_connections:
            manager.active_connections[showtime_id_int] = []
        manager.active_connections[showtime_id_int].append(websocket)
        logger.info(f"🔌 WebSocket connected for showtime {showtime_id_int}. Total connections: {len(manager.active_connections[showtime_id_int])}")
    except Exception as e:
        logger.error(f"Failed to register WebSocket connection: {e}", exc_info=True)
        try:
            await websocket.close(code=1011, reason="Connection registration failed")
        except (WebSocketDisconnect, RuntimeError):
            # Connection already closed, that's fine
            logger.debug("WebSocket already closed when trying to close after registration error")
        except Exception as close_err:
            logger.error(f"Failed to close WebSocket after registration error: {close_err}")
        return
    
    try:
        # Send initial connection confirmation
        try:
            await websocket.send_json({
                'type': 'connected',
                'showtime_id': showtime_id_int,
                'message': 'Connected to seat updates'
            })
            logger.info(f"✅ WebSocket connection established for showtime {showtime_id_int}")
        except (WebSocketDisconnect, RuntimeError) as e:
            # Connection closed immediately after accept - don't continue
            logger.warning(f"WebSocket connection closed immediately after accept: {e}")
            return
        except Exception as e:
            # Check if it's a connection error
            error_str = str(e).lower()
            if any(keyword in error_str for keyword in ['connection', 'closed', 'disconnect', 'broken', 'not connected']):
                logger.warning(f"WebSocket connection error during initial send: {e}")
                return
            logger.error(f"Failed to send initial WebSocket message: {e}")
            # Continue to message handling loop only if it's not a connection error
        
        # Handle messages from client with improved error handling
        while True:
            try:
                # Check if connection is still open before receiving
                # Wait for message with timeout
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                
                try:
                    json_data = json.loads(data)
                    
                    # Handle ping/pong
                    if json_data.get('type') == 'ping':
                        try:
                            pong_response = {'type': 'pong'}
                            # Include timestamp if provided by client
                            if 'timestamp' in json_data:
                                pong_response['timestamp'] = json_data['timestamp']
                            await websocket.send_json(pong_response)
                            logger.debug(f"✅ Sent pong response to ping from showtime {showtime_id_int}")
                        except (WebSocketDisconnect, RuntimeError) as e:
                            logger.warning(f"Connection closed while sending pong: {e}")
                            break
                        except Exception as e:
                            logger.warning(f"Failed to send pong: {e}")
                            # Don't break on other errors - connection might still be valid
                    
                    # Handle pong from client (response to server ping)
                    elif json_data.get('type') == 'pong':
                        logger.debug(f"✅ Received pong from client for showtime {showtime_id_int}")
                        # Just acknowledge, no action needed
                    
                    # You can handle other message types here in the future
                    # For now, we just keep the connection alive
                    
                except json.JSONDecodeError:
                    # Ignore non-JSON messages (but log for debugging)
                    logger.debug(f"Received non-JSON WebSocket message: {data[:50]}")
                    
            except asyncio.TimeoutError:
                # Send ping to keep connection alive
                try:
                    await websocket.send_json({'type': 'ping', 'timestamp': int(time.time() * 1000)})
                    logger.debug(f"Server sent ping to keep connection alive for showtime {showtime_id_int}")
                except (WebSocketDisconnect, RuntimeError) as e:
                    # Connection is dead - break out of loop
                    logger.debug(f"WebSocket ping failed (connection closed): {e}")
                    break
                except Exception as e:
                    # Connection might be dead - break out of loop
                    logger.debug(f"WebSocket ping failed: {e}")
                    break
            except (WebSocketDisconnect, RuntimeError) as e:
                # Client disconnected normally or connection is not connected
                if isinstance(e, RuntimeError) and 'not connected' in str(e).lower():
                    logger.info(f"WebSocket connection not connected for showtime {showtime_id_int}: {e}")
                else:
                    logger.info(f"WebSocket client disconnected for showtime {showtime_id_int}")
                break
                    
    except (WebSocketDisconnect, RuntimeError) as e:
        if isinstance(e, RuntimeError) and 'not connected' in str(e).lower():
            logger.info(f"WebSocket connection not connected for showtime {showtime_id_int}: {e}")
        else:
            logger.info(f"WebSocket client disconnected for showtime {showtime_id_int}")
    except Exception as e:
        logger.error(f"WebSocket error for showtime {showtime_id_int}: {e}", exc_info=True)
    finally:
        # Only disconnect if we successfully registered the connection
        if showtime_id_int is not None:
            manager.disconnect(websocket, showtime_id_int)
        # Database connection is already closed in the inner finally block above


# -------------------------
# Health endpoints
# -------------------------
@router.get("/health")
def health(db: Session = Depends(get_db)):
    try:
        count = db.query(models.Movie).count()
    except Exception:
        count = None
    return {"status": "ok", "movies": count}


@router.get("/health/redis")
async def health_redis():
    return await health_check_redis()
