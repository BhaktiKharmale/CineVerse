"""
FastAPI routes for AI agent
"""
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import JSONResponse
from app.ai.config import AI_ENABLED, check_ai_enabled
from app.ai.schema import AskRequest, AskResponse
from app.ai.agent import get_agent, clear_agent
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Agent"])


@router.get("/health")
def ai_health():
    """Check if AI agent is enabled and healthy"""
    if not AI_ENABLED:
        return {
            "ok": False,
            "status": "disabled",
            "message": "AI features are disabled. Set OPENAI_API_KEY in .env to enable."
        }
    
    try:
        from app.ai.config import LLM_MODEL
        return {
            "ok": True,
            "model": LLM_MODEL,
            "status": "healthy",
            "message": "AI agent is operational"
        }
    except Exception as e:
        return {
            "ok": False,
            "status": "unhealthy",
            "error": str(e)
        }


@router.post("/ask", response_model=AskResponse)
async def ask_question(request: AskRequest):
    """
    Non-streaming Q&A endpoint
    
    Send a question and get a complete answer with tool execution log.
    """
    try:
        check_ai_enabled()
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    
    try:
        # Generate session ID and owner token if not provided
        session_id = request.session_id or str(uuid.uuid4())
        owner_token = request.owner_token or str(uuid.uuid4())
        
        # Get agent
        agent = get_agent(session_id, owner_token)
        
        # Run agent
        result = agent.run(request.message)
        
        return AskResponse(
            answer=result["answer"],
            tool_calls=result["tool_calls"],
            session_id=result["session_id"],
            trace_id=result["trace_id"]
        )
        
    except Exception as e:
        logger.error(f"Error in /ai/ask: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clear-session")
async def clear_session(session_id: str):
    """Clear agent session and memory"""
    try:
        clear_agent(session_id)
        return {"message": f"Session {session_id} cleared successfully"}
    except Exception as e:
        logger.error(f"Error clearing session: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions")
async def list_sessions():
    """List active agent sessions (for debugging)"""
    from app.ai.agent import _agent_registry
    return {
        "active_sessions": list(_agent_registry.keys()),
        "count": len(_agent_registry)
    }
