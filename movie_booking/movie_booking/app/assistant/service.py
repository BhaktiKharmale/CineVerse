"""
OpenAI service for the assistant - OPTIMIZED FOR TOKEN EFFICIENCY
"""
from typing import List, Dict, Any, Optional
from openai import OpenAI
from openai import RateLimitError, APIConnectionError, APIError
from app.assistant.config import (
    OPENAI_API_KEY, LLM_MODEL, ASSISTANT_DEBUG,
    check_assistant_enabled, MAX_HISTORY_MESSAGES
)
from app.assistant.tools import ALL_TOOLS, debug_log
from app.assistant.schema import AssistantMessage, ToolCall
import logging
import json
import uuid
import asyncio
import time
import re
import hashlib
import random

logger = logging.getLogger(__name__)

# Initialize OpenAI client
_client: Optional[OpenAI] = None

def get_openai_client() -> OpenAI:
    """Get or create OpenAI client"""
    global _client
    if _client is None:
        check_assistant_enabled()
        _client = OpenAI(api_key=OPENAI_API_KEY)
    return _client


# ========================================
# MINIMAL SYSTEM PROMPT (Requirement 2)
# ========================================
SYSTEM_PROMPT = "You are CineVerse's booking assistant. Help users find movies, showtimes, and book seats. Use tools to fetch data. Keep responses to 3-6 sentences."


# ========================================
# CACHING SYSTEM (Requirement 8)
# ========================================
_cache: Dict[str, Dict[str, Any]] = {}
CACHE_TTL = 60  # 60 seconds

def _get_cache_key(query_type: str, params: Dict[str, Any]) -> str:
    """Generate cache key from query type and parameters"""
    key_str = f"{query_type}:{json.dumps(params, sort_keys=True)}"
    return hashlib.md5(key_str.encode()).hexdigest()

def _get_cached(query_type: str, params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Get cached result if available and not expired"""
    cache_key = _get_cache_key(query_type, params)
    if cache_key in _cache:
        entry = _cache[cache_key]
        if time.time() - entry["timestamp"] < CACHE_TTL:
            return entry["data"]
        else:
            del _cache[cache_key]
    return None

def _set_cache(query_type: str, params: Dict[str, Any], data: Dict[str, Any]):
    """Cache a result"""
    cache_key = _get_cache_key(query_type, params)
    _cache[cache_key] = {
        "data": data,
        "timestamp": time.time()
    }
    # Limit cache size
    if len(_cache) > 100:
        # Remove oldest entries
        sorted_entries = sorted(_cache.items(), key=lambda x: x[1]["timestamp"])
        for key, _ in sorted_entries[:50]:
            del _cache[key]


# ========================================
# TOKEN ESTIMATION (Requirement 7)
# ========================================
def _estimate_tokens(text: str) -> int:
    """Rough token estimation: ~4 characters per token"""
    return len(text) // 4

def _estimate_message_tokens(messages: List[Dict[str, Any]]) -> int:
    """Estimate total tokens for a message list"""
    total = 0
    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, str):
            total += _estimate_tokens(content)
        elif isinstance(content, list):
            total += sum(_estimate_tokens(str(item)) for item in content)
        # Add overhead for message structure
        total += 10
    return total


# ========================================
# MESSAGE COMPRESSION (Requirement 4, 12)
# ========================================
def _shorten_user_input(text: str, max_length: int = 300) -> str:
    """Shorten user input if it exceeds max_length (Requirement 4)"""
    if len(text) <= max_length:
        return text.strip()
    
    # Try to find a good breaking point (sentence end)
    shortened = text[:max_length]
    last_period = shortened.rfind('.')
    last_question = shortened.rfind('?')
    last_exclamation = shortened.rfind('!')
    last_newline = shortened.rfind('\n')
    
    break_point = max(last_period, last_question, last_exclamation, last_newline)
    if break_point > max_length * 0.7:  # If we found a good break point
        return text[:break_point + 1].strip() + "..."
    
    return shortened.strip() + "..."


def _compress_tool_response(tool_result: Dict[str, Any]) -> Dict[str, Any]:
    """Compress tool response to minimal data (Requirement 5)"""
    if not tool_result.get("ok"):
        return {"ok": False, "error": tool_result.get("error", "Unknown error")[:100]}
    
    compressed = {"ok": True}
    
    # Compress based on tool type (infer from data structure)
    if "movies" in tool_result:
        # Compress movie list
        movies = tool_result.get("movies", [])
        compressed["movies"] = [
            {"id": m.get("id"), "title": m.get("title"), "rating": m.get("rating")}
            for m in movies[:10]  # Limit to 10 movies
        ]
        compressed["count"] = len(movies)
    
    elif "showtimes" in tool_result or "theatres" in tool_result:
        # Compress showtimes - only keep id and time
        showtimes_data = tool_result.get("showtimes") or tool_result.get("theatres", {})
        compressed_showtimes = {}
        for theatre, shows in showtimes_data.items():
            if isinstance(shows, list):
                compressed_showtimes[theatre] = [
                    {"id": s.get("id"), "time": s.get("start_time") or s.get("time")}
                    for s in shows[:5]  # Limit to 5 per theatre
                ]
        compressed["showtimes"] = compressed_showtimes
    
    elif "seat_map" in tool_result:
        # Compress seat map - only essential data
        seat_map = tool_result.get("seat_map", {})
        compressed["seat_map"] = {
            "showtime_id": seat_map.get("showtime_id"),
            "sections": [
                {
                    "name": s.get("name"),
                    "seats": [
                        {"id": seat.get("seat_id"), "label": seat.get("label"), "status": seat.get("status")}
                        for seat in s.get("seats", [])[:50]  # Limit seats
                    ]
                }
                for s in seat_map.get("sections", [])[:5]  # Limit sections
            ]
        }
    
    elif "locked" in tool_result or "released" in tool_result:
        # Lock/unlock results - minimal
        compressed["locked"] = tool_result.get("locked", [])
        compressed["released"] = tool_result.get("released", [])
        compressed["message"] = tool_result.get("message", "")[:50]
    
    elif "booking_id" in tool_result or "order_id" in tool_result:
        # Booking/order results - minimal
        compressed["booking_id"] = tool_result.get("booking_id")
        compressed["order_id"] = tool_result.get("order_id")
        compressed["message"] = tool_result.get("message", "")[:50]
    
    else:
        # Generic compression - keep only essential fields
        for key in ["ok", "id", "message", "count", "error"]:
            if key in tool_result:
                value = tool_result[key]
                if isinstance(value, str) and len(value) > 100:
                    compressed[key] = value[:100]
                else:
                    compressed[key] = value
    
    return compressed


def _summarize_long_response(text: str, max_length: int = 500) -> str:
    """Summarize response if too long (Requirement 11)"""
    if len(text) <= max_length:
        return text
    
    # Try to keep first sentence and last sentence
    sentences = re.split(r'[.!?]+', text)
    if len(sentences) >= 2:
        first = sentences[0].strip()
        last = sentences[-1].strip() if sentences[-1].strip() else sentences[-2].strip()
        summary = f"{first}. ... {last}."
        if len(summary) <= max_length:
            return summary
    
    # Fallback: truncate with ellipsis
    return text[:max_length - 3] + "..."


# ========================================
# TOOL DEFINITIONS (Minimal)
# ========================================
def build_tool_definitions() -> List[Dict[str, Any]]:
    """Build OpenAI function definitions from our tools"""
    return [
        {
            "type": "function",
            "function": {
                "name": "get_movies",
                "description": "Get movies or search by query",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": {"type": "string", "description": "Search query (optional)"}
                    }
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_showtimes",
                "description": "Get showtimes for a movie",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "movie_id": {"type": "integer"},
                        "date": {"type": "string", "description": "YYYY-MM-DD (optional)"}
                    },
                    "required": ["movie_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "get_seat_map",
                "description": "Get seat map for a showtime",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "showtime_id": {"type": "integer"}
                    },
                    "required": ["showtime_id"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "lock_seats",
                "description": "Lock seats temporarily",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "showtime_id": {"type": "integer"},
                        "seat_ids": {"type": "array", "items": {"type": "integer"}},
                        "owner_token": {"type": "string"}
                    },
                    "required": ["showtime_id", "seat_ids", "owner_token"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "create_order",
                "description": "Create order for payment",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "showtime_id": {"type": "integer"},
                        "seat_ids": {"type": "array", "items": {"type": "integer"}},
                        "owner_token": {"type": "string"}
                    },
                    "required": ["showtime_id", "seat_ids", "owner_token"]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "verify_payment",
                "description": "Verify payment and complete booking",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "order_id": {"type": "string"},
                        "owner_token": {"type": "string"}
                    },
                    "required": ["order_id", "owner_token"]
                }
            }
        },
    ]


# ========================================
# TOOL CALLING
# ========================================
# Idempotency store for tool calls (Requirement 4)
_idempotency_store: Dict[str, Dict[str, Any]] = {}
IDEMPOTENCY_TTL = 600  # 10 minutes

def _get_idempotency_key(tool_name: str, idempotency_key: Optional[str]) -> Optional[str]:
    """Generate idempotency key for tool call"""
    if not idempotency_key:
        return None
    return f"{tool_name}:{idempotency_key}"

def _get_idempotent_result(tool_name: str, idempotency_key: Optional[str]) -> Optional[Dict[str, Any]]:
    """Get cached idempotent result if available"""
    if not idempotency_key:
        return None
    
    key = _get_idempotency_key(tool_name, idempotency_key)
    if key in _idempotency_store:
        entry = _idempotency_store[key]
        if time.time() - entry.get("timestamp", 0) < IDEMPOTENCY_TTL:
            logger.info(f"Idempotent result reused for {tool_name} with key {idempotency_key[:8]}...")
            return entry["result"]
        else:
            del _idempotency_store[key]
    return None

def _set_idempotent_result(tool_name: str, idempotency_key: Optional[str], result: Dict[str, Any]):
    """Store idempotent result"""
    if not idempotency_key:
        return
    
    key = _get_idempotency_key(tool_name, idempotency_key)
    _idempotency_store[key] = {
        "result": result,
        "timestamp": time.time()
    }
    
    # Limit store size
    if len(_idempotency_store) > 500:
        sorted_entries = sorted(_idempotency_store.items(), key=lambda x: x[1].get("timestamp", 0))
        for key, _ in sorted_entries[:250]:
            del _idempotency_store[key]


async def call_tool(tool_name: str, parameters: Dict[str, Any], owner_token: Optional[str] = None, idempotency_key: Optional[str] = None) -> Dict[str, Any]:
    """Call a tool function with caching and idempotency (Requirement 4)"""
    debug_log("call_tool", tool_name=tool_name, parameters=parameters, idempotency_key=idempotency_key)
    
    if tool_name not in ALL_TOOLS:
        return {"ok": False, "error": f"Unknown tool: {tool_name}"}
    
    # Check idempotency for side-effect tools (Requirement 4)
    side_effect_tools = ["lock_seats", "create_order", "verify_payment", "unlock_seats", "create_booking"]
    if tool_name in side_effect_tools and idempotency_key:
        cached_result = _get_idempotent_result(tool_name, idempotency_key)
        if cached_result:
            # Requirement 6.B: Track idempotency reuse
            logger.info(f"Tool {tool_name} reused idempotent result for key {idempotency_key[:8]}...")
            return {**cached_result, "idempotency_meta": {"idempotency_key": idempotency_key, "reused": True}}
    
    # Check cache for common queries (Requirement 8)
    cacheable_tools = ["get_movies", "get_showtimes", "get_seat_map"]
    if tool_name in cacheable_tools:
        cached = _get_cached(tool_name, parameters)
        if cached:
            debug_log("Cache hit", tool_name=tool_name)
            return cached
    
    tool_func = ALL_TOOLS[tool_name]
    
    # Inject owner_token into parameters if needed
    if owner_token and "owner_token" in parameters:
        parameters["owner_token"] = owner_token
    
    try:
        # Check if tool is async
        if asyncio.iscoroutinefunction(tool_func):
            result = await tool_func(**parameters)
        else:
            result = tool_func(**parameters)
        
        # Compress result before caching (Requirement 5)
        compressed = _compress_tool_response(result)
        
        # Store idempotent result for side-effect tools (Requirement 4)
        if tool_name in side_effect_tools and idempotency_key:
            _set_idempotent_result(tool_name, idempotency_key, compressed)
            compressed["idempotency_meta"] = {"idempotency_key": idempotency_key, "reused": False}
        
        # Cache if cacheable
        if tool_name in cacheable_tools:
            _set_cache(tool_name, parameters, compressed)
        
        return compressed
    except Exception as e:
        error_msg = f"Tool error: {str(e)}"
        logger.error(error_msg, exc_info=True)
        return {"ok": False, "error": error_msg[:100]}


# ========================================
# MAIN PROCESS MESSAGE (All Optimizations)
# ========================================
async def process_message(
    message: str,
    session_id: str,
    owner_token: Optional[str] = None,
    history: Optional[List[AssistantMessage]] = None,
    client_message_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Process a user message with all token optimizations
    """
    trace_id = str(uuid.uuid4())
    client_msg_id = client_message_id or trace_id
    debug_log("process_message", trace_id=trace_id, client_message_id=client_msg_id, user_message=message[:50])
    logger.info(f"[{client_msg_id}] Processing message (trace_id: {trace_id})")
    
    check_assistant_enabled()
    client = get_openai_client()
    
    # Requirement 4: Shorten long user inputs
    original_message = message
    message = _shorten_user_input(message, max_length=300)
    if len(original_message) > 300:
        logger.info(f"[{trace_id}] Shortened user input from {len(original_message)} to {len(message)} chars")
    
    # Requirement 9: Check cache for repeated questions
    message_lower = message.lower().strip()
    cache_key_params = {"message": message_lower}
    cached_response = _get_cached("user_query", cache_key_params)
    if cached_response:
        logger.info(f"[{trace_id}] Using cached response for repeated query")
        return cached_response
    
    # Requirement 1: Keep only last 5 messages
    messages = [{"role": "system", "content": SYSTEM_PROMPT}]
    
    if history:
        # Only last 5 messages
        limited_history = history[-5:]
        for msg in limited_history:
            # Requirement 12: Compact message structure
            content = msg.content.strip()[:200]  # Limit to 200 chars per message
            if content:  # Only add non-empty messages
                messages.append({
                    "role": msg.role,
                    "content": content
                })
    
    # Add current user message (already shortened)
    messages.append({"role": "user", "content": message})
    
    # Requirement 7: Token safety checks
    estimated_tokens = _estimate_message_tokens(messages)
    logger.info(f"[{trace_id}] Estimated tokens: {estimated_tokens}")
    
    if estimated_tokens > 8000:
        return {
            "message": "Your request is too large to process at once. Please simplify or shorten it.",
            "tool_calls": [],
            "session_id": session_id,
            "trace_id": trace_id,
            "error": "Token limit exceeded"
        }
    elif estimated_tokens > 4000:
        # Summarize inputs
        logger.warning(f"[{trace_id}] High token count ({estimated_tokens}), summarizing inputs")
        for i, msg in enumerate(messages[1:], 1):  # Skip system prompt
            if len(msg.get("content", "")) > 150:
                messages[i]["content"] = msg["content"][:150] + "..."
    
    tool_calls_list: List[ToolCall] = []
    max_iterations = 3  # Reduced from 6 to save tokens
    
    # Requirement 5: Retry logic (max 1 retry for transient errors only, NO retry on 429)
    async def call_openai_with_retry(messages_to_send):
        """Call OpenAI API with minimal retry logic
        
        Requirements:
        - Do NOT retry on 429/rate-limit errors (return immediately)
        - Do NOT retry on token-limit errors (return immediately)
        - Allow max 1 retry only for transient network errors (timeouts, connection errors)
        """
        max_retries = 1  # Only 1 retry for transient errors
        retry_count = 0
        
        while retry_count <= max_retries:
            try:
                response = client.chat.completions.create(
                    model=LLM_MODEL,
                    messages=messages_to_send,
                    tools=build_tool_definitions(),
                    tool_choice="auto",
                    temperature=0.7,
                    max_tokens=150,  # Requirement 3: Drastically reduced
                    stream=False  # Requirement 6: Disable streaming
                )
                return response
            except RateLimitError as e:
                # Requirement 5.A: Do NOT retry on 429 rate-limit errors
                # Return immediately with error info
                logger.warning(f"[{trace_id}] Rate limit error (NO RETRY): {e}")
                raise e  # Don't retry, surface to caller immediately
            except APIError as e:
                # Check if it's a token-limit error
                error_str = str(e).lower()
                if "token" in error_str and ("limit" in error_str or "maximum" in error_str):
                    # Requirement 5.A: Do NOT retry on token-limit errors
                    logger.warning(f"[{trace_id}] Token limit error (NO RETRY): {e}")
                    raise e  # Don't retry, surface to caller immediately
                
                # For other API errors, check if retryable
                retry_count += 1
                if retry_count > max_retries:
                    logger.error(f"[{trace_id}] API error after {max_retries} attempts: {e}")
                    raise e
                
                # Requirement 5.B: Single retry with randomized delay (300-800ms)
                wait_seconds = 0.3 + (random.random() * 0.5)  # 300-800ms
                logger.info(f"[{trace_id}] Transient API error, retrying in {wait_seconds:.2f}s (attempt {retry_count}/{max_retries})")
                await asyncio.sleep(wait_seconds)
            except APIConnectionError as e:
                # Requirement 5.B: Allow 1 retry for connection errors
                retry_count += 1
                if retry_count > max_retries:
                    logger.error(f"[{trace_id}] Connection error after {max_retries} attempts: {e}")
                    raise APIError("Unable to connect to AI service.") from e
                
                # Single retry with randomized delay
                wait_seconds = 0.3 + (random.random() * 0.5)  # 300-800ms
                logger.info(f"[{trace_id}] Connection error, retrying in {wait_seconds:.2f}s (attempt {retry_count}/{max_retries})")
                await asyncio.sleep(wait_seconds)
        
        raise APIError("Failed after retries")
    
    try:
        for iteration in range(max_iterations):
            debug_log(f"LLM call iteration {iteration + 1}", trace_id=trace_id)
            
            # Call OpenAI with retry logic
            response = await call_openai_with_retry(messages)
            
            assistant_message = response.choices[0].message
            
            # Requirement 12: Compact message structure
            assistant_content = assistant_message.content or ""
            messages.append({
                "role": "assistant",
                "content": assistant_content,
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {
                            "name": tc.function.name,
                            "arguments": tc.function.arguments
                        }
                    }
                    for tc in (assistant_message.tool_calls or [])
                ]
            })
            
            # If no tool calls, we have final answer
            if not assistant_message.tool_calls:
                final_message = assistant_content
                
                # Requirement 11: Shorten long responses
                if len(final_message) > 500:
                    final_message = _summarize_long_response(final_message, max_length=500)
                    logger.info(f"[{trace_id}] Shortened response from {len(assistant_content)} to {len(final_message)} chars")
                
                result = {
                    "message": final_message,
                    "tool_calls": [tc.model_dump() for tc in tool_calls_list],
                    "session_id": session_id,
                    "trace_id": trace_id
                }
                
                # Cache the response (Requirement 8)
                _set_cache("user_query", cache_key_params, result)
                
                return result
            
            # Execute tool calls
            for tool_call in assistant_message.tool_calls:
                tool_name = tool_call.function.name
                try:
                    tool_params = json.loads(tool_call.function.arguments)
                except json.JSONDecodeError:
                    tool_params = {}
                
                # Call tool with idempotency_key (Requirement 4)
                # Use client_message_id as idempotency key for side-effect tools
                idempotency_key = None
                side_effect_tools = ["lock_seats", "create_order", "verify_payment", "unlock_seats", "create_booking"]
                if tool_name in side_effect_tools and client_message_id:
                    idempotency_key = client_message_id
                    logger.info(f"[{client_msg_id}] Calling side-effect tool {tool_name} with idempotency_key: {idempotency_key[:8]}...")
                else:
                    logger.info(f"[{client_msg_id}] Calling tool {tool_name}")
                
                # Call tool (already compresses responses)
                tool_result = await call_tool(tool_name, tool_params, owner_token, idempotency_key=idempotency_key)
                
                # Store tool call info
                tool_calls_list.append(ToolCall(
                    tool_name=tool_name,
                    parameters=tool_params,
                    result=tool_result if tool_result.get("ok") else None,
                    error=None if tool_result.get("ok") else tool_result.get("error", "Unknown error")
                ))
                
                # Requirement 5: Compress tool result before adding to messages
                compressed_result = _compress_tool_response(tool_result)
                
                # Requirement 12: Compact message - only essential data
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "content": json.dumps(compressed_result, separators=(',', ':'))  # Compact JSON
                })
        
        # If we've exhausted iterations, return the last assistant message
        final_message = messages[-1].get("content", "I need more information. Please try again.")
        if len(final_message) > 500:
            final_message = _summarize_long_response(final_message, max_length=500)
        
        result = {
            "message": final_message,
            "tool_calls": [tc.model_dump() for tc in tool_calls_list],
            "session_id": session_id,
            "trace_id": trace_id
        }
        
        _set_cache("user_query", cache_key_params, result)
        return result
    
    except RateLimitError as e:
        error_msg = f"Rate limit: {str(e)[:200]}"
        logger.error(f"[{trace_id}] {error_msg}")
        
        # Extract wait time
        wait_time = 60
        error_str = str(e)
        if "try again in" in error_str.lower():
            # Parse complex time formats like "4h32m35.519s"
            time_match = re.search(r'(\d+)h(\d+)m([\d.]+)s', error_str.lower())
            if time_match:
                hours, minutes, seconds = time_match.groups()
                wait_time = int(hours) * 3600 + int(minutes) * 60 + int(float(seconds))
            else:
                sec_match = re.search(r'try again in\s+(\d+)\s*s', error_str.lower())
                if sec_match:
                    wait_time = int(sec_match.group(1))
        
        if wait_time > 3600:
            user_message = f"Rate limit reached. Please try again in {wait_time // 3600} hour(s)."
        elif wait_time > 60:
            user_message = f"Rate limit reached. Please try again in {wait_time // 60} minute(s)."
        else:
            user_message = f"Rate limit reached. Please try again in {wait_time} second(s)."
        
        return {
            "message": user_message,
            "tool_calls": [tc.model_dump() for tc in tool_calls_list],
            "session_id": session_id,
            "trace_id": trace_id,
            "error": error_msg
        }
    
    except (APIConnectionError, APIError) as e:
        error_msg = f"API error: {str(e)[:200]}"
        logger.error(f"[{trace_id}] {error_msg}")
        return {
            "message": "Connection error. Please try again.",
            "tool_calls": [tc.model_dump() for tc in tool_calls_list],
            "session_id": session_id,
            "trace_id": trace_id,
            "error": error_msg
        }
    
    except Exception as e:
        error_msg = f"Error: {str(e)[:200]}"
        logger.error(f"[{trace_id}] {error_msg}", exc_info=True)
        return {
            "message": "I'm having trouble processing your request. Please try again.",
            "tool_calls": [tc.model_dump() for tc in tool_calls_list],
            "session_id": session_id,
            "trace_id": trace_id,
            "error": error_msg
        }
