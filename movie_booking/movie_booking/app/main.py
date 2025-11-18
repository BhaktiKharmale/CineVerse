# app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import models
from app.database.database import Base, engine
from contextlib import asynccontextmanager
import logging

logger = logging.getLogger(__name__)

# Lifespan events (startup/shutdown)  
@asynccontextmanager
async def lifespan(app: FastAPI):
    import asyncio
    
    # Redis init (non-fatal)
    # inside lifespan in app/main.py (replace the Redis init block)
    # Redis init (non-fatal)
    try:
        from app.core.redis import get_redis
        # get_redis already performs a ping/test internally in our implementation
        await get_redis()
        logger.info("✓ Redis connected successfully")
    except Exception as e:
        logger.warning(f"⚠ Redis connection failed (seat locking may be disabled): {e}")

    # Assistant will be initialized when requested
    try:
        from app.assistant.config import ASSISTANT_ENABLED, LLM_MODEL
        if ASSISTANT_ENABLED:
            logger.info(f"✓ Assistant enabled (Model: {LLM_MODEL})")
        else:
            logger.info("ℹ️ Assistant disabled (OPENAI_API_KEY not set)")
    except Exception as e:
        logger.warning(f"⚠ Assistant initialization warning: {e}")

    # Yield control to the application
    # If cancelled (e.g., Ctrl+C), the exception will propagate naturally
    # and the shutdown code below will handle cleanup
    yield
    
    # Shutdown: cleanup resources gracefully
    # Wrap entire shutdown in try-except to handle cancellation gracefully
    try:
        logger.info("🔄 Starting graceful shutdown...")
        
        # Close WebSocket connections
        try:
            from app.routers.public_routes import manager
            # Close all active WebSocket connections
            for showtime_id, connections in list(manager.active_connections.items()):
                for websocket in list(connections):
                    try:
                        await websocket.close(code=1001, reason="Server shutting down")
                    except Exception:
                        pass  # Connection may already be closed
            logger.info("✓ WebSocket connections closed")
        except asyncio.CancelledError:
            logger.debug("Shutdown cancelled during WebSocket cleanup")
        except Exception as e:
            logger.debug(f"Error closing WebSocket connections: {e}")
        
        # Cancel any pending background tasks
        try:
            # Get all running tasks (excluding the current one)
            current_task = asyncio.current_task()
            tasks = [task for task in asyncio.all_tasks() 
                     if not task.done() and task is not current_task]
            if tasks:
                logger.info(f"🔄 Cancelling {len(tasks)} background tasks...")
                for task in tasks:
                    task.cancel()
                # Wait a bit for tasks to cancel (with timeout)
                try:
                    await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=2.0)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    pass  # Expected during shutdown
                logger.info("✓ Background tasks cancelled")
        except asyncio.CancelledError:
            logger.debug("Shutdown cancelled during task cancellation")
        except Exception as e:
            logger.debug(f"Error cancelling background tasks: {e}")
        
        # Close redis (non-fatal)
        try:
            from app.core.redis import close_redis
            await close_redis()
            logger.info("✓ Redis connection closed")
        except asyncio.CancelledError:
            # Normal during shutdown - just log
            logger.debug("Shutdown cancelled during Redis cleanup")
        except Exception as e:
            logger.error(f"Error closing Redis: {e}")
        
        logger.info("✅ Graceful shutdown complete")
    except asyncio.CancelledError:
        # If shutdown itself is cancelled, just log and exit
        logger.debug("Shutdown process cancelled (normal during Ctrl+C)")
    except Exception as e:
        logger.error(f"Unexpected error during shutdown: {e}", exc_info=True)

# Build FastAPI app
fastapi_app = FastAPI(
    title="Movie Booking API",
    description="Backend APIs for Movie Booking System",
    version="1.0.0",
    lifespan=lifespan,
)

# Ensure DB models/tables exist
models.Base.metadata.create_all(bind=engine)

# CORS
ALLOWED_ORIGINS = [
    "http://localhost:3001",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3001",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://51.20.76.216:3001",
]
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# --- Register routers under the same /api prefix the frontend expects ---
# IMPORTANT: We mount every router with prefix="/api" here so front-end calls to /api/* resolve.

from app.routers import superadmin_routes, admin_routes, user_routes, public_routes

fastapi_app.include_router(superadmin_routes.router, prefix="/api")
fastapi_app.include_router(admin_routes.router, prefix="/api")
fastapi_app.include_router(user_routes.router, prefix="/api")

# public_routes: if public_routes.py already defines router prefix "/api", this include will produce /api/api routes.
# If you previously put prefix inside public_routes, remove it there and let main.py provide the "/api" prefix.
fastapi_app.include_router(public_routes.router, prefix="/api")

# Payment router — mount under /api too
try:
    from app.routers.payment_routes import router as payment_router
    fastapi_app.include_router(payment_router, prefix="/api")
    logger.info("✓ Payment routes registered at /api")
except Exception as e:
    logger.error(f"✗ Payment routes failed to register: {e}")

# Assistant routes
try:
    from app.assistant.router import router as assistant_router
    fastapi_app.include_router(assistant_router)
    logger.info("✓ Assistant routes registered at /api/assistant")
except Exception as e:
    logger.warning(f"⚠ Assistant routes failed to register: {e}")

# Root and CORS-test endpoints
@fastapi_app.get("/")
def root():
    return {"message": "🎬 CineVerse API is running successfully!"}

@fastapi_app.get("/api/cors-test")
def cors_test():
    return {
        "message": "CORS is working!",
        "cors_origins": ALLOWED_ORIGINS,
        "timestamp": __import__("datetime").datetime.now().isoformat(),
    }

# App is ready (no Socket.IO wrapping needed for new assistant)
app = fastapi_app
