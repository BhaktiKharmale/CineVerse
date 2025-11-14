# app/database/payment_models.py
"""
Payment-related database models
"""
from sqlalchemy import Column, Integer, String, DateTime, Float, JSON
from datetime import datetime
from app.database.database import Base


class Payment(Base):
    """Payment transactions"""
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(String(100), unique=True, nullable=False, index=True)  # Razorpay order_id
    payment_id = Column(String(100), unique=True, nullable=True, index=True)  # Razorpay payment_id
    status = Column(String(50), nullable=False, default="CREATED")  # CREATED, PAID, FAILED, REFUNDED
    amount = Column(Float, nullable=False)  # Amount in paise (keep same convention as code)
    currency = Column(String(10), default="INR")
    user_email = Column(String(100), nullable=False)
    booking_id = Column(Integer, nullable=True)  # Links to booking after successful payment
    meta = Column(JSON, nullable=True)  # Additional metadata (showtime_id, seat_ids, etc.)
    razorpay_signature = Column(String(500), nullable=True)  # HMAC signature
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Order(Base):
    """Order records (pre-payment)"""
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(String(100), unique=True, nullable=False, index=True)  # Razorpay order_id or dev id
    amount = Column(Float, nullable=False)  # Amount in paise
    currency = Column(String(10), default="INR")
    seats = Column(String(500), nullable=False)  # Comma-separated seat IDs
    showtime_id = Column(Integer, nullable=False)
    user_email = Column(String(100), nullable=False)
    user_id = Column(Integer, nullable=True)  # If logged in
    status = Column(String(50), nullable=False, default="CREATED")  # CREATED, PAID, FAILED, EXPIRED
    meta = Column(JSON, nullable=True)  # Theatre name, movie title, etc.
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
