"""
AI configuration and environment variables
"""
import os
from dotenv import load_dotenv

load_dotenv()

# OpenAI Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

# API Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8001")

# Redis Configuration (already configured)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Socket.IO Configuration
# CORS origins for Socket.IO server (must match FastAPI CORS origins)
DEFAULT_SOCKET_ORIGINS = [
    "http://localhost:3001",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]
SOCKET_CORS_ORIGINS_ENV = os.getenv("SOCKET_CORS_ORIGINS", "")
if SOCKET_CORS_ORIGINS_ENV:
    SOCKET_CORS_ORIGINS = [origin.strip() for origin in SOCKET_CORS_ORIGINS_ENV.split(",") if origin.strip()]
else:
    SOCKET_CORS_ORIGINS = DEFAULT_SOCKET_ORIGINS

# Agent Configuration
AGENT_VERBOSE = os.getenv("AGENT_VERBOSE", "true").lower() == "true"
AGENT_MAX_STEPS = int(os.getenv("AGENT_MAX_STEPS", "6"))

# Feature flag
AI_ENABLED = OPENAI_API_KEY is not None and len(OPENAI_API_KEY) > 0

def check_ai_enabled():
    """Check if AI features are enabled"""
    if not AI_ENABLED:
        raise RuntimeError(
            "AI features are disabled. Please set OPENAI_API_KEY in .env file. "
            "You can get a key from https://platform.openai.com/api-keys"
        )
    return True

