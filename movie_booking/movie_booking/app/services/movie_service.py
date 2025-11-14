"""
Internal service layer for movie and showtime data access.
Used by AI tools to avoid HTTP self-call deadlocks.
"""
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import or_
from app.database import models
from app.utils.poster_url import get_poster_full_url
import logging

logger = logging.getLogger(__name__)


def get_db_session():
    """Get a database session for internal use"""
    from app.database.database import SessionLocal
    return SessionLocal()


def get_all_movies_internal(limit: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Get all movies directly from database (internal use, no HTTP).
    
    Args:
        limit: Optional limit on number of movies to return
    
    Returns:
        List of movie dictionaries
    """
    db = get_db_session()
    try:
        query = db.query(models.Movie)
        if limit:
            movies = query.limit(limit).all()
        else:
            movies = query.all()
        
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
    finally:
        db.close()


def get_movie_by_id_internal(movie_id: int) -> Optional[Dict[str, Any]]:
    """
    Get a single movie by ID directly from database.
    
    Args:
        movie_id: Movie ID
    
    Returns:
        Movie dictionary or None if not found
    """
    db = get_db_session()
    try:
        m = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
        if m is None:
            return None
        
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
    finally:
        db.close()


def search_movies_internal(query: str, limit: int = 10) -> List[Dict[str, Any]]:
    """
    Search movies by title, language, or genre (internal use).
    
    Args:
        query: Search query string
        limit: Maximum number of results
    
    Returns:
        List of matching movie dictionaries
    """
    db = get_db_session()
    try:
        query_lower = query.lower()
        movies = db.query(models.Movie).filter(
            or_(
                models.Movie.title.ilike(f"%{query_lower}%"),
                models.Movie.language.ilike(f"%{query_lower}%"),
                models.Movie.tags.ilike(f"%{query_lower}%")
            )
        ).limit(limit).all()
        
        result = []
        for m in movies:
            try:
                poster_url = get_poster_full_url(m.poster_url)
                result.append({
                    "id": m.id,
                    "title": m.title,
                    "language": m.language,
                    "rating": m.rating,
                    "genre": m.tags,
                    "runtime": m.runtime,
                    "poster_url": poster_url,
                })
            except Exception as e:
                logger.error(f"Error processing movie {m.id}: {e}")
                continue
        
        return result
    finally:
        db.close()


def get_showtimes_for_movie_internal(movie_id: int, date: Optional[str] = None) -> Dict[str, Any]:
    """
    Get showtimes for a movie directly from database, grouped by theatre.
    
    Args:
        movie_id: Movie ID
        date: Optional date filter (YYYY-MM-DD)
    
    Returns:
        Dictionary with movie_id, date, and theatres array
    """
    db = get_db_session()
    try:
        from datetime import datetime, timedelta
        
        # Verify movie exists
        movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
        if movie is None:
            return {"error": f"Movie with ID {movie_id} not found"}
        
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
                logger.warning(f"Invalid date format: {date}")
        else:
            # Future showtimes only
            now = datetime.utcnow()
            query = query.filter(models.Showtime.start_time >= now)
        
        showtimes = query.all()
        
        if not showtimes:
            return {
                "movie_id": movie_id,
                "date": date,
                "theatres": [],
                "message": f"No showtimes found" + (f" for {date}" if date else "")
            }
        
        # Get theatre info
        theatre_ids = set(s.theatre_id for s in showtimes if getattr(s, "theatre_id", None))
        theatres_map = {}
        if theatre_ids:
            theatres_query = db.query(
                models.Theatre.id,
                models.Theatre.name
            ).filter(models.Theatre.id.in_(theatre_ids)).all()
            
            for t_id, t_name in theatres_query:
                theatres_map[t_id] = {
                    "id": t_id,
                    "name": t_name,
                    "location": None
                }
        
        # Group by theatre
        theatres_dict = {}
        for st in showtimes:
            theatre_id = getattr(st, "theatre_id", None)
            if not theatre_id or theatre_id not in theatres_map:
                continue
            
            theatre_info = theatres_map[theatre_id]
            if theatre_id not in theatres_dict:
                theatres_dict[theatre_id] = {
                    "theatre_id": theatre_id,
                    "theatre_name": theatre_info["name"],
                    "location": theatre_info.get("location"),
                    "times": []
                }
            
            start_time = getattr(st, "start_time", None) or getattr(st, "starts_at", None)
            theatres_dict[theatre_id]["times"].append({
                "showtime_id": st.id,
                "start_time": start_time.isoformat() if start_time else None,
                "price": float(st.price) if st.price else None,
            })
        
        theatres_list = sorted(theatres_dict.values(), key=lambda x: x["theatre_name"] or "")
        
        # Determine date used
        date_used = date if date else None
        if not date_used and showtimes:
            first_showtime = showtimes[0]
            start_time = getattr(first_showtime, "start_time", None) or getattr(first_showtime, "starts_at", None)
            if start_time:
                date_used = start_time.date().isoformat()
        
        return {
            "movie_id": movie_id,
            "date": date_used,
            "theatres": theatres_list
        }
    except Exception as e:
        logger.error(f"Error fetching showtimes: {e}")
        return {"error": f"Error fetching showtimes: {str(e)}"}
    finally:
        db.close()


def get_showtime_by_id_internal(showtime_id: int) -> Optional[Dict[str, Any]]:
    """
    Get a single showtime by ID directly from database.
    
    Args:
        showtime_id: Showtime ID
    
    Returns:
        Showtime dictionary or None if not found
    """
    db = get_db_session()
    try:
        st = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
        if st is None:
            return None
        
        movie = st.movie if hasattr(st, 'movie') else None
        theatre = st.theatre if hasattr(st, 'theatre') else None
        
        return {
            "id": st.id,
            "movie_id": st.movie_id,
            "theatre_id": st.theatre_id,
            "show_date": st.show_date.isoformat() if st.show_date else None,
            "show_time": st.show_time.isoformat() if st.show_time else None,
            "price": float(st.price) if st.price else None,
            "movie": {
                "id": movie.id,
                "title": movie.title,
                "runtime": movie.runtime,
                "language": movie.language,
            } if movie else None,
            "theatre": {
                "id": theatre.id,
                "name": theatre.name,
                "location": theatre.location,
            } if theatre else None,
        }
    finally:
        db.close()

