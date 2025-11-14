import logging
import os
import secrets
from email.message import EmailMessage
from typing import Any, Optional

import aiosmtplib
import bcrypt
from dotenv import load_dotenv
from email_validator import EmailNotValidError, validate_email

load_dotenv()

logger = logging.getLogger(__name__)

EMAIL_USER = os.getenv("EMAIL_USER")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD")
SMTP_SERVER = os.getenv("SMTP_SERVER")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", 12))


# ---------------- Password Hashing ----------------
def _normalize_password(password: str | bytes) -> bytes:
    if isinstance(password, str):
        password_bytes = password.encode("utf-8")
    elif isinstance(password, bytes):
        password_bytes = password
    else:
        raise TypeError("Password must be str or bytes")

    if len(password_bytes) > 72:
        logger.debug("Truncating password to 72 bytes for bcrypt compatibility")
        password_bytes = password_bytes[:72]
    return password_bytes


def hash_password(password: str | bytes) -> str:
    """Hash a password using bcrypt with constant-time truncation."""
    secret = _normalize_password(password)
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    hashed = bcrypt.hashpw(secret, salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str | bytes, hashed_password: str | bytes) -> bool:
    """Verify the provided password against the stored bcrypt hash."""
    if not hashed_password:
        return False

    secret = _normalize_password(plain_password)
    hashed = hashed_password.encode("utf-8") if isinstance(hashed_password, str) else hashed_password
    try:
        return bcrypt.checkpw(secret, hashed)
    except ValueError:
        # Occurs if hashed value is not a valid bcrypt hash
        logger.exception("Failed to verify bcrypt hash due to invalid stored value")
        return False

# ---------------- Email ----------------
async def send_email(to_email: str, subject: str, body: str) -> Optional[Any]:
    message = EmailMessage()
    message["From"] = f"Movie Booking <{EMAIL_USER}>"
    message["To"] = to_email
    message["Subject"] = subject
    message.set_content(body)

    try:
        response = await aiosmtplib.send(
            message,
            hostname=SMTP_SERVER,
            port=SMTP_PORT,
            start_tls=True,
            username=EMAIL_USER,
            password=EMAIL_PASSWORD,
        )
        logger.info("Email sent response: %s", response)
        return response
    except Exception as e:
        logger.exception("Failed to send email via SMTP: %s", e)
        return None

# ---------------- OTP / Token ----------------
def generate_otp(length: int = 6):
    return ''.join([str(secrets.randbelow(10)) for _ in range(length)])

def generate_token(length: int = 32):
    return secrets.token_urlsafe(length)

# ---------------- Email Validation ----------------
def validate_user_email(email: str):
    try:
        valid = validate_email(email)
        return valid.email
    except EmailNotValidError as e:
        raise ValueError(f"Invalid email: {str(e)}")
