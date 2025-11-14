"""
LangChain tools for CineVerse AI agent.
Uses internal service layer to avoid HTTP self-call deadlocks.
"""
from typing import List, Optional, Dict, Any
from langchain.tools import tool
from app.ai.config import AGENT_VERBOSE, API_BASE_URL
from app.services import movie_service
import httpx
import logging
import json
import time

logger = logging.getLogger(__name__)

# Minimal HTTP helper for seat/booking operations (still need HTTP for Redis endpoints)
# These are less frequently called and don't cause the same deadlock issue
_http_client: Optional[httpx.Client] = None

def _get_http_client() -> httpx.Client:
    """Get or create sync HTTP client for seat/booking operations"""
    global _http_client
    if _http_client is None:
        _http_client = httpx.Client(
            base_url=API_BASE_URL,
            timeout=10.0,  # Shorter timeout for seat/booking ops
            follow_redirects=True
        )
    return _http_client

def _make_http_request(method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
    """Make HTTP request for seat/booking operations (minimal, only when needed)"""
    if not endpoint.startswith('/'):
        endpoint = '/' + endpoint
    
    try:
        client = _get_http_client()
        response = client.request(method=method, url=endpoint, **kwargs)
        
        if response.status_code >= 400:
            return {"error": f"API error {response.status_code}: {response.text[:200]}"}
        
        return response.json()
    except httpx.TimeoutException:
        return {"error": "Request timeout after 10s"}
    except Exception as e:
        return {"error": f"Request failed: {str(e)}"}


# ========================================
# Movie Tools
# ========================================

@tool
def search_movies(query: str) -> str:
    """
    Search for movies by title, language, or genre.
    
    Args:
        query: Search query string (e.g., "KGF", "action", "Hindi")
    
    Returns:
        JSON string with list of matching movies
    """
    try:
        if AGENT_VERBOSE:
            logger.info(f"🔍 Searching movies with query: {query}")
        
        movies = movie_service.search_movies_internal(query, limit=10)
        
        if not movies:
            return json.dumps({"message": f"No movies found matching '{query}'", "movies": []})
        
        return json.dumps({"movies": movies, "count": len(movies)})
    except Exception as e:
        error_msg = f"Error searching movies: {str(e)}"
        logger.error(error_msg)
        return json.dumps({"error": error_msg})


@tool
def get_all_movies() -> str:
    """
    Get all available movies.
    
    Returns:
        JSON string with list of all movies
    """
    try:
        if AGENT_VERBOSE:
            logger.info("📽️ Fetching all movies (internal)")
        
        movies = movie_service.get_all_movies_internal(limit=20)
        
        # Simplify for agent response
        simplified = [
            {
                "id": m["id"],
                "title": m["title"],
                "language": m.get("language"),
                "rating": m.get("rating"),
                "genre": m.get("genre") or m.get("tags"),
                "runtime": m.get("runtime")
            }
            for m in movies
        ]
        
        return json.dumps({"movies": simplified, "count": len(simplified)})
    except Exception as e:
        error_msg = f"Error fetching movies: {str(e)}"
        logger.error(error_msg)
        return json.dumps({"error": error_msg})


@tool
def get_movie_details(movie_id: int) -> str:
    """
    Get detailed information about a specific movie.
    
    Args:
        movie_id: Movie ID
    
    Returns:
        JSON string with movie details
    """
    try:
        if AGENT_VERBOSE:
            logger.info(f"🎬 Fetching movie details for ID: {movie_id}")
        
        movie = movie_service.get_movie_by_id_internal(movie_id)
        
        if movie is None:
            return json.dumps({"error": f"Movie with ID {movie_id} not found"})
        
        return json.dumps(movie)
    except Exception as e:
        error_msg = f"Error fetching movie details: {str(e)}"
        logger.error(error_msg)
        return json.dumps({"error": error_msg})


# ========================================
# Showtime & Theatre Tools
# ========================================

@tool
def get_showtimes_for_movie(movie_id: int, date: Optional[str] = None) -> str:
    """
    Get showtimes for a specific movie, optionally filtered by date.
    
    Args:
        movie_id: Movie ID
        date: Optional date filter in YYYY-MM-DD format (e.g., "2025-11-07" for today, or "2025-11-08" for tomorrow)
               If not provided, returns all future showtimes.
    
    Returns:
        JSON string with movie_id, date used, and theatres array (each theatre has times array)
    """
    try:
        if AGENT_VERBOSE:
            logger.info(f"🎫 Fetching showtimes for movie ID: {movie_id} (date={date})")
        
        result = movie_service.get_showtimes_for_movie_internal(movie_id, date)
        
        if "error" in result:
            return json.dumps(result)
        
        if not result.get("theatres"):
            return json.dumps({
                "movie_id": movie_id,
                "date": date,
                "theatres": [],
                "message": f"No showtimes found for movie ID {movie_id}" + (f" on {date}" if date else "")
            })
        
        return json.dumps(result)
    except Exception as e:
        error_msg = f"Error fetching showtimes: {str(e)}"
        logger.error(error_msg)
        return json.dumps({"error": error_msg})


@tool
def get_showtime_details(showtime_id: int) -> str:
    """
    Get detailed information about a specific showtime.
    
    Args:
        showtime_id: Showtime ID
    
    Returns:
        JSON string with showtime details
    """
    try:
        if AGENT_VERBOSE:
            logger.info(f"🎟️ Fetching showtime details for ID: {showtime_id}")
        
        showtime = movie_service.get_showtime_by_id_internal(showtime_id)
        
        if showtime is None:
            return json.dumps({"error": f"Showtime with ID {showtime_id} not found"})
        
        return json.dumps(showtime)
    except Exception as e:
        error_msg = f"Error fetching showtime details: {str(e)}"
        logger.error(error_msg)
        return json.dumps({"error": error_msg})


# ========================================
# Seat Tools
# ========================================

@tool
def get_seat_map(showtime_id: int) -> str:
    """
    Get the seat map for a showtime showing available and booked seats.
    
    Args:
        showtime_id: Showtime ID
    
    Returns:
        JSON string with seat layout and availability
    """
    result = _make_http_request("GET", f"/api/showtimes/{showtime_id}/seats")
    
    if "error" in result:
        return json.dumps({"error": result["error"]})
    
    if isinstance(result, list):
        seats = [
            {
                "id": s.get("id"),
                "label": s.get("label"),
                "row": s.get("row"),
                "col": s.get("col"),
                "status": s.get("status", "available")
            }
            for s in result
        ]
        return json.dumps({"seats": seats, "total": len(seats)})
    
    return json.dumps(result)


@tool
def lock_seats(showtime_id: int, seat_ids: str, owner: str, ttl_ms: int = 180000) -> str:
    """
    Lock seats for a user. This prevents other users from booking them temporarily.
    
    Args:
        showtime_id: Showtime ID
        seat_ids: Comma-separated seat IDs (e.g., "101,102,103")
        owner: Owner token (UUID) - must be provided by the session
        ttl_ms: Lock duration in milliseconds (default 3 minutes)
    
    Returns:
        JSON string with lock status
    """
    try:
        seat_id_list = [int(s.strip()) for s in seat_ids.split(",")]
    except ValueError:
        return json.dumps({"error": "Invalid seat_ids format. Use comma-separated integers."})
    
    payload = {
        "seat_ids": seat_id_list,
        "owner": owner,
        "ttl_ms": ttl_ms
    }
    
    result = _make_http_request(
        "POST",
        f"/api/showtimes/{showtime_id}/redis-lock-seats",
        json=payload
    )
    
    if "error" in result:
        return json.dumps({"error": result["error"]})
    
    if result.get("conflicts"):
        return json.dumps({
            "success": False,
            "locked": result.get("locked", []),
            "conflicts": result["conflicts"],
            "message": f"Seats {result['conflicts']} are already locked by another user"
        })
    
    return json.dumps({
        "success": True,
        "locked": result.get("locked", []),
        "expires_at": result.get("expires_at"),
        "message": f"Successfully locked {len(result.get('locked', []))} seats"
    })


@tool
def unlock_seats(showtime_id: int, seat_ids: str, owner: str) -> str:
    """
    Release previously locked seats.
    
    Args:
        showtime_id: Showtime ID
        seat_ids: Comma-separated seat IDs
        owner: Owner token (must match the lock owner)
    
    Returns:
        JSON string with unlock status
    """
    try:
        seat_id_list = [int(s.strip()) for s in seat_ids.split(",")]
    except ValueError:
        return json.dumps({"error": "Invalid seat_ids format"})
    
    payload = {
        "seat_ids": seat_id_list,
        "owner": owner
    }
    
    result = _make_http_request(
        "POST",
        f"/api/showtimes/{showtime_id}/redis-unlock-seats",
        json=payload
    )
    
    if "error" in result:
        return json.dumps({"error": result["error"]})
    
    return json.dumps({
        "success": True,
        "released": result.get("released", []),
        "message": f"Released {len(result.get('released', []))} seats"
    })


@tool
def extend_seat_locks(showtime_id: int, seat_ids: str, owner: str, ttl_ms: int = 180000) -> str:
    """
    Extend the lock duration on already locked seats.
    
    Args:
        showtime_id: Showtime ID
        seat_ids: Comma-separated seat IDs
        owner: Owner token
        ttl_ms: New TTL in milliseconds
    
    Returns:
        JSON string with extend status
    """
    try:
        seat_id_list = [int(s.strip()) for s in seat_ids.split(",")]
    except ValueError:
        return json.dumps({"error": "Invalid seat_ids format"})
    
    payload = {
        "seat_ids": seat_id_list,
        "owner": owner,
        "ttl_ms": ttl_ms
    }
    
    result = _make_http_request(
        "POST",
        f"/api/showtimes/{showtime_id}/redis-extend-locks",
        json=payload
    )
    
    if "error" in result:
        return json.dumps({"error": result["error"]})
    
    return json.dumps({
        "success": True,
        "extended": result.get("extended", []),
        "message": f"Extended locks for {len(result.get('extended', []))} seats"
    })


# ========================================
# Booking Tool
# ========================================

@tool
def create_booking(showtime_id: int, seat_ids: str, user_email: str, payment_ref: str = "demo_payment") -> str:
    """
    Create a booking for the selected seats. MUST confirm with user before calling this.
    
    Args:
        showtime_id: Showtime ID
        seat_ids: Comma-separated seat IDs
        user_email: User's email address
        payment_ref: Payment reference (optional, defaults to demo)
    
    Returns:
        JSON string with booking confirmation
    """
    try:
        seat_id_list = [int(s.strip()) for s in seat_ids.split(",")]
    except ValueError:
        return json.dumps({"error": "Invalid seat_ids format"})
    
    payload = {
        "showtime_id": showtime_id,
        "seat_ids": seat_id_list,
        "user_email": user_email,
        "payment_ref": payment_ref
    }
    
    result = _make_http_request("POST", "/api/bookings", json=payload)
    
    if "error" in result:
        return json.dumps({"error": result["error"]})
    
    return json.dumps({
        "success": True,
        "booking_id": result.get("id") or result.get("booking_id"),
        "message": "Booking confirmed successfully!",
        "details": result
    })


# ========================================
# Tool Registry
# ========================================

ALL_TOOLS = [
    search_movies,
    get_all_movies,
    get_movie_details,
    get_showtimes_for_movie,
    get_showtime_details,
    get_seat_map,
    lock_seats,
    unlock_seats,
    extend_seat_locks,
    create_booking
]


def get_tools():
    """Get all available tools for the agent"""
    return ALL_TOOLS

