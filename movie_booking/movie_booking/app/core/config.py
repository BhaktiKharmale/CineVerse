"""
Application configuration and settings
"""
import os
from dotenv import load_dotenv

load_dotenv()

# Redis Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
SEAT_LOCK_TTL_MS = int(os.getenv("SEAT_LOCK_TTL_MS", "180000"))  # 3 minutes default
SEAT_LOCK_PREFIX = os.getenv("SEAT_LOCK_PREFIX", "cineverse")

# Database Configuration (reference)
DATABASE_URL = os.getenv("DATABASE_URL")

# Razorpay Configuration
RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID", "")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET", "")
PAYMENTS_WEBHOOK_SECRET = os.getenv("PAYMENTS_WEBHOOK_SECRET", "")
PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://127.0.0.1:8001")
PAYMENT_GATEWAY = os.getenv("PAYMENT_GATEWAY", "razorpay")  # razorpay | upi_qr

# Settings class for backward compatibility
class Settings:
    PROJECT_NAME: str = "CineVerse API"
    VERSION: str = "1.0.0"
    REDIS_URL = REDIS_URL
    SEAT_LOCK_TTL_MS = SEAT_LOCK_TTL_MS
    SEAT_LOCK_PREFIX = SEAT_LOCK_PREFIX
    RAZORPAY_KEY_ID = RAZORPAY_KEY_ID
    RAZORPAY_KEY_SECRET = RAZORPAY_KEY_SECRET
    PAYMENTS_WEBHOOK_SECRET = PAYMENTS_WEBHOOK_SECRET
    PUBLIC_BASE_URL = PUBLIC_BASE_URL
    PAYMENT_GATEWAY = PAYMENT_GATEWAY

settings = Settings()

