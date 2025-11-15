"""
Request and response schemas for the assistant API
"""
from pydantic import BaseModel
from typing import List, Optional, Dict, Any


class AssistantMessage(BaseModel):
    """Message in chat history"""
    role: str  # "user" or "assistant"
    content: str


class AssistantRequest(BaseModel):
    """Request to the assistant"""
    message: str
    client_message_id: str  # Required: unique ID from client to prevent duplicates
    session_id: Optional[str] = None
    owner_token: Optional[str] = None
    history: Optional[List[AssistantMessage]] = None
    last_message_ids: Optional[List[str]] = None  # Last 5 message IDs for deduplication


class ToolCall(BaseModel):
    """Tool call information"""
    tool_name: str
    parameters: Dict[str, Any]
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class AssistantResponse(BaseModel):
    """Response from the assistant"""
    message: str
    tool_calls: Optional[List[ToolCall]] = None
    session_id: str
    trace_id: str
    client_message_id: str  # Echo back the client_message_id
    status: str = "completed"  # "accepted", "duplicate", "completed", "processing"
    processing_id: Optional[str] = None  # If status is "processing" or "accepted"
    error: Optional[str] = None

