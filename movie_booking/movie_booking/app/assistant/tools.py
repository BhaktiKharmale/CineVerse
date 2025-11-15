"""
Backend API tool wrappers for the assistant.
These tools call internal services directly (not HTTP) to avoid deadlocks.
"""
from typing import List, Dict, Any, Optional
from app.assistant.config import ASSISTANT_DEBUG, API_BASE_URL
from app.services import movie_service
from app.database.database import SessionLocal
from app.database import models
from app.core.redis import get_redis
from app.services import lock_service
from app.core.config import SEAT_LOCK_PREFIX
import logging
import json
import httpx
from datetime import datetime

logger = logging.getLogger(__name__)


def debug_log(message: str, **kwargs):
    """Log debug message if debug mode is enabled"""
    if ASSISTANT_DEBUG:
        logger.debug(f"[ASSISTANT] {message}", extra=kwargs)


# ========================================
# Movie Tools
# ========================================

def get_movies(query: Optional[str] = None) -> Dict[str, Any]:
    """
    Get movies - all movies or search by query.
    
    Args:
        query: Optional search query (title, genre, language)
    
    Returns:
        Dict with movies list
    """
    debug_log("get_movies", query=query)
    try:
        if query:
            movies = movie_service.search_movies_internal(query, limit=20)
        else:
            movies = movie_service.get_all_movies_internal(limit=20)
        
        return {
            "ok": True,
            "movies": movies,
            "count": len(movies)
        }
    except Exception as e:
        error_msg = f"Error fetching movies: {str(e)}"
        logger.error(error_msg)
        return {"ok": False, "error": error_msg}


def get_movie_details(movie_id: int) -> Dict[str, Any]:
    """
    Get detailed information about a specific movie.
    
    Args:
        movie_id: Movie ID
    
    Returns:
        Dict with movie details
    """
    debug_log("get_movie_details", movie_id=movie_id)
    try:
        movie = movie_service.get_movie_by_id_internal(movie_id)
        if movie is None:
            return {"ok": False, "error": f"Movie {movie_id} not found"}
        return {"ok": True, "movie": movie}
    except Exception as e:
        error_msg = f"Error fetching movie details: {str(e)}"
        logger.error(error_msg)
        return {"ok": False, "error": error_msg}


# ========================================
# Showtime Tools
# ========================================

def get_showtimes(movie_id: int, date: Optional[str] = None) -> Dict[str, Any]:
    """
    Get showtimes for a movie, optionally filtered by date.
    
    Args:
        movie_id: Movie ID
        date: Optional date filter in YYYY-MM-DD format
    
    Returns:
        Dict with showtimes grouped by theatre
    """
    debug_log("get_showtimes", movie_id=movie_id, date=date)
    try:
        result = movie_service.get_showtimes_for_movie_internal(movie_id, date)
        if "error" in result:
            return {"ok": False, "error": result["error"]}
        return {"ok": True, **result}
    except Exception as e:
        error_msg = f"Error fetching showtimes: {str(e)}"
        logger.error(error_msg)
        return {"ok": False, "error": error_msg}


def get_showtime_details(showtime_id: int) -> Dict[str, Any]:
    """
    Get detailed information about a specific showtime.
    
    Args:
        showtime_id: Showtime ID
    
    Returns:
        Dict with showtime details
    """
    debug_log("get_showtime_details", showtime_id=showtime_id)
    try:
        showtime = movie_service.get_showtime_by_id_internal(showtime_id)
        if showtime is None:
            return {"ok": False, "error": f"Showtime {showtime_id} not found"}
        return {"ok": True, "showtime": showtime}
    except Exception as e:
        error_msg = f"Error fetching showtime details: {str(e)}"
        logger.error(error_msg)
        return {"ok": False, "error": error_msg}


# ========================================
# Seat Tools
# ========================================

async def get_seat_map(showtime_id: int) -> Dict[str, Any]:
    """
    Get the seat map for a showtime showing available and booked seats.
    
    Args:
        showtime_id: Showtime ID
    
    Returns:
        Dict with seat layout and availability
    """
    debug_log("get_seat_map", showtime_id=showtime_id)
    try:
        db = SessionLocal()
        try:
            from app.routers.public_routes import _get_showtime_seats_impl
            import time
            seat_data = await _get_showtime_seats_impl(showtime_id, db, time.monotonic())
            return {"ok": True, "seat_map": seat_data}
        finally:
            db.close()
    except Exception as e:
        error_msg = f"Error fetching seat map: {str(e)}"
        logger.error(error_msg)
        return {"ok": False, "error": error_msg}


async def lock_seats(showtime_id: int, seat_ids: List[int], owner_token: str, ttl_ms: int = 180000) -> Dict[str, Any]:
    """
    Lock seats for a user temporarily.
    
    Args:
        showtime_id: Showtime ID
        seat_ids: List of seat IDs to lock
        owner_token: Owner token (UUID) for this session
        ttl_ms: Lock duration in milliseconds (default 3 minutes)
    
    Returns:
        Dict with lock status
    """
    debug_log("lock_seats", showtime_id=showtime_id, seat_ids=seat_ids, owner=owner_token)
    try:
        redis = await get_redis()
        result = await lock_service.lock_seats(redis, showtime_id, seat_ids, owner_token, ttl_ms)
        
        if result.get("conflicts"):
            return {
                "ok": False,
                "locked": result.get("locked", []),
                "conflicts": result["conflicts"],
                "message": f"Seats {result['conflicts']} are already locked"
            }
        
        return {
            "ok": True,
            "locked": result.get("locked", []),
            "expires_at": result.get("expires_at"),
            "message": f"Successfully locked {len(result.get('locked', []))} seats"
        }
    except Exception as e:
        error_msg = f"Error locking seats: {str(e)}"
        logger.error(error_msg)
        return {"ok": False, "error": error_msg}


async def unlock_seats(showtime_id: int, seat_ids: List[int], owner_token: str) -> Dict[str, Any]:
    """
    Release previously locked seats.
    
    Args:
        showtime_id: Showtime ID
        seat_ids: List of seat IDs to unlock
        owner_token: Owner token (must match the lock owner)
    
    Returns:
        Dict with unlock status
    """
    debug_log("unlock_seats", showtime_id=showtime_id, seat_ids=seat_ids, owner=owner_token)
    try:
        redis = await get_redis()
        result = await lock_service.release_seat_locks(redis, showtime_id, seat_ids, owner_token)
        return {
            "ok": True,
            "released": result.get("released", []),
            "message": f"Released {len(result.get('released', []))} seats"
        }
    except Exception as e:
        error_msg = f"Error unlocking seats: {str(e)}"
        logger.error(error_msg)
        return {"ok": False, "error": error_msg}


# ========================================
# Booking Tools
# ========================================

async def create_booking(showtime_id: int, seat_ids: List[int], user_email: str, owner_token: str, payment_ref: str = "demo_payment") -> Dict[str, Any]:
    """
    Create a booking for the selected seats.
    
    Args:
        showtime_id: Showtime ID
        seat_ids: List of seat IDs
        user_email: User's email address
        owner_token: Owner token for seat locks
        payment_ref: Payment reference (optional, defaults to demo)
    
    Returns:
        Dict with booking confirmation
    """
    debug_log("create_booking", showtime_id=showtime_id, seat_ids=seat_ids, email=user_email)
    try:
        db = SessionLocal()
        try:
            # First, verify locks are owned by this owner
            redis = await get_redis()
            inspected = await lock_service.inspect_locks(redis, showtime_id, seat_ids)
            
            not_owned = [i for i in inspected if i.get("owner") and i.get("owner") != owner_token]
            if not_owned:
                return {
                    "ok": False,
                    "error": "Some seats are no longer locked by you",
                    "conflicts": not_owned
                }
            
            # Get seat prices from showtime
            showtime = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
            if not showtime:
                return {"ok": False, "error": f"Showtime {showtime_id} not found"}
            
            # Calculate total amount (simplified - using showtime price or default)
            base_price = getattr(showtime, "price", 200) or 200
            total_amount = len(seat_ids) * base_price
            
            # Create booking
            seat_numbers_str = ",".join(map(str, seat_ids))
            booking = models.Booking(
                show_id=showtime_id,
                seat_numbers=seat_numbers_str,
                user_email=user_email,
                total_amount=total_amount,
                payment_ref=payment_ref,
                owner=owner_token,
                created_at=datetime.utcnow()
            )
            db.add(booking)
            db.commit()
            db.refresh(booking)
            
            # Release locks after booking
            try:
                await lock_service.release_seat_locks(redis, showtime_id, seat_ids, owner_token)
            except Exception:
                pass  # Non-fatal
            
            return {
                "ok": True,
                "booking_id": booking.id,
                "confirmation_number": f"CV{booking.id:06d}",
                "total_amount": total_amount,
                "seats": seat_ids,
                "message": "Booking confirmed successfully!"
            }
        finally:
            db.close()
    except Exception as e:
        error_msg = f"Error creating booking: {str(e)}"
        logger.error(error_msg)
        return {"ok": False, "error": error_msg}


def get_booking(booking_id: int) -> Dict[str, Any]:
    """
    Get booking details by ID.
    
    Args:
        booking_id: Booking ID
    
    Returns:
        Dict with booking details
    """
    debug_log("get_booking", booking_id=booking_id)
    try:
        db = SessionLocal()
        try:
            booking = db.query(models.Booking).filter(models.Booking.id == booking_id).first()
            if not booking:
                return {"ok": False, "error": f"Booking {booking_id} not found"}
            
            # Get showtime details
            showtime = db.query(models.Showtime).filter(models.Showtime.id == booking.show_id).first()
            movie = None
            if showtime and showtime.movie_id:
                movie = db.query(models.Movie).filter(models.Movie.id == showtime.movie_id).first()
            
            return {
                "ok": True,
                "booking": {
                    "id": booking.id,
                    "confirmation_number": f"CV{booking.id:06d}",
                    "showtime_id": booking.show_id,
                    "seat_ids": [int(s.strip()) for s in booking.seat_numbers.split(",")] if booking.seat_numbers else [],
                    "total_amount": booking.total_amount,
                    "user_email": booking.user_email,
                    "payment_ref": booking.payment_ref,
                    "created_at": booking.created_at.isoformat() if booking.created_at else None,
                    "movie": {
                        "id": movie.id,
                        "title": movie.title
                    } if movie else None,
                    "showtime": {
                        "id": showtime.id,
                        "start_time": showtime.start_time.isoformat() if showtime.start_time else None
                    } if showtime else None
                }
            }
        finally:
            db.close()
    except Exception as e:
        error_msg = f"Error fetching booking: {str(e)}"
        logger.error(error_msg)
        return {"ok": False, "error": error_msg}


# ========================================
# Order & Payment Tools
# ========================================

async def create_order(
    showtime_id: int,
    seat_ids: List[int],
    owner_token: str,
    seats: Optional[List[Dict[str, Any]]] = None
) -> Dict[str, Any]:
    """
    Create an order for selected seats. This returns an order object that can be used for payment.
    
    Args:
        showtime_id: Showtime ID
        seat_ids: List of seat IDs
        owner_token: Owner token for seat locks
        seats: Optional list of seat objects with {seatId, price}
    
    Returns:
        Dict with order details
    """
    debug_log("create_order", showtime_id=showtime_id, seat_ids=seat_ids, owner=owner_token)
    try:
        # Prepare seats payload - use provided seats or calculate from seat_ids
        seats_payload = seats or []
        if not seats_payload:
            # Fetch seat prices from database
            db = SessionLocal()
            try:
                showtime = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
                base_price = getattr(showtime, "price", 200) or 200
                seats_payload = [
                    {"seatId": sid, "price": base_price} for sid in seat_ids
                ]
            finally:
                db.close()
        
        payload = {
            "showtimeId": showtime_id,
            "owner": owner_token,
            "seats": seats_payload
        }
        
        # Call payment API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{API_BASE_URL}/api/payments/create-order",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code >= 400:
                error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                error_msg = error_data.get("detail", f"API error {response.status_code}")
                return {"ok": False, "error": error_msg}
            
            result = response.json()
            return {
                "ok": True,
                "order_id": result.get("orderId"),
                "amount": result.get("amount", 0),
                "currency": result.get("currency", "INR"),
                "expires_at": result.get("expiresAt"),
                "gateway": result.get("gateway", {}),
                "message": "Order created successfully"
            }
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request timeout - please try again"}
    except Exception as e:
        error_msg = f"Error creating order: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {"ok": False, "error": error_msg}


async def verify_payment(
    order_id: str,
    owner_token: Optional[str] = None,
    gateway_payload: Optional[Dict[str, Any]] = None,
    showtime_id: Optional[int] = None,
    seat_ids: Optional[List[int]] = None
) -> Dict[str, Any]:
    """
    Verify payment and convert locked seats into booked seats.
    
    Args:
        order_id: Order ID from create_order
        owner_token: Owner token for seat locks
        gateway_payload: Payment gateway payload (e.g., {paymentId, status})
        showtime_id: Optional showtime ID (can be inferred from order)
        seat_ids: Optional seat IDs (can be inferred from order)
    
    Returns:
        Dict with booking confirmation
    """
    debug_log("verify_payment", order_id=order_id, owner=owner_token)
    try:
        payload = {
            "orderId": order_id,
            "owner": owner_token,
        }
        
        if gateway_payload:
            payload["gatewayPayload"] = gateway_payload
        if showtime_id:
            payload["showtimeId"] = showtime_id
        if seat_ids:
            payload["seats"] = [{"seatId": sid} for sid in seat_ids]
        
        # Call payment API
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                f"{API_BASE_URL}/api/payments/verify",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code >= 400:
                error_data = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
                error_msg = error_data.get("detail", f"API error {response.status_code}")
                if isinstance(error_msg, dict):
                    error_msg = error_msg.get("message", "Payment verification failed")
                return {"ok": False, "error": error_msg}
            
            result = response.json()
            return {
                "ok": True,
                "booking_id": result.get("bookingId") or result.get("booking_id"),
                "download_url": result.get("download_url") or result.get("downloadUrl"),
                "message": result.get("message", "Payment verified and booking confirmed!"),
                "amount": result.get("amount", 0),
            }
    except httpx.TimeoutException:
        return {"ok": False, "error": "Request timeout - please try again"}
    except Exception as e:
        error_msg = f"Error verifying payment: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {"ok": False, "error": error_msg}


async def get_ticket_pdf(booking_id: int) -> Dict[str, Any]:
    """
    Get PDF ticket download URL for a booking.
    
    Args:
        booking_id: Booking ID
    
    Returns:
        Dict with ticket PDF URL
    """
    debug_log("get_ticket_pdf", booking_id=booking_id)
    try:
        # Generate ticket URL
        ticket_url = f"{API_BASE_URL}/api/bookings/{booking_id}/ticket.pdf"
        
        # Optionally verify the URL exists
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.head(ticket_url, follow_redirects=True)
            if response.status_code == 404:
                return {
                    "ok": False,
                    "error": f"Ticket PDF not found for booking {booking_id}. It may still be generating."
                }
        
        return {
            "ok": True,
            "ticket_url": ticket_url,
            "download_url": ticket_url,
            "message": f"Ticket PDF is ready. Download from: {ticket_url}"
        }
    except Exception as e:
        error_msg = f"Error getting ticket PDF: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {"ok": False, "error": error_msg}


# Tool registry
ALL_TOOLS = {
    "get_movies": get_movies,
    "get_movie_details": get_movie_details,
    "get_showtimes": get_showtimes,
    "get_showtime_details": get_showtime_details,
    "get_seat_map": get_seat_map,
    "lock_seats": lock_seats,
    "unlock_seats": unlock_seats,
    "create_order": create_order,
    "verify_payment": verify_payment,
    "create_booking": create_booking,  # Keep for backward compatibility
    "get_booking": get_booking,
    "get_ticket_pdf": get_ticket_pdf,
}

