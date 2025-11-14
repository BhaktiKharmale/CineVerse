# run_uvicorn.py
# Launcher used for debugging in VS Code (no uvicorn reload subprocess).
import os
import sys

# Ensure we add the package folder that contains `app` to sys.path.
PROJECT_PACKAGE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "movie_booking", "movie_booking"))
if PROJECT_PACKAGE_DIR not in sys.path:
    sys.path.insert(0, PROJECT_PACKAGE_DIR)

# Safe defaults so import-time DB code doesn't explode if env vars are missing.
os.environ.setdefault("SQLALCHEMY_DATABASE_URL", "sqlite:///./dev_local.db")
os.environ.setdefault("DATABASE_URL", "sqlite:///./dev_local.db")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("PAYMENT_GATEWAY", "fallback")
os.environ.setdefault("PUBLIC_BASE_URL", "http://127.0.0.1:8000")

# Also set PYTHONPATH env var for subprocesses started by the debugger.
os.environ.setdefault("PYTHONPATH", PROJECT_PACKAGE_DIR)

# quick debug print (helpful while troubleshooting)
print("run_uvicorn: PROJECT_PACKAGE_DIR =", PROJECT_PACKAGE_DIR)
print("run_uvicorn: sys.path[0] =", sys.path[0])

# Import the FastAPI app object explicitly (this must succeed)
try:
    # This import should resolve to movie_booking/movie_booking/app/main.py
    from app.main import app
except Exception:
    print("Failed to import app.main. Current sys.path:")
    import traceback, sys
    traceback.print_exc()
    print(sys.path)
    raise

if __name__ == "__main__":
    import uvicorn
    # IMPORTANT: reload=False so uvicorn does NOT spawn a reloader subprocess that might lose sys.path.
    uvicorn.run(app, host="127.0.0.1", port=8000, reload=False)
