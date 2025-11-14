"""
Pydantic models for AI chat and tool I/O
"""
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

# ========================================
# Chat Request/Response Models
# ========================================

class ChatMessage(BaseModel):
    """Single chat message"""
    role: str = Field(..., description="Message role: 'user' or 'assistant' or 'system'")
    content: str = Field(..., description="Message content")
    timestamp: Optional[datetime] = None


class AskRequest(BaseModel):
    """Non-streaming Q&A request"""
    message: str = Field(..., description="User question", min_length=1)
    session_id: Optional[str] = Field(default=None, description="Session identifier for context")
    owner_token: Optional[str] = Field(default=None, description="Seat lock owner token")
    
    model_config = {"json_schema_extra": {
        "example": {
            "message": "Find KGF showtimes tonight in Pune",
            "session_id": "session-123",
            "owner_token": "550e8400-e29b-41d4-a716-446655440000"
        }
    }}


class ToolCall(BaseModel):
    """Tool invocation record"""
    tool_name: str
    parameters: Dict[str, Any]
    result: Optional[Any] = None
    error: Optional[str] = None
    duration_ms: Optional[float] = None


class AskResponse(BaseModel):
    """Non-streaming Q&A response"""
    answer: str = Field(..., description="AI assistant's final answer")
    tool_calls: List[ToolCall] = Field(default_factory=list, description="Tools invoked")
    session_id: str
    trace_id: str
    model_config = {"json_schema_extra": {
        "example": {
            "answer": "I found 3 showtimes for KGF in Pune tonight...",
            "tool_calls": [{"tool_name": "get_showtimes_for_movie", "parameters": {"movie_id": 1}}],
            "session_id": "session-123",
            "trace_id": "trace-456"
        }
    }}

# ========================================
# WebSocket Event Models
# ========================================

class UserMessageEvent(BaseModel):
    """User message from client"""
    message: str
    session_id: Optional[str] = None
    owner_token: Optional[str] = None


class AITokenEvent(BaseModel):
    """Streaming token from LLM"""
    token: str
    trace_id: str


class ToolCallEvent(BaseModel):
    """Tool invocation event"""
    tool_name: str
    parameters: Dict[str, Any]
    trace_id: str


class ToolResultEvent(BaseModel):
    """Tool execution result"""
    tool_name: str
    result: Any
    error: Optional[str] = None
    trace_id: str


class FinalAnswerEvent(BaseModel):
    """Final answer from agent"""
    answer: str
    tool_calls: List[ToolCall]
    trace_id: str


class SeatLockUpdateEvent(BaseModel):
    """Seat lock status update"""
    showtime_id: int
    seat_ids: List[int]
    status: str  # "locked", "unlocked", "extended", "conflict"
    owner: Optional[str] = None
    trace_id: str


class BookingStatusEvent(BaseModel):
    """Booking completion status"""
    booking_id: Optional[str] = None
    status: str  # "success", "failed", "pending"
    message: str
    details: Optional[Dict[str, Any]] = None
    trace_id: str


class BookConfirmRequest(BaseModel):
    """Booking confirmation from user"""
    showtime_id: int
    seat_ids: List[int]
    user_email: str
    payment_ref: Optional[str] = Field(default="demo_payment")
    owner_token: str
    trace_id: str


# ========================================
# Context Cards (UI rendering hints)
# ========================================

class MovieCard(BaseModel):
    """Movie information card"""
    id: int
    title: str
    poster_url: Optional[str] = None
    language: Optional[str] = None
    rating: Optional[str] = None
    genre: Optional[str] = None


class ShowtimeCard(BaseModel):
    """Showtime information card"""
    id: int
    movie_title: str
    theatre_name: str
    show_time: str
    price: Optional[float] = None


class SeatMapCard(BaseModel):
    """Seat map card"""
    showtime_id: int
    seats: List[Dict[str, Any]]  # List of seat objects with id, label, status


class ContextCard(BaseModel):
    """Generic context card wrapper"""
    type: str  # "movies", "showtimes", "seats"
    data: Dict[str, Any]
    trace_id: str