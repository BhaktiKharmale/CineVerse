# app/routers/user_routes.py
import logging
from typing import Dict, List, Optional

import datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr, constr
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database.database import get_db
from app.database import models
from app.auth import create_access_token, get_current_user, decode_access_token, oauth2_scheme
from app.utils import generate_otp, send_email, hash_password, verify_password

logger = logging.getLogger("user_routes")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

router = APIRouter(prefix="/user", tags=["User"])


# -------------------- Schemas (local copies for route typing) --------------------
class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    name: str
    email: EmailStr
    phone: Optional[str] = None
    password: constr(min_length=6, max_length=72)  # type: ignore
    is_admin: bool = False

    @classmethod
    def model_validate(cls, obj, **kwargs):
        # Accept "username" as alias for "name"
        if isinstance(obj, dict):
            if "username" in obj and "name" not in obj:
                obj["name"] = obj["username"]
        return super().model_validate(obj, **kwargs)


class OTPRequest(BaseModel):
    email: EmailStr


class OTPVerifyRequest(BaseModel):
    email: EmailStr
    otp: str


# -------------------- Register --------------------
@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=Dict[str, str])
async def register(user: RegisterRequest, db: Session = Depends(get_db)):
    """
    Register a new user.
    Accepts JSON with fields: name (or username), email, password, phone (optional), is_admin (optional).
    """
    try:
        existing_user = db.query(models.User).filter(models.User.email == user.email).first()
        if existing_user:
            logger.warning("Attempt to register with existing email: %s", user.email)
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

        hashed_pwd = hash_password(user.password)
        otp = generate_otp()

        new_user = models.User(
            name=user.name,
            email=user.email,
            phone=user.phone or "",
            password=hashed_pwd,
            role=("admin" if user.is_admin else "user"),
            otp_code=otp,
            otp_expiry=datetime.datetime.utcnow() + datetime.timedelta(minutes=10),
            is_verified=False,
            is_admin=user.is_admin,
        )

        db.add(new_user)
        try:
            db.commit()
            db.refresh(new_user)
        except IntegrityError:
            db.rollback()
            logger.exception("DB integrity error while creating user")
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email or phone already registered")
        except Exception:
            db.rollback()
            logger.exception("DB error while creating user")
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Database error")

        # Try to send OTP email (best-effort)
        try:
            result = await send_email(user.email, "Verify Email OTP", f"Your OTP is: {otp}")
            if not result:
                logger.warning("send_email returned falsy result for %s", user.email)
                return {"detail": "OTP generated; but email could not be sent (check SMTP settings)"}
            return {"detail": "OTP sent to your email for verification"}
        except Exception:
            logger.exception("Failed to send verification email for %s", user.email)
            return {"detail": "OTP generated; email sending failed (see server logs)"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during user registration: %s", e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")


# -------------------- Login --------------------
@router.post("/login", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """
    User login endpoint.
    Expects form-urlencoded data with username (email) and password.
    """
    logger.info("Login attempt: username=%s", form_data.username)

    try:
        user = db.query(models.User).filter(models.User.email == form_data.username).first()
        if not user:
            logger.warning("User not found for email: %s", form_data.username)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        if user.password is None or not verify_password(form_data.password, str(user.password)):
            logger.warning("Password verification failed for user: %s", form_data.username)
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        if getattr(user, "is_verified", False) is False:
            logger.warning("User not verified: %s", user.email)
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User not verified")

        access_token = create_access_token({"sub": user.email, "role": user.role})
        logger.info("Login successful for user: %s", user.email)
        return {"access_token": access_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Unexpected error during user login: %s", e)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Internal server error")


# -------------------- Logout --------------------
@router.post("/logout", response_model=Dict[str, str])
def logout(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Invalidate the current JWT token by adding it to the blacklist.
    """
    try:
        payload = decode_access_token(token)
        expires_at = datetime.datetime.fromtimestamp(payload.get("exp", datetime.datetime.utcnow().timestamp()))

        existing = db.query(models.BlacklistedToken).filter(models.BlacklistedToken.token == token).first()
        if existing:
            logger.info("Token already blacklisted for user: %s", current_user.email)
            return {"success": True, "message": "Already logged out"}

        blacklisted_token = models.BlacklistedToken(token=token, expires_at=expires_at)
        db.add(blacklisted_token)
        db.commit()

        logger.info("User logged out successfully: %s", current_user.email)
        return {"success": True, "message": "Logged out successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Error during logout for user %s: %s", getattr(current_user, "email", "<unknown>"), e)
        db.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to logout")


# -------------------- Send OTP --------------------
@router.post("/send-otp", response_model=Dict[str, str])
async def send_otp(request: OTPRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == request.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp = generate_otp()
    user.otp_code = otp
    user.otp_expiry = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
    db.commit()

    try:
        result = await send_email(user.email, "Login OTP", f"Your OTP is: {otp}")
        if not result:
            logger.warning("send_email returned falsy result for %s", user.email)
            return {"detail": "OTP generated; email could not be sent (check SMTP settings)"}
        return {"detail": "OTP sent to your email"}
    except Exception:
        logger.exception("Unexpected error sending OTP to %s", user.email)
        return {"detail": "OTP generated; email sending failed (see server logs)"}


# -------------------- Verify OTP --------------------
@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(request: OTPVerifyRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == request.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp_code = getattr(user, "otp_code", None)
    otp_expiry = getattr(user, "otp_expiry", None)

    if otp_code is None or otp_code != request.otp:
        raise HTTPException(status_code=400, detail="Invalid OTP")

    if otp_expiry is None or otp_expiry < datetime.datetime.utcnow():
        raise HTTPException(status_code=400, detail="OTP expired or invalid")

    user.is_verified = True
    user.otp_code = None
    user.otp_expiry = None
    db.commit()

    access_token = create_access_token({"sub": user.email, "role": user.role})
    return {"access_token": access_token, "token_type": "bearer"}


# -------------------- Resend OTP --------------------
@router.post("/resend-otp", response_model=Dict[str, str])
async def resend_otp(request: OTPRequest, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == request.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    otp = generate_otp()
    user.otp_code = otp
    user.otp_expiry = datetime.datetime.utcnow() + datetime.timedelta(minutes=10)
    db.commit()

    try:
        result = await send_email(user.email, "Resend OTP", f"Your new OTP is: {otp}")
        if not result:
            logger.warning("send_email returned falsy result for %s", user.email)
            return {"detail": "OTP regenerated; email could not be sent (check SMTP settings)"}
        return {"detail": "New OTP sent"}
    except Exception:
        logger.exception("Unexpected error resending OTP to %s", user.email)
        return {"detail": "OTP regenerated; email sending failed (see server logs)"}


# -------------------- Fetch Movies, Showtimes, and Users --------------------
@router.get("/movies", response_model=List[Dict])
def get_movies(db: Session = Depends(get_db)):
    movies = db.query(models.Movie).all()
    if not movies:
        return []

    return [
        {
            "id": movie.id,
            "title": movie.title,
            "genre": getattr(movie, "genre", None) or getattr(movie, "tags", None),
            "description": getattr(movie, "description", None) or getattr(movie, "synopsis", None),
            "duration": getattr(movie, "duration", None) or getattr(movie, "runtime", None),
            "release_date": movie.release_date,
            "poster_filename": getattr(movie, "poster_filename", None),
            "poster_path": (
                f"/images/{movie.poster_filename}"
                if getattr(movie, "poster_filename", None)
                else getattr(movie, "poster_url", None)
            ),
        }
        for movie in movies
    ]


@router.get("/movies/{movie_id}")
def get_movie(movie_id: int, db: Session = Depends(get_db)):
    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    return {
        "id": movie.id,
        "title": movie.title,
        "description": getattr(movie, "synopsis", None) or getattr(movie, "description", None),
        "synopsis": getattr(movie, "synopsis", None),
        "genre": getattr(movie, "genre", None),
        "duration": getattr(movie, "duration", None),
        "rating": getattr(movie, "rating", None),
        "release_date": getattr(movie, "release_date", None),
        "poster_url": getattr(movie, "poster_url", None),
        "director": getattr(movie, "director", None),
        "cast": getattr(movie, "cast", None),
    }


@router.get("/movies/{movie_id}/showtimes")
def get_movie_showtimes(
    movie_id: int,
    date: Optional[str] = Query(None, description="Filter by date (YYYY-MM-DD)"),
    city: Optional[str] = Query(None, description="Filter by city (not implemented)"),
    db: Session = Depends(get_db),
):
    from datetime import datetime

    movie = db.query(models.Movie).filter(models.Movie.id == movie_id).first()
    if not movie:
        raise HTTPException(status_code=404, detail="Movie not found")

    query = db.query(models.Showtime).filter(models.Showtime.movie_id == movie_id)

    if date:
        try:
            target_date = datetime.strptime(date, "%Y-%m-%d").date()
            start_of_day = datetime.combine(target_date, datetime.min.time())
            end_of_day = datetime.combine(target_date, datetime.max.time())
            query = query.filter(
                models.Showtime.start_time >= start_of_day,
                models.Showtime.start_time <= end_of_day,
            )
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")
    else:
        now = datetime.utcnow()
        query = query.filter(models.Showtime.start_time >= now)

    showtimes = query.all()

    if not showtimes:
        return {"movie_id": movie_id, "date": date, "theatres": []}

    theatre_ids = set(s.theatre_id for s in showtimes if getattr(s, "theatre_id", None))
    theatres_map = {}
    if theatre_ids:
        theatres_query = db.query(models.Theatre.id, models.Theatre.name).filter(models.Theatre.id.in_(theatre_ids)).all()
        for t_id, t_name in theatres_query:
            theatres_map[t_id] = {"name": t_name, "location": None}

    theatres_dict = {}
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
                "times": [],
            }

        start_time = getattr(s, "start_time", None) or getattr(s, "starts_at", None)

        total_capacity = 216  # 12 rows × 18 seats
        booked_count = db.query(models.Booking).filter(models.Booking.show_id == s.id).count()
        available_seats = total_capacity - booked_count

        showtime_status = "available"
        if available_seats <= 0:
            showtime_status = "sold_out"
        elif start_time and start_time < datetime.utcnow():
            showtime_status = "lapsed"
        elif available_seats < total_capacity * 0.3:
            showtime_status = "filling_fast"

        theatres_dict[theatre_id]["times"].append(
            {
                "showtime_id": s.id,
                "start_time": start_time.isoformat() if start_time else None,
                "price": getattr(s, "price", None),
                "available_seats": available_seats,
                "capacity": total_capacity,
                "status": showtime_status,
                "language": getattr(s, "language", None),
                "format": getattr(s, "format", None),
            }
        )

    theatres_list = sorted(theatres_dict.values(), key=lambda x: x["theatre_name"] or "")

    return {"movie_id": movie_id, "date": date, "theatres": theatres_list}


@router.get("/users", response_model=List[Dict])
def get_all_users(db: Session = Depends(get_db)):
    """Fetch all registered users (for admin/superadmin view if needed)"""
    users = db.query(models.User).all()
    return [{"id": user.id, "name": user.name, "email": user.email} for user in users]


# -------------------- NEW: Current authenticated user --------------------
@router.get("/me", response_model=Dict)
def get_current_user_profile(current_user: models.User = Depends(get_current_user)):
    """
    Return the currently authenticated user's public profile.
    Requires Authorization: Bearer <token>.
    """
    if not current_user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return {
        "id": current_user.id,
        "name": current_user.name,
        "email": current_user.email,
        "phone": getattr(current_user, "phone", None),
        "role": getattr(current_user, "role", None),
        "is_verified": getattr(current_user, "is_verified", False),
        "created_at": getattr(current_user, "created_at", None),
    }
