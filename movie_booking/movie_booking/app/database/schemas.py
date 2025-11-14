# app/database/schemas.py
# =========================================================
# 🧩 Movie Booking System Schemas (Pydantic v2 Compatible)
# =========================================================

from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime


# =========================================================
# ✅ Base Config for ORM Compatibility (Pydantic v2)
# =========================================================
class ConfigModel(BaseModel):
    class Config:
        from_attributes = True   # replaces orm_mode=True


# =========================================================
# 👤 User Schemas
# =========================================================
class UserBase(BaseModel):
    # Accept "username" from JSON but map to "name" internally
    name: str = Field(..., validation_alias="username")
    email: EmailStr
    phone: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase, ConfigModel):
    id: int
    is_active: bool
    created_at: Optional[datetime] = None


# =========================================================
# 🛠 Admin Schemas
# =========================================================
class AdminBase(BaseModel):
    name: str
    email: EmailStr


class AdminCreate(AdminBase):
    password: str


class AdminLogin(BaseModel):
    email: EmailStr
    password: str


class AdminResponse(AdminBase, ConfigModel):
    id: int
    is_active: bool
    created_at: Optional[datetime] = None


# =========================================================
# 🧑‍💼 SuperAdmin Schemas
# =========================================================
class SuperAdminBase(BaseModel):
    name: str
    email: EmailStr


class SuperAdminCreate(SuperAdminBase):
    password: str


class SuperAdminLogin(BaseModel):
    email: EmailStr
    password: str


class SuperAdminResponse(SuperAdminBase, ConfigModel):
    id: int
    is_active: bool
    created_at: Optional[datetime] = None


# =========================================================
# 🎬 Movie Schemas
# =========================================================
class MovieBase(BaseModel):
    title: str
    description: Optional[str] = None
    duration: int  # minutes
    genre: str
    language: str
    release_date: datetime


class MovieCreate(MovieBase):
    pass


class MovieResponse(MovieBase, ConfigModel):
    id: int
    is_active: bool


# =========================================================
# 🏛 Theatre Schemas
# =========================================================
class TheatreBase(BaseModel):
    name: str
    location: str
    total_seats: int


class TheatreCreate(TheatreBase):
    pass


class TheatreResponse(TheatreBase, ConfigModel):
    id: int
    is_active: bool


# =========================================================
# 🎞 Showtime Schemas
# =========================================================
class ShowtimeBase(BaseModel):
    movie_id: int
    theatre_id: int
    start_time: datetime
    end_time: datetime
    price: float


class ShowtimeCreate(ShowtimeBase):
    pass


class ShowtimeResponse(ShowtimeBase, ConfigModel):
    id: int
    is_active: bool


# =========================================================
# 🔐 Token Schemas
# =========================================================
class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    email: Optional[str] = None
    role: Optional[str] = None

# Backward compatibility aliases
AdminLoginRequest = AdminLogin
UserLoginRequest = UserLogin
SuperAdminLoginRequest = SuperAdminLogin

# Backward compatibility aliases
MovieOut = MovieResponse
ShowtimeResponse = ShowtimeResponse  # already fixed earlier
AdminLoginRequest = AdminLogin

# =========================================================
# 📥 Request Payload Schemas (for clean Swagger bodies)
# =========================================================
from typing import List, Any

class SuperAdminCreateAdmin(BaseModel):
    # Use this when SuperAdmin creates a new admin
    # Accept "username" from JSON but map to "name" internally
    name: str = Field(..., validation_alias="username")
    email: EmailStr
    password: str

class AdminRegisterSchema(BaseModel):
    # Accept "username" from JSON but map to "name" internally
    name: str = Field(..., validation_alias="username")
    email: EmailStr
    password: str
    phone: Optional[str] = None

class AdminVerifyOtpSchema(BaseModel):
    email: EmailStr
    otp: str

class ScreenUpdateSchema(BaseModel):
    screen_id: int
    name: Optional[str] = None
    location: Optional[str] = None
    total_seats: Optional[int] = None
    seat_layout: Optional[Any] = None

class OfflineBookingSchema(BaseModel):
    showtime_id: int
    seat_ids: List[int]
    customer_name: Optional[str] = None
    customer_phone: Optional[str] = None

class MovieRequestSchema(BaseModel):
    title: str
    reason: Optional[str] = None

class LockSeatsRequest(BaseModel):
    """Legacy lock seats request (DB-based)"""
    seat_ids: List[int]
    locked_by: Optional[str] = None
    expires_in: Optional[int] = 300


# ========================================
# Redis Seat Locking Schemas
# ========================================

class RedisLockSeatsRequest(BaseModel):
    """
    Request to lock seats using Redis.
    Requires a unique owner identifier per client/session.
    """
    seat_ids: List[int] = Field(..., description="List of seat IDs to lock", min_length=1)
    owner: str = Field(..., description="Unique owner identifier (UUID v4 recommended)", min_length=8)
    ttl_ms: Optional[int] = Field(default=None, description="Lock TTL in milliseconds (default: 180000 = 3 min)")
    
    model_config = {"json_schema_extra": {
        "example": {
            "seat_ids": [101, 102, 103],
            "owner": "550e8400-e29b-41d4-a716-446655440000",
            "ttl_ms": 180000
        }
    }}


class RedisLockSeatsResponse(BaseModel):
    """Response from lock seats operation"""
    success: bool = Field(..., description="Whether all seats were successfully locked")
    locked: List[int] = Field(..., description="List of seat IDs that were locked")
    conflicts: List[int] = Field(..., description="List of seat IDs that conflicted (already locked by others)")
    ttl_ms: int = Field(..., description="Lock duration in milliseconds")
    expires_at: float = Field(..., description="Expiration timestamp (epoch seconds)")
    showtime_id: int = Field(..., description="Showtime identifier")
    
    model_config = {"json_schema_extra": {
        "example": {
            "success": True,
            "locked": [101, 102, 103],
            "conflicts": [],
            "ttl_ms": 180000,
            "expires_at": 1699200000.0,
            "showtime_id": 42
        }
    }}


class RedisUnlockSeatsRequest(BaseModel):
    """Request to release locked seats"""
    seat_ids: List[int] = Field(..., description="List of seat IDs to unlock", min_length=1)
    owner: str = Field(..., description="Owner identifier (must match lock owner)", min_length=8)
    
    model_config = {"json_schema_extra": {
        "example": {
            "seat_ids": [101, 102, 103],
            "owner": "550e8400-e29b-41d4-a716-446655440000"
        }
    }}


class RedisUnlockSeatsResponse(BaseModel):
    """Response from unlock seats operation"""
    released: List[int] = Field(..., description="Seats successfully released")
    not_owned: List[int] = Field(..., description="Seats not owned by requester (or already released)")
    showtime_id: int
    
    model_config = {"json_schema_extra": {
        "example": {
            "released": [101, 102, 103],
            "not_owned": [],
            "showtime_id": 42
        }
    }}


class RedisExtendLocksRequest(BaseModel):
    """Request to extend lock TTL"""
    seat_ids: List[int] = Field(..., description="List of seat IDs to extend", min_length=1)
    owner: str = Field(..., description="Owner identifier", min_length=8)
    ttl_ms: Optional[int] = Field(default=None, description="New TTL in milliseconds")
    
    model_config = {"json_schema_extra": {
        "example": {
            "seat_ids": [101, 102, 103],
            "owner": "550e8400-e29b-41d4-a716-446655440000",
            "ttl_ms": 180000
        }
    }}


class RedisExtendLocksResponse(BaseModel):
    """Response from extend locks operation"""
    extended: List[int] = Field(..., description="Seats with extended TTL")
    not_owned: List[int] = Field(..., description="Seats not owned by requester")
    ttl_ms: int = Field(..., description="New TTL in milliseconds")
    showtime_id: int
    
    model_config = {"json_schema_extra": {
        "example": {
            "extended": [101, 102, 103],
            "not_owned": [],
            "ttl_ms": 180000,
            "showtime_id": 42
        }
    }}


class SeatLockInfo(BaseModel):
    """Information about a single seat lock"""
    seat_id: int
    locked: bool
    owner: Optional[str] = None
    ttl_ms: int = Field(description="Remaining TTL in milliseconds")
    issued_at: Optional[str] = None


class RedisInspectLocksResponse(BaseModel):
    """Response from inspect locks operation"""
    showtime_id: int
    seats: List[SeatLockInfo]
    
    model_config = {"json_schema_extra": {
        "example": {
            "showtime_id": 42,
            "seats": [
                {"seat_id": 101, "locked": True, "owner": "550e8400...", "ttl_ms": 150000, "issued_at": "1699200000000"},
                {"seat_id": 102, "locked": False, "owner": None, "ttl_ms": 0, "issued_at": None}
            ]
        }
    }}
