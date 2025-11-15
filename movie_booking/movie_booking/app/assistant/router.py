"""
FastAPI routes for the assistant
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from typing import Dict, Any, Optional, List
from app.assistant.config import ASSISTANT_ENABLED, check_assistant_enabled, ASSISTANT_DEBUG
from app.assistant.schema import AssistantRequest, AssistantResponse
from app.assistant.service import process_message
import logging
import uuid
from collections import defaultdict
from time import time
import asyncio

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/assistant", tags=["Assistant"])

# Simple rate limiting (in-memory, for development)
from app.assistant.config import MAX_REQUESTS_PER_MINUTE
_rate_limit_store: Dict[str, list] = defaultdict(list)
_max_requests_per_minute = MAX_REQUESTS_PER_MINUTE

# Deduplication store (Requirement 2, 3)
# Maps client_message_id -> processing state
_dedupe_store: Dict[str, Dict[str, Any]] = {}
# Lock store to prevent concurrent processing of same client_message_id
_processing_locks: Dict[str, asyncio.Lock] = {}
_lock_dict_lock: Optional[asyncio.Lock] = None
DEDUPE_TTL = 600  # 10 minutes

# Requirement 6.B: Metrics tracking
_metrics: Dict[str, Any] = {
    "duplicate_requests_count": 0,
    "inflight_requests": 0,
    "processed_requests_per_minute": [],
    "idempotency_reuse_count": 0,
    "total_requests": 0,
}

def _increment_metric(metric_name: str, value: int = 1):
    """Increment a metric"""
    if metric_name in _metrics:
        if isinstance(_metrics[metric_name], int):
            _metrics[metric_name] += value
        elif isinstance(_metrics[metric_name], list):
            _metrics[metric_name].append(time.time())
            # Keep only last minute
            one_minute_ago = time.time() - 60
            _metrics[metric_name] = [t for t in _metrics[metric_name] if t > one_minute_ago]

def _get_lock_dict_lock() -> asyncio.Lock:
    """Get or create the lock for protecting the locks dict"""
    global _lock_dict_lock
    if _lock_dict_lock is None:
        try:
            _lock_dict_lock = asyncio.Lock()
        except RuntimeError:
            # No event loop, create a new one (shouldn't happen in FastAPI context)
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            _lock_dict_lock = asyncio.Lock()
    return _lock_dict_lock

def _cleanup_dedupe_store():
    """Remove expired entries from dedupe store"""
    current_time = time()
    expired_keys = [
        key for key, entry in _dedupe_store.items()
        if current_time - entry.get("timestamp", 0) > DEDUPE_TTL
    ]
    for key in expired_keys:
        del _dedupe_store[key]
        # Clean up associated lock if exists
        if key in _processing_locks:
            del _processing_locks[key]

async def _get_or_create_lock(client_message_id: str) -> asyncio.Lock:
    """Get or create a lock for a client_message_id"""
    if client_message_id not in _processing_locks:
        lock_dict_lock = _get_lock_dict_lock()
        async with lock_dict_lock:
            # Double-check after acquiring lock
            if client_message_id not in _processing_locks:
                _processing_locks[client_message_id] = asyncio.Lock()
    return _processing_locks[client_message_id]

def _get_dedupe_status(client_message_id: str) -> Optional[Dict[str, Any]]:
    """Get deduplication status for a client_message_id"""
    _cleanup_dedupe_store()
    return _dedupe_store.get(client_message_id)

def _set_dedupe_status(client_message_id: str, status: str, result: Optional[Dict[str, Any]] = None, processing_id: Optional[str] = None):
    """Set deduplication status"""
    _dedupe_store[client_message_id] = {
        "status": status,
        "result": result,
        "processing_id": processing_id,
        "timestamp": time()
    }
    # Limit store size
    if len(_dedupe_store) > 1000:
        # Remove oldest 500 entries
        sorted_entries = sorted(_dedupe_store.items(), key=lambda x: x[1].get("timestamp", 0))
        for key, _ in sorted_entries[:500]:
            del _dedupe_store[key]
            # Clean up associated lock if exists
            if key in _processing_locks:
                del _processing_locks[key]


def check_rate_limit(session_id: str) -> tuple[bool, Optional[float]]:
    """
    Check if session has exceeded rate limit
    
    Returns:
        Tuple of (allowed, retry_after_seconds)
    """
    now = time()
    requests = _rate_limit_store[session_id]
    
    # Remove old requests (>1 minute ago)
    requests[:] = [req_time for req_time in requests if now - req_time < 60]
    
    # Check limit
    if len(requests) >= _max_requests_per_minute:
        # Calculate retry after (time until oldest request expires)
        if requests:
            oldest_request = min(requests)
            retry_after = 60 - (now - oldest_request)
            return False, max(1.0, retry_after)
        return False, 60.0
    
    # Add current request
    requests.append(now)
    return True, None


@router.get("/health")
def assistant_health() -> Dict[str, Any]:
    """Check if assistant is enabled and healthy"""
    if not ASSISTANT_ENABLED:
        return {
            "ok": False,
            "status": "disabled",
            "message": "Assistant features are disabled. Set OPENAI_API_KEY in .env to enable."
        }
    
    try:
        from app.assistant.config import LLM_MODEL
        return {
            "ok": True,
            "model": LLM_MODEL,
            "status": "healthy",
            "message": "Assistant is operational",
            "debug": ASSISTANT_DEBUG
        }
    except Exception as e:
        return {
            "ok": False,
            "status": "unhealthy",
            "error": str(e)
        }


@router.post("/chat", response_model=AssistantResponse)
async def chat(request: AssistantRequest) -> AssistantResponse:
    """
    Chat endpoint for the assistant with deduplication support
    
    Send a message and get a response with optional tool execution.
    Guarantees single processing per client_message_id.
    """
    # Validate client_message_id is present and not empty
    client_message_id = request.client_message_id
    if not client_message_id or not client_message_id.strip():
        logger.warning("Request missing client_message_id")
        raise HTTPException(
            status_code=400,
            detail="client_message_id is required and cannot be empty"
        )
    
    logger.info(f"[{client_message_id}] Received chat request")
    
    try:
        check_assistant_enabled()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    
    # Requirement 6.B: Track total requests
    _increment_metric("total_requests")
    _increment_metric("inflight_requests", 1)
    
    # FIRST: Check deduplication status BEFORE any processing
    dedupe_status = _get_dedupe_status(client_message_id)
    if dedupe_status:
        status = dedupe_status["status"]
        # Requirement 6.B: Track duplicate requests
        _increment_metric("duplicate_requests_count")
        logger.info(f"[{client_message_id}] Duplicate request detected, status: {status} (origin: backend deduplication)")
        
        if status == "processing":
            # Still processing, return accepted with processing_id
            _increment_metric("inflight_requests", -1)
            return AssistantResponse(
                message="",
                tool_calls=[],
                session_id=request.session_id or "",
                trace_id=dedupe_status.get("processing_id", ""),
                client_message_id=client_message_id,
                status="accepted",
                processing_id=dedupe_status.get("processing_id")
            )
        elif status == "completed":
            # Already completed, return existing result
            _increment_metric("inflight_requests", -1)
            existing_result = dedupe_status.get("result")
            if existing_result:
                return AssistantResponse(
                    message=existing_result.get("message", ""),
                    tool_calls=existing_result.get("tool_calls"),
                    session_id=existing_result.get("session_id", request.session_id or ""),
                    trace_id=existing_result.get("trace_id", ""),
                    client_message_id=client_message_id,
                    status="duplicate",
                    error=existing_result.get("error")
                )
    
    # Get or create lock for this client_message_id to prevent concurrent processing
    lock = await _get_or_create_lock(client_message_id)
    
    # Try to acquire lock with very short timeout (non-blocking)
    try:
        await asyncio.wait_for(lock.acquire(), timeout=0.001)
    except asyncio.TimeoutError:
        # Lock is held by another request - check status again
        dedupe_status = _get_dedupe_status(client_message_id)
        if dedupe_status:
            status = dedupe_status["status"]
            if status == "processing":
                return AssistantResponse(
                    message="",
                    tool_calls=[],
                    session_id=request.session_id or "",
                    trace_id=dedupe_status.get("processing_id", ""),
                    client_message_id=client_message_id,
                    status="accepted",
                    processing_id=dedupe_status.get("processing_id")
                )
            elif status == "completed":
                existing_result = dedupe_status.get("result")
                if existing_result:
                    return AssistantResponse(
                        message=existing_result.get("message", ""),
                        tool_calls=existing_result.get("tool_calls"),
                        session_id=existing_result.get("session_id", request.session_id or ""),
                        trace_id=existing_result.get("trace_id", ""),
                        client_message_id=client_message_id,
                        status="duplicate",
                        error=existing_result.get("error")
                    )
        # Still processing, return error
        raise HTTPException(status_code=429, detail="Request is already being processed. Please wait.")
    
    try:
        # Double-check deduplication status AFTER acquiring lock (critical section)
        dedupe_status = _get_dedupe_status(client_message_id)
        if dedupe_status:
            status = dedupe_status["status"]
            logger.info(f"[{client_message_id}] Duplicate request detected after lock, status: {status}")
            
            if status == "completed":
                # Already completed, return existing result
                existing_result = dedupe_status.get("result")
                if existing_result:
                    return AssistantResponse(
                        message=existing_result.get("message", ""),
                        tool_calls=existing_result.get("tool_calls"),
                        session_id=existing_result.get("session_id", request.session_id or ""),
                        trace_id=existing_result.get("trace_id", ""),
                        client_message_id=client_message_id,
                        status="duplicate",
                        error=existing_result.get("error")
                    )
            elif status == "processing":
                # Another request started processing - return accepted
                return AssistantResponse(
                    message="",
                    tool_calls=[],
                    session_id=request.session_id or "",
                    trace_id=dedupe_status.get("processing_id", ""),
                    client_message_id=client_message_id,
                    status="accepted",
                    processing_id=dedupe_status.get("processing_id")
                )
        
        # Generate session ID and owner token if not provided
        session_id = request.session_id or str(uuid.uuid4())
        owner_token = request.owner_token or str(uuid.uuid4())
        processing_id = str(uuid.uuid4())
        
        # Mark as processing immediately BEFORE rate limiting (Requirement 3)
        # This prevents other requests from processing the same message
        _set_dedupe_status(client_message_id, "processing", processing_id=processing_id)
        
        # Rate limiting - check before processing
        allowed, retry_after = check_rate_limit(session_id)
        if not allowed:
            retry_seconds = int(retry_after) if retry_after else 60
            _set_dedupe_status(client_message_id, "failed", result={"error": "Rate limit exceeded"})
            raise HTTPException(
                status_code=429,
                detail=f"Rate limit exceeded. Please wait {retry_seconds} seconds before trying again.",
                headers={"Retry-After": str(retry_seconds)}
            )
        
        # Convert history if provided
        history = None
        if request.history:
            from app.assistant.schema import AssistantMessage
            history = [
                AssistantMessage(role=msg["role"], content=msg["content"])
                if isinstance(msg, dict) else msg
                for msg in request.history
            ]
        
        try:
            # Process message with client_message_id for idempotency
            # This is the ONLY place where OpenAI API is called for this client_message_id
            result = await process_message(
                message=request.message,
                session_id=session_id,
                owner_token=owner_token,
                history=history,
                client_message_id=client_message_id
            )
            
            # Mark as completed and store result (Requirement 3)
            _set_dedupe_status(client_message_id, "completed", result=result)
            
            # Requirement 6.B: Track processed requests
            _increment_metric("processed_requests_per_minute", 1)
            _increment_metric("inflight_requests", -1)
            
            logger.info(f"[{client_message_id}] Processing completed successfully (trace_id: {result.get('trace_id')})")
            
            return AssistantResponse(
                message=result["message"],
                tool_calls=result.get("tool_calls"),
                session_id=result["session_id"],
                trace_id=result["trace_id"],
                client_message_id=client_message_id,
                status="completed",
                error=result.get("error")
            )
        
        except HTTPException:
            _set_dedupe_status(client_message_id, "failed")
            _increment_metric("inflight_requests", -1)
            raise
        except Exception as e:
            logger.error(f"[{client_message_id}] Error in /api/assistant/chat: {e}", exc_info=True)
            _set_dedupe_status(client_message_id, "failed", result={"error": str(e)})
            _increment_metric("inflight_requests", -1)
            raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")
    finally:
        # Always release the lock
        lock.release()


@router.get("/sessions/{session_id}/clear")
async def clear_session(session_id: str) -> Dict[str, Any]:
    """Clear rate limit data for a session (for testing)"""
    if session_id in _rate_limit_store:
        del _rate_limit_store[session_id]
    return {"message": f"Session {session_id} cleared"}


@router.get("/metrics")
async def get_metrics() -> Dict[str, Any]:
    """Get deduplication metrics (Requirement 6.B)"""
    # Calculate processed requests per minute
    processed_per_minute = len(_metrics["processed_requests_per_minute"])
    
    # Calculate idempotency reuse rate (if we track it)
    total_processed = _metrics["total_requests"]
    duplicate_count = _metrics["duplicate_requests_count"]
    reuse_rate = (duplicate_count / total_processed * 100) if total_processed > 0 else 0.0
    
    return {
        "duplicate_requests_count": _metrics["duplicate_requests_count"],
        "inflight_requests": _metrics["inflight_requests"],
        "processed_requests_per_minute": processed_per_minute,
        "total_requests": total_processed,
        "idempotency_reuse_rate": round(reuse_rate, 2),
        "metrics_updated_at": time.time()
    }


# ========================================
# Chat History Endpoints (Optional Server Sync)
# ========================================

# Simple in-memory store for chat history (in production, use a database)
# Key: user_id (or session_id for anonymous), Value: list of ChatSession
_history_store: Dict[str, List[Dict[str, Any]]] = {}

def _sanitize_session(session: Dict[str, Any]) -> Dict[str, Any]:
    """Remove sensitive fields from session before storing"""
    sanitized = session.copy()
    
    # Remove sensitive payment data from messages
    if "messages" in sanitized:
        sanitized["messages"] = [
            {
                **msg,
                "text": _sanitize_text(msg.get("text", ""))
            }
            for msg in sanitized["messages"]
        ]
    
    # Keep bookingId and lockId (safe references), but remove payment tokens
    if "meta" in sanitized:
        meta = sanitized["meta"].copy()
        # Remove any payment-related sensitive data
        meta.pop("payment_token", None)
        meta.pop("upi_id", None)
        sanitized["meta"] = meta
    
    return sanitized


def _sanitize_text(text: str) -> str:
    """Sanitize text to remove sensitive patterns"""
    import re
    # Redact UPI IDs
    text = re.sub(r'\b[\w.-]+@(paytm|upi|ybl|okaxis|payu)\b', '[UPI_REDACTED]', text, flags=re.IGNORECASE)
    # Redact long tokens
    text = re.sub(r'\b[a-zA-Z0-9]{40,}\b', '[TOKEN_REDACTED]', text)
    # Redact credit card patterns
    text = re.sub(r'\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b', '[CARD_REDACTED]', text)
    return text


def _get_user_id(session_id: Optional[str] = None) -> str:
    """Get user identifier (for now, use session_id or anonymous)"""
    # In a real app, this would extract user ID from auth token
    # For now, use session_id or default to "anonymous"
    return session_id or "anonymous"


@router.get("/history")
async def get_history(
    session_id: Optional[str] = None,
    limit: int = 200,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Get chat history for the current user/session
    
    Returns paginated list of chat sessions
    """
    user_id = _get_user_id(session_id)
    sessions = _history_store.get(user_id, [])
    
    # Sort by updatedAt descending
    sorted_sessions = sorted(
        sessions,
        key=lambda s: s.get("updatedAt", ""),
        reverse=True
    )
    
    # Paginate
    paginated = sorted_sessions[offset:offset + limit]
    
    return {
        "sessions": paginated,
        "total": len(sorted_sessions),
        "limit": limit,
        "offset": offset
    }


@router.post("/history")
async def save_history_session(session: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create or update a chat session
    
    Stores session history on the server (if sync enabled)
    """
    user_id = _get_user_id(session.get("id"))
    
    # Sanitize before storing
    sanitized = _sanitize_session(session)
    
    # Get or create user's session list
    if user_id not in _history_store:
        _history_store[user_id] = []
    
    # Find existing session or add new
    session_id = sanitized.get("id")
    existing_index = None
    if session_id:
        for i, s in enumerate(_history_store[user_id]):
            if s.get("id") == session_id:
                existing_index = i
                break
    
    if existing_index is not None:
        # Update existing
        _history_store[user_id][existing_index] = sanitized
    else:
        # Add new
        _history_store[user_id].append(sanitized)
    
    # Enforce limit (keep most recent)
    if len(_history_store[user_id]) > 200:
        sorted_sessions = sorted(
            _history_store[user_id],
            key=lambda s: s.get("updatedAt", ""),
            reverse=True
        )
        _history_store[user_id] = sorted_sessions[:200]
    
    return {
        "ok": True,
        "session_id": session_id,
        "message": "Session saved"
    }


@router.get("/history/{session_id}")
async def get_history_session(session_id: str) -> Dict[str, Any]:
    """Get a specific chat session by ID"""
    # Search across all users (in production, filter by authenticated user)
    for user_sessions in _history_store.values():
        for session in user_sessions:
            if session.get("id") == session_id:
                return session
    
    raise HTTPException(status_code=404, detail="Session not found")


@router.delete("/history/{session_id}")
async def delete_history_session(session_id: str) -> Dict[str, Any]:
    """Delete a chat session"""
    # Search and remove across all users
    for user_id, user_sessions in _history_store.items():
        for i, session in enumerate(user_sessions):
            if session.get("id") == session_id:
                _history_store[user_id].pop(i)
                return {"ok": True, "message": "Session deleted"}
    
    raise HTTPException(status_code=404, detail="Session not found")


@router.delete("/history")
async def clear_all_history(session_id: Optional[str] = None) -> Dict[str, Any]:
    """Clear all history for the current user/session"""
    user_id = _get_user_id(session_id)
    if user_id in _history_store:
        del _history_store[user_id]
    return {"ok": True, "message": "All history cleared"}


@router.post("/history/export/{session_id}")
async def export_history_session(session_id: str) -> Dict[str, Any]:
    """Export a session as JSON"""
    # Search across all users
    for user_sessions in _history_store.values():
        for session in user_sessions:
            if session.get("id") == session_id:
                return {
                    "ok": True,
                    "session": session,
                    "exported_at": __import__("datetime").datetime.now().isoformat()
                }
    
    raise HTTPException(status_code=404, detail="Session not found")
