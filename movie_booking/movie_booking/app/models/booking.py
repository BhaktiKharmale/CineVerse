# app/models/booking.py
from sqlalchemy import Column, Integer, String, ForeignKey, Float, Boolean, Enum
from sqlalchemy.orm import relationship
from app.database.database import Base
import enum

class BookingStatus(str, enum.Enum):
    pending = "pending"
    confirmed = "confirmed"
    failed = "failed"

class Booking(Base):
    __tablename__ = "bookings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    show_id = Column(Integer, ForeignKey("shows.id"))
    seat_numbers = Column(String)  # e.g., "A1,A2"
    total_amount = Column(Float)
    status = Column(Enum(BookingStatus), default=BookingStatus.pending)
    payment_id = Column(String, nullable=True)

    user = relationship("User")
