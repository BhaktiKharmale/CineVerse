"""
Assistant configuration and environment variables
"""
import os
from dotenv import load_dotenv

load_dotenv()

# OpenAI Configuration
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
LLM_MODEL = os.getenv("LLM_MODEL", "gpt-4o-mini")

# Debug mode (for internal logging)
ASSISTANT_DEBUG = os.getenv("ASSISTANT_DEBUG", "false").lower() == "true"

# Rate limiting
MAX_REQUESTS_PER_MINUTE = int(os.getenv("ASSISTANT_MAX_RPM", "30"))
MAX_MESSAGES_PER_SESSION = int(os.getenv("ASSISTANT_MAX_MESSAGES", "50"))

# Session memory
MAX_HISTORY_MESSAGES = int(os.getenv("ASSISTANT_MAX_HISTORY", "20"))

# API Configuration
API_BASE_URL = os.getenv("API_BASE_URL", "http://127.0.0.1:8001")

# Feature flag
ASSISTANT_ENABLED = OPENAI_API_KEY is not None and len(OPENAI_API_KEY) > 0

def check_assistant_enabled():
    """Check if assistant features are enabled"""
    if not ASSISTANT_ENABLED:
        raise RuntimeError(
            "Assistant features are disabled. Please set OPENAI_API_KEY in .env file. "
            "You can get a key from https://platform.openai.com/api-keys"
        )
    return True

