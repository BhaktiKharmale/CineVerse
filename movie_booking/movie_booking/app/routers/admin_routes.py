# app/routers/admin_routes.py
import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Body, Path
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Any, List, Dict

from app.database.database import get_db
from app.database import schemas, models
from app.database.models import Admin
from app.services import admin_service
from app.auth import verify_password, create_access_token, require_role
from app.core.redis import get_redis
from redis.asyncio import Redis

# ==============================
# 🔧 Logging Setup
# ==============================
logger = logging.getLogger("admin_routes")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)

# ==============================
# 📍 Router Configuration
# ==============================
router = APIRouter(prefix="/admin", tags=["Admin"])

# ==============================
# ✅ ADMIN LOGIN
# ==============================
@router.post("/login")
def admin_login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    Authenticate an admin and return a JWT token.
    Expects form-urlencoded data with username (email) and password.
    """
    email = form_data.username  # OAuth2PasswordRequestForm uses 'username' field
    password = form_data.password

    logger.info(f"Login attempt for admin: {email}")

    try:
        admin = db.query(Admin).filter(Admin.email == email).first()
        if not admin:
            logger.warning(f"Admin not found for email: {email}")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        # Ensure password is not None before verification
        if admin.password is None:
            logger.error(f"Admin {email} has no password set")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        if not verify_password(password, str(admin.password)):
            logger.warning(f"Password verification failed for admin: {email}")
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

        role = "superadmin" if getattr(admin, "is_superadmin", False) else "admin"
        access_token = create_access_token({"sub": admin.email, "role": role})

        logger.info(f"Admin login successful: {email}")
        return {
            "access_token": access_token,
            "token_type": "bearer",
            "role": role,
            "email": admin.email,
            "message": "Admin login successful"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error during admin login: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")


# ==============================
# 🎬 MOVIE MANAGEMENT
# ==============================
@router.post("/movies", response_model=schemas.MovieResponse)
def create_movie(
    movie: schemas.MovieCreate,
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    try:
        # ✅ Convert release_date if sent as string
        if hasattr(movie, "release_date") and isinstance(movie.release_date, str):
            try:
                movie.release_date = datetime.strptime(movie.release_date.strip(), "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

        new_movie = admin_service.create_movie(db, **movie.model_dump())
        logger.info(f"🎬 Movie added successfully: {new_movie.title}")
        return new_movie

    except Exception as e:
        logger.exception("Error adding movie")
        raise HTTPException(status_code=500, detail=f"Error adding movie: {str(e)}")


@router.put("/movies/{movie_id}", response_model=schemas.MovieResponse)
def update_movie(
    movie_id: int,
    movie: schemas.MovieCreate,
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    try:
        updated_movie = admin_service.update_movie(db, movie_id, **movie.model_dump())
        logger.info(f"✅ Movie updated successfully: {updated_movie.title}")
        return updated_movie
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Error updating movie")
        raise HTTPException(status_code=500, detail=f"Error updating movie: {str(e)}")


@router.delete("/movies/{movie_id}")
def delete_movie(
    movie_id: int,
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    try:
        admin_service.delete_movie(db, movie_id)
        logger.info(f"🗑️ Movie deleted successfully (ID={movie_id})")
        return {"detail": "Movie deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Error deleting movie")
        raise HTTPException(status_code=500, detail=f"Error deleting movie: {str(e)}")


# ==============================
# 🎥 THEATRE & SHOWTIME MANAGEMENT
# ==============================
@router.post("/screens", response_model=schemas.TheatreResponse)
def create_screen(
    screen: schemas.TheatreCreate,
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    try:
        created_screen = admin_service.create_screen(db, screen.name)
        logger.info(f"🎭 Screen created successfully: {created_screen.name}")
        return created_screen
    except Exception as e:
        logger.exception("Error creating screen")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/showtimes", response_model=schemas.ShowtimeResponse)
def create_showtime(
    showtime: schemas.ShowtimeCreate,
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    try:
        created_showtime = admin_service.create_showtime(db, **showtime.model_dump())
        logger.info("🎞️ Showtime created successfully")
        return created_showtime
    except Exception as e:
        logger.exception("Error creating showtime")
        raise HTTPException(status_code=500, detail=str(e))


# ==============================
# Additional admin endpoints (added)
# ==============================

# ------------------------------
# Register Admin (public endpoint - as per screenshot)
# ------------------------------
@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_admin(
    payload: schemas.AdminRegisterSchema,
    db: Session = Depends(get_db)
):
    """
    Register a new admin (sends OTP or creates a pending request depending on your service).
    Expects fields: name, email, password, phone (optional).
    """
    try:
        created = admin_service.register_admin(db, payload.model_dump())
        logger.info(f"Admin registration requested for: {payload.email}")
        return created
    except Exception as e:
        logger.exception("Error registering admin")
        raise HTTPException(status_code=400, detail=str(e))


# ------------------------------
# Verify OTP (public)
# ------------------------------
@router.post("/verify-otp")
def verify_otp(
    payload: schemas.AdminVerifyOtpSchema,
    db: Session = Depends(get_db)
):
    """
    Verify OTP for admin registration.
    Expects: { "email": "...", "otp": "123456" }
    """
    try:
        result = admin_service.verify_admin_otp(db, payload.model_dump())
        if not result:
            raise HTTPException(status_code=400, detail="OTP verification failed or invalid")
        logger.info(f"OTP verified for: {payload.email}")
        return {"detail": "OTP verified", "data": result}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error verifying OTP")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------
# Get screen seats
# GET /admin/screens/{screen_id}/seats
# ------------------------------
@router.post("/showtimes/{showtime_id}/ensure-seats")
async def ensure_showtime_seats(
    showtime_id: int = Path(..., description="ID of the showtime"),
    db: Session = Depends(get_db),
    redis: Redis = Depends(get_redis),
    _: Any = Depends(require_role("admin"))
):
    """
    Admin endpoint to ensure seat layout exists for a showtime.
    Returns seat count by section.
    """
    from app.routers.public_routes import get_showtime_seats
    
    showtime = db.query(models.Showtime).filter(models.Showtime.id == showtime_id).first()
    if showtime is None:
        raise HTTPException(status_code=404, detail="Showtime not found")
    
    # Call the seats endpoint to generate layout
    try:
        seat_map = await get_showtime_seats(showtime_id, db, redis)
        
        # Count seats by section
        seat_counts = {}
        total_seats = 0
        for section in seat_map.get("sections", []):
            section_name = section.get("name", "Unknown")
            section_count = sum(
                len(row.get("seats", []))
                for row in section.get("rows", [])
            )
            seat_counts[section_name] = section_count
            total_seats += section_count
        
        return {
            "showtime_id": showtime_id,
            "seat_count": total_seats,
            "seat_count_by_section": seat_counts,
            "sections": len(seat_map.get("sections", [])),
            "message": f"Seat layout ensured for showtime {showtime_id}"
        }
    except Exception as e:
        logger.exception(f"Error ensuring seats for showtime {showtime_id}")
        raise HTTPException(status_code=500, detail=f"Failed to ensure seats: {str(e)}")


@router.get("/screens/{screen_id}/seats")
def get_screen_seats(
    screen_id: int = Path(..., description="ID of the screen"),
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    """
    Return seats layout/status for a given screen.
    """
    try:
        seats = admin_service.get_screen_seats(db, screen_id)
        if seats is None:
            raise HTTPException(status_code=404, detail="Screen not found")
        return seats
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error fetching screen seats")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------
# Get my screens
# GET /admin/screens
# ------------------------------
@router.get("/screens", response_model=List[schemas.TheatreResponse])
def get_screens(
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    """
    Return list of screens owned/managed by this admin.
    """
    try:
        screens = admin_service.get_screens(db)
        return screens
    except Exception as e:
        logger.exception("Error fetching screens")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------
# Update screen
# PUT /admin/screens/update
# ------------------------------
@router.put("/screens/update", response_model=schemas.TheatreResponse)
def update_screen(
    payload: schemas.ScreenUpdateSchema,
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    """
    Update screen information. Expects payload with screen_id and fields to update.
    Fields: screen_id (required), name, location, total_seats, seat_layout (all optional).
    """
    try:
        updated = admin_service.update_screen(db, payload.screen_id, payload.model_dump())
        if not updated:
            raise HTTPException(status_code=404, detail="Screen not found or not updated")
        logger.info(f"Screen updated (ID={payload.screen_id})")
        return updated
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error updating screen")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------
# Delete screen
# DELETE /admin/screens/{screen_id}
# ------------------------------
@router.delete("/screens/{screen_id}")
def delete_screen(
    screen_id: int = Path(..., description="ID of the screen to delete"),
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    try:
        admin_service.delete_screen(db, screen_id)
        logger.info(f"🗑️ Screen deleted successfully (ID={screen_id})")
        return {"detail": "Screen deleted successfully"}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        logger.exception("Error deleting screen")
        raise HTTPException(status_code=500, detail=str(e))


# ------------------------------
# Admin book offline
# POST /admin/admin/book-offline
# ------------------------------
@router.post("/admin/book-offline")
def admin_book_offline(
    payload: schemas.OfflineBookingSchema,
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    """
    Admin creates an offline booking.
    Fields: showtime_id, seat_ids (list), customer_name (optional), customer_phone (optional).
    """
    try:
        booking = admin_service.admin_book_offline(db, payload.model_dump())
        logger.info(f"Offline booking created by admin: {booking.get('id') if isinstance(booking, dict) else 'unknown'}")
        return booking
    except Exception as e:
        logger.exception("Error creating offline booking")
        raise HTTPException(status_code=400, detail=str(e))


# ------------------------------
# Request movie
# POST /admin/request_movie
# ------------------------------
@router.post("/request_movie")
def request_movie(
    payload: schemas.MovieRequestSchema,
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    """
    Request a movie (e.g., request a new movie to be added).
    Fields: title (required), reason (optional).
    """
    try:
        req = admin_service.request_movie(db, payload.model_dump())
        logger.info(f"Movie request created by admin: {payload.title}")
        return req
    except Exception as e:
        logger.exception("Error creating movie request")
        raise HTTPException(status_code=400, detail=str(e))


# ------------------------------
# Get all movies
# GET /admin/movies
# ------------------------------
@router.get("/movies", response_model=List[schemas.MovieResponse])
def get_all_movies(
    db: Session = Depends(get_db),
    _: Any = Depends(require_role("admin"))
):
    """
    Return all movies (admin view).
    """
    try:
        movies = admin_service.get_all_movies(db)
        return movies
    except Exception as e:
        logger.exception("Error fetching movies")
        raise HTTPException(status_code=500, detail=str(e))
