# app/database/models.py
from sqlalchemy import Boolean, Column, Integer, String, DateTime, ForeignKey, Text, Float, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database.database import Base

# ==========================
# ✅ USER MODEL
# ==========================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    email = Column(String(100), unique=True, nullable=False, index=True)
    phone = Column(String(15), nullable=True)
    password = Column(String(255), nullable=False)
    role = Column(String(50), default="user")
    is_admin = Column(Boolean, default=False)
    otp_code = Column(String(10), nullable=True)
    otp_expiry = Column(DateTime, nullable=True)
    is_verified = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    bookings = relationship("Booking", back_populates="user", cascade="all, delete")

# ==========================
# ✅ ADMIN MODEL
# ==========================
class Admin(Base):
    __tablename__ = "admins"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    username = Column(String(100), unique=True, nullable=False)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    role = Column(String(50), default="admin")
    created_at = Column(DateTime, default=datetime.utcnow)
    is_superadmin = Column(Boolean, nullable=False, default=False)
    number = Column(String(15), nullable=True)

    theatres = relationship("Theatre", back_populates="admin", cascade="all, delete")

# ==========================
# ✅ SUPERADMIN MODEL
# ==========================
class SuperAdmin(Base):
    __tablename__ = "superadmins"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=True)
    username = Column(String, unique=True, nullable=True)
    email = Column(String(100), unique=True, nullable=False, index=True)
    password = Column(String(255), nullable=False)
    role = Column(String(50), default="superadmin")
    created_at = Column(DateTime, default=datetime.utcnow)

# ==========================
# ✅ MOVIE MODEL
# ==========================
class Movie(Base):
    __tablename__ = "movies"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=False)
    synopsis = Column(Text, nullable=True)
    runtime = Column(Integer, nullable=True)
    language = Column(String(50), nullable=True)
    rating = Column(String(10), nullable=True)
    poster_url = Column(String(500), nullable=True)
    trailer_url = Column(String(500), nullable=True)
    release_date = Column(DateTime, nullable=True)
    tags = Column(String(500), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    showtimes = relationship("Showtime", back_populates="movie", cascade="all, delete")

# ==========================
# ✅ THEATRE MODEL
# ==========================
class Theatre(Base):
    __tablename__ = "theatres"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False)
    location_id = Column(Integer, nullable=True)
    admin_id = Column(Integer, ForeignKey("admins.id"))

    admin = relationship("Admin", back_populates="theatres")
    showtimes = relationship("Showtime", back_populates="theatre", cascade="all, delete")

# ==========================
# ✅ SHOWTIME MODEL
# ==========================
class Showtime(Base):
    __tablename__ = "showtimes"  # Keep as showtimes

    id = Column(Integer, primary_key=True, index=True)
    start_time = Column(DateTime, nullable=False)
    end_time = Column(DateTime, nullable=False)
    movie_id = Column(Integer, ForeignKey("movies.id"), nullable=False)
    theatre_id = Column(Integer, ForeignKey("theatres.id"), nullable=False)

    movie = relationship("Movie", back_populates="showtimes")
    theatre = relationship("Theatre", back_populates="showtimes")
    bookings = relationship("Booking", back_populates="showtime", cascade="all, delete")

# ==========================
# ✅ BOOKING MODEL - UPDATED WITH STATUS FIELD
# ==========================
class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    show_id = Column(Integer, ForeignKey("showtimes.id"), nullable=False)  # Fixed: references showtimes.id
    seats = Column(Integer, nullable=False)
    seat_numbers = Column(String(500), nullable=True)
    user_email = Column(String(100), nullable=True)
    amount = Column(Float, nullable=True)
    payment_id = Column(String(100), nullable=True)
    ticket_pdf_path = Column(String(500), nullable=True)
    status = Column(String(50), nullable=False, default="CONFIRMED")
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="bookings")
    showtime = relationship("Showtime", back_populates="bookings")

# ==========================
# ✅ BLACKLISTED TOKEN MODEL
# ==========================
class BlacklistedToken(Base):
    __tablename__ = "blacklisted_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(500), unique=True, nullable=False, index=True)
    blacklisted_on = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)