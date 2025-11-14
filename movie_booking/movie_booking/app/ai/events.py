"""
Socket.IO server and event handlers
"""
import logging
import uuid
import asyncio

logger = logging.getLogger(__name__)

# Try to import socketio, fail gracefully if not available
try:
    import socketio
    SOCKETIO_AVAILABLE = True
except ImportError as e:
    logger.warning(f"⚠ python-socketio not installed: {e}. Socket.IO features will be disabled.")
    logger.warning("   Install with: pip install python-socketio")
    SOCKETIO_AVAILABLE = False
    # Create dummy objects to prevent import errors
    class DummySocketApp:
        def __init__(self, *args, **kwargs):
            pass
    socket_app = DummySocketApp()
    sio = None

if SOCKETIO_AVAILABLE:
    from app.ai.config import SOCKET_CORS_ORIGINS, AI_ENABLED
    from app.ai.agent import get_agent
    from app.ai.schema import UserMessageEvent, BookConfirmRequest
    
    # Ensure SOCKET_CORS_ORIGINS is a list (not string or None)
    socket_origins_list: list[str] = []
    cors_origins_value = SOCKET_CORS_ORIGINS
    if isinstance(cors_origins_value, list):
        socket_origins_list = cors_origins_value
    elif isinstance(cors_origins_value, str):
        logger.warning(f"⚠️ SOCKET_CORS_ORIGINS is a string, converting to list...")
        socket_origins_list = [origin.strip() for origin in cors_origins_value.split(",") if origin.strip()]  # type: ignore[union-attr]
    else:
        logger.warning(f"⚠️ SOCKET_CORS_ORIGINS is not a list or string: {type(cors_origins_value)}")
        socket_origins_list = ["*"]  # Fallback to allow all for development
    
    # Log CORS origins for debugging
    logger.info(f"🔌 Socket.IO CORS origins configured ({len(socket_origins_list)}): {socket_origins_list}")
    
    # For development, use "*" to allow all origins (more permissive)
    # In production, use the specific list
    # Note: python-socketio's cors_allowed_origins can be a list or "*"
    # Using "*" for now to ensure connections work, then we can restrict to specific origins
    socket_cors_origins = "*"  # Allow all origins for development
    logger.info(f"🔌 Using Socket.IO CORS: {socket_cors_origins} (allowing all origins for development)")
    
    # Create Socket.IO server
    # Always allow CORS origins (even if AI is disabled, socket should be mountable)
    # This allows health checks and prevents 403 errors
    sio = socketio.AsyncServer(
        async_mode='asgi',
        cors_allowed_origins=socket_cors_origins,  # Use "*" for development
        cors_credentials=True,  # Allow credentials
        logger=True,
        engineio_logger=True,  # Enable engineio logger to see CORS rejections
    )
    
    logger.info(f"✅ Socket.IO server created with CORS: {socket_cors_origins}")
    
    # Type assertion: sio is not None at this point
    assert sio is not None, "Socket.IO server must be initialized"
    
    # Wrap with ASGI app
    socket_app = socketio.ASGIApp(sio, socketio_path='/socket.io')
    
    
    @sio.event(namespace='/ai')  # type: ignore[misc]
    async def connect_ai(sid, environ):
        """Handle client connection to /ai namespace"""
        # Log origin for debugging CORS issues
        origin = environ.get('HTTP_ORIGIN') or environ.get('HTTP_REFERER', 'unknown')
        logger.info(f"✅ [CONNECT] Client connected to /ai namespace | sid={sid} | origin={origin}")
        # Check if origin is in allowed list (for logging only, since we're using "*")
        if origin != 'unknown' and socket_origins_list != ["*"]:
            if origin not in socket_origins_list:
                logger.warning(f"⚠️ Origin {origin} not in allowed list: {socket_origins_list}")
        await sio.emit('connected', {'message': 'Connected to CineVerse AI'}, room=sid, namespace='/ai')  # type: ignore[misc]
    
    
    @sio.event(namespace='/ai')
    async def disconnect(sid):
        """Handle client disconnection from /ai namespace"""
        logger.info(f"❌ [DISCONNECT] Client disconnected from /ai namespace | sid={sid}")
    
    
    @sio.on('user_message', namespace='/ai')  # type: ignore[misc]
    async def handle_user_message(sid, data):
        """
        Handle incoming user message
        
        Event data:
        {
            "message": "Find KGF showtimes",
            "session_id": "optional-session-id",
            "owner_token": "uuid-token"
        }
        """
        trace_id = str(uuid.uuid4())
        try:
            # Parse message
            message = data.get('message', '').strip()
            session_id = data.get('session_id') or str(uuid.uuid4())
            owner_token = data.get('owner_token') or str(uuid.uuid4())
            
            # Log receipt
            logger.info(f"[{sid}] 📨 user_message received | session_id={session_id[:8]}... | message='{message[:100]}...' | trace_id={trace_id}")
            
            # Reject ping messages from user_message - they should use ai:ping event instead
            if message == "__ping__":
                logger.warning(f"[{sid}] ⚠️ Ping message received via user_message - ignoring (use ai:ping event for diagnostics)")
                await sio.emit('agent_error', {
                    'message': 'Please use the diagnostic ping endpoint for health checks, not the chat interface.',
                    'trace_id': trace_id
                }, room=sid, namespace='/ai')
                return
            
            if not message:
                error_msg = 'Empty message'
                logger.warning(f"[{sid}] ⚠️ {error_msg}")
                await sio.emit('agent_error', {
                    'message': error_msg,
                    'trace_id': trace_id
                }, room=sid, namespace='/ai')
                return
            
            # Get or create agent
            logger.info(f"[{sid}] 🤖 Getting agent for session {session_id[:8]}...")
            agent = get_agent(session_id, owner_token)
            
            # Create emit callback with logging
            async def emit_callback(event_name: str, event_data: dict):
                """Helper to emit events to client with logging"""
                if event_name in ['ai_token']:
                    # Don't log every token, too verbose
                    pass
                else:
                    logger.info(f"[{sid}] 📤 Emitting {event_name} | trace_id={event_data.get('trace_id', 'unknown')}")
                await sio.emit(event_name, event_data, room=sid, namespace='/ai')
            
            # Run agent with streaming
            logger.info(f"[{sid}] 🚀 Starting agent.run_streaming | trace_id={trace_id}")
            result = await agent.run_streaming(message, emit_callback)
            logger.info(f"[{sid}] ✅ Agent completed | trace_id={trace_id} | answer_length={len(result.get('answer', ''))}")
            
            # Ensure final_answer was emitted (fallback if agent didn't emit it)
            # The agent should always emit final_answer, but this is a safety net
            if not result or not result.get('answer'):
                logger.warning(f"[{sid}] ⚠️ No answer in result, emitting fallback final_answer")
                await sio.emit('final_answer', {
                    'answer': 'I apologize, but I could not generate a response. Please try again.',
                    'trace_id': trace_id,
                    'tool_calls': []
                }, room=sid, namespace='/ai')
            
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            logger.error(f"[{sid}] ❌ Error handling message: {e}\n{error_trace}")
            
            # Emit agent_error (not just 'error')
            await sio.emit('agent_error', {
                'message': f"I encountered an error: {str(e)}",
                'trace_id': trace_id,
                'error_type': type(e).__name__
            }, room=sid, namespace='/ai')
            
            # Also emit final_answer with error so UI can close the bubble
            await sio.emit('final_answer', {
                'answer': f"I encountered an error: {str(e)}. Please try again.",
                'trace_id': trace_id,
                'error': True
            }, room=sid, namespace='/ai')
    
    
    @sio.on('book_confirm', namespace='/ai')  # type: ignore[misc]
    async def handle_book_confirm(sid, data):
        """
        Handle booking confirmation from user
        
        Event data:
        {
            "showtime_id": 1,
            "seat_ids": [101, 102],
            "user_email": "user@example.com",
            "payment_ref": "demo_payment",
            "owner_token": "uuid-token",
            "trace_id": "trace-uuid"
        }
        """
        try:
            logger.info(f"[{sid}] Booking confirmation: {data}")
            
            showtime_id = data.get('showtime_id')
            seat_ids = data.get('seat_ids', [])
            user_email = data.get('user_email')
            owner_token = data.get('owner_token')
            trace_id = data.get('trace_id', str(uuid.uuid4()))
            
            if not all([showtime_id, seat_ids, user_email, owner_token]):
                await sio.emit('error', {
                    'message': 'Missing required fields for booking',
                    'trace_id': trace_id
                }, room=sid, namespace='/ai')
                return
            
            # Import here to avoid circular dependency
            from app.ai.tools import create_booking
            
            # Call booking tool
            seat_ids_str = ",".join(map(str, seat_ids))
            result = create_booking.invoke({
                "showtime_id": showtime_id,
                "seat_ids": seat_ids_str,
                "user_email": user_email,
                "payment_ref": data.get('payment_ref', 'demo_payment')
            })
            
            import json
            result_data = json.loads(result)
            
            # Emit booking status
            if result_data.get('success'):
                await sio.emit('booking_status', {
                    'status': 'success',
                    'booking_id': result_data.get('booking_id'),
                    'message': 'Booking confirmed successfully!',
                    'details': result_data.get('details'),
                    'trace_id': trace_id
                }, room=sid, namespace='/ai')
                
                # Also emit to release locks
                from app.ai.tools import unlock_seats
                unlock_result = unlock_seats.invoke({
                    "showtime_id": showtime_id,
                    "seat_ids": seat_ids_str,
                    "owner": owner_token
                })
                
            else:
                await sio.emit('booking_status', {
                    'status': 'failed',
                    'message': result_data.get('error', 'Booking failed'),
                    'trace_id': trace_id
                }, room=sid, namespace='/ai')
            
        except Exception as e:
            logger.error(f"Error confirming booking: {e}")
            await sio.emit('booking_status', {
                'status': 'failed',
                'message': str(e),
                'trace_id': data.get('trace_id', 'unknown')
            }, room=sid, namespace='/ai')
    
    
    @sio.on('ai:ping', namespace='/ai')  # type: ignore[misc]
    async def handle_ping(sid, data):
        """
        Handle diagnostic ping for connection health check.
        This is a separate event from user_message and does NOT emit to chat UI.
        """
        logger.info(f"[{sid}] 🏓 Diagnostic ping received")
        # Emit to diagnostic event, NOT final_answer (so it doesn't appear in chat)
        await sio.emit('ai:pong', {
            'ok': True,
            'timestamp': data.get('timestamp') if data else None,
            'server_time': __import__('time').time()
        }, room=sid, namespace='/ai')

def get_socket_app():
    """Get Socket.IO ASGI app (standalone, for mounting)"""
    return socket_app

def wrap_app_with_socketio(fastapi_app):
    """
    Wrap FastAPI app with Socket.IO ASGI app.
    This is the correct way to integrate Socket.IO with FastAPI.
    Returns the wrapped ASGI app that handles both FastAPI routes and Socket.IO.
    """
    if not SOCKETIO_AVAILABLE:
        logger.warning("⚠️ Socket.IO not available, returning FastAPI app as-is")
        return fastapi_app
    
    # sio is defined in module scope when SOCKETIO_AVAILABLE is True
    # Check if it exists and is not None
    if 'sio' not in globals() or globals()['sio'] is None:
        logger.warning("⚠️ Socket.IO server (sio) not initialized, returning FastAPI app as-is")
        return fastapi_app
    
    # Get the sio instance from module scope
    current_sio = globals()['sio']
    
    # Wrap FastAPI app with Socket.IO
    # This allows Socket.IO to handle /socket.io/* and pass everything else to FastAPI
    wrapped_app = socketio.ASGIApp(current_sio, other_asgi_app=fastapi_app, socketio_path='/socket.io')
    logger.info("✅ FastAPI app wrapped with Socket.IO ASGI app")
    return wrapped_app