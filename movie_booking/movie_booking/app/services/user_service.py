from datetime import timedelta
import datetime
from sqlalchemy.orm import Session
from app.database import models
from app.utils import send_email, generate_otp
from app.auth import hash_password
async def register_user(db, username, email, password):
    # Check existing user
    existing = db.query(models.User).filter(models.User.email == email).first()
    if existing:
        raise ValueError("Email already registered")
    otp = generate_otp()
    # expiry = datetime.utcnow() + timedelta(minutes=10)
    new_user = models.User(
        name=username,  # User model uses 'name' not 'username'
        email=email,
        password=hash_password(password),
        otp_code=otp,
        # otp_expiry=expiry,
        is_verified=False
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    subject = "Your OTP for Movie Booking Verification"
    body = f"Hello {username},\n\nYour OTP is: {otp}\nIt will expire in 10 minutes.\n\nThank you!"
    await send_email(email, subject, body)
    return new_user
async def send_reset_email(db: Session, email: str):
    from app.utils import generate_otp
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user:
        raise ValueError("Email not found")
    token = generate_otp()  # Use OTP generator for reset token
    if hasattr(user, 'reset_token'):
        user.reset_token = token
        db.commit()
    link = f"http://localhost:8000/user/reset-password?token={token}"
    await send_email(email, "Reset your password", f"Click here: {link}")
    return True
