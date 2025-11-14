"""
LangChain agent assembly with tools and memory
"""
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage
from app.ai.models import get_non_streaming_llm, get_streaming_llm
from app.ai.tools import get_tools
from app.ai.prompts import get_system_prompt, get_user_context
from app.ai.config import AGENT_MAX_STEPS, AGENT_VERBOSE
from app.ai.schema import ToolCall
import logging
import uuid
import time
import asyncio
import json

logger = logging.getLogger(__name__)


class CineVerseAgent:
    """
    AI Agent for movie booking with tools and memory
    """
    
    def __init__(self, session_id: str, owner_token: str):
        self.session_id = session_id
        self.owner_token = owner_token
        self.tools = {tool.name: tool for tool in get_tools()}
        self.chat_history = []
        
        # Create LLM with tool binding
        self.llm = get_non_streaming_llm(temperature=0.7).bind_tools(list(self.tools.values()))
        
        if AGENT_VERBOSE:
            logger.info(f"Initialized agent for session {session_id}")
    
    def run(self, message: str) -> dict:
        """
        Run agent on a message and return structured response
        
        Args:
            message: User's message
        
        Returns:
            Dict with answer, tool_calls, and trace_id
        """
        trace_id = str(uuid.uuid4())
        
        if AGENT_VERBOSE:
            logger.info(f"[{trace_id}] Processing: {message}")
        
        tool_calls_list = []
        
        try:
            # Build messages
            messages = [
                SystemMessage(content=get_system_prompt()),
                SystemMessage(content=get_user_context(self.owner_token, self.session_id))
            ]
            messages.extend(self.chat_history)
            messages.append(HumanMessage(content=message))
            
            # Run for max iterations
            for iteration in range(AGENT_MAX_STEPS):
                response = self.llm.invoke(messages)
                messages.append(response)
                
                # Check if tool calls were made
                if hasattr(response, 'tool_calls') and response.tool_calls:
                    for tool_call in response.tool_calls:
                        tool_name = tool_call['name']
                        tool_args = tool_call['args']
                        
                        if tool_name in self.tools:
                            # Execute tool
                            tool = self.tools[tool_name]
                            try:
                                result = tool.invoke(tool_args)
                                tool_calls_list.append(ToolCall(
                                    tool_name=tool_name,
                                    parameters=tool_args,
                                    result=result
                                ))
                                
                                # Add tool result to messages
                                messages.append(AIMessage(content=f"Tool {tool_name} result: {result}"))
                            except Exception as e:
                                error_msg = f"Tool error: {str(e)}"
                                tool_calls_list.append(ToolCall(
                                    tool_name=tool_name,
                                    parameters=tool_args,
                                    error=error_msg
                                ))
                                messages.append(AIMessage(content=error_msg))
                else:
                    # No tool calls, we have final answer
                    break
            
            # Get final answer
            answer = response.content if hasattr(response, 'content') else str(response)
            
            # Update chat history
            self.chat_history.append(HumanMessage(content=message))
            self.chat_history.append(AIMessage(content=answer))
            
            # Keep history manageable
            if len(self.chat_history) > 10:
                self.chat_history = self.chat_history[-10:]
            
            if AGENT_VERBOSE:
                logger.info(f"[{trace_id}] Answer: {answer[:100]}...")
                logger.info(f"[{trace_id}] Tool calls: {len(tool_calls_list)}")
            
            return {
                "answer": answer,
                "tool_calls": tool_calls_list,
                "trace_id": trace_id,
                "session_id": self.session_id
            }
            
        except Exception as e:
            logger.error(f"[{trace_id}] Agent error: {e}")
            return {
                "answer": f"I encountered an error: {str(e)}. Please try rephrasing your request.",
                "tool_calls": tool_calls_list,
                "trace_id": trace_id,
                "session_id": self.session_id,
                "error": str(e)
            }
    
    async def run_streaming(self, message: str, emit_callback):
        """
        Run agent with streaming support
        
        Args:
            message: User's message
            emit_callback: Async function to emit events (token, tool_call, etc.)
        """
        trace_id = str(uuid.uuid4())
        
        if AGENT_VERBOSE:
            logger.info(f"[{trace_id}] Streaming: {message}")
        
        tool_calls_list = []
        
        try:
            # Build messages
            messages = [
                SystemMessage(content=get_system_prompt()),
                SystemMessage(content=get_user_context(self.owner_token, self.session_id))
            ]
            messages.extend(self.chat_history)
            messages.append(HumanMessage(content=message))
            
            # Run agent loop
            for iteration in range(AGENT_MAX_STEPS):
                if AGENT_VERBOSE:
                    logger.info(f"[{trace_id}] 🔄 LLM call starting | iteration={iteration + 1}/{AGENT_MAX_STEPS}")
                
                response = self.llm.invoke(messages)
                messages.append(response)
                
                if AGENT_VERBOSE:
                    has_tools = hasattr(response, 'tool_calls') and response.tool_calls
                    logger.info(f"[{trace_id}] ✅ LLM call completed | has_tool_calls={bool(has_tools)}")
                
                # Check for tool calls
                if hasattr(response, 'tool_calls') and response.tool_calls:
                    # Process each tool call
                    for tool_call in response.tool_calls:
                        # Handle both dict and object formats
                        if isinstance(tool_call, dict):
                            tool_call_id = tool_call.get('id', str(uuid.uuid4()))
                            tool_name = tool_call.get('name', '')
                            tool_args = tool_call.get('args', {})
                        else:
                            # Object format (LangChain ToolCall)
                            tool_call_id = getattr(tool_call, 'id', str(uuid.uuid4()))
                            tool_name = getattr(tool_call, 'name', '')
                            tool_args = getattr(tool_call, 'args', {})
                        
                        # Emit tool call event
                        await emit_callback("tool_call", {
                            "tool_name": tool_name,
                            "parameters": tool_args,
                            "tool_call_id": tool_call_id,
                            "trace_id": trace_id
                        })
                        
                        # Execute tool and build normalized result
                        start_time = time.time()
                        tool_result = None
                        tool_error = None
                        
                        if tool_name in self.tools:
                            tool = self.tools[tool_name]
                            try:
                                if AGENT_VERBOSE:
                                    logger.info(f"[{trace_id}] 🔧 Executing tool: {tool_name} | args={tool_args}")
                                
                                # Execute tool
                                result = tool.invoke(tool_args)
                                duration_ms = (time.time() - start_time) * 1000
                                
                                if AGENT_VERBOSE:
                                    logger.info(f"[{trace_id}] ✅ Tool {tool_name} completed | duration={duration_ms:.2f}ms")
                                
                                # Normalize result: {"ok": true, "data": {...}, "duration_ms": N}
                                if isinstance(result, str):
                                    try:
                                        # Try to parse if it's JSON string
                                        result_data = json.loads(result)
                                    except:
                                        result_data = result
                                else:
                                    result_data = result
                                
                                tool_result = {
                                    "ok": True,
                                    "data": result_data,
                                    "duration_ms": round(duration_ms, 2)
                                }
                                
                                # Emit tool result
                                await emit_callback("tool_result", {
                                    "tool_name": tool_name,
                                    "result": tool_result,
                                    "tool_call_id": tool_call_id,
                                    "trace_id": trace_id
                                })
                                
                                tool_calls_list.append(ToolCall(
                                    tool_name=tool_name,
                                    parameters=tool_args,
                                    result=result_data
                                ))
                                
                            except Exception as e:
                                duration_ms = (time.time() - start_time) * 1000
                                error_msg = str(e)
                                
                                # Normalize error: {"ok": false, "error": "...", "duration_ms": N}
                                tool_error = {
                                    "ok": False,
                                    "error": error_msg,
                                    "duration_ms": round(duration_ms, 2)
                                }
                                
                                await emit_callback("tool_result", {
                                    "tool_name": tool_name,
                                    "error": tool_error,
                                    "tool_call_id": tool_call_id,
                                    "trace_id": trace_id
                                })
                                
                                tool_calls_list.append(ToolCall(
                                    tool_name=tool_name,
                                    parameters=tool_args,
                                    error=error_msg
                                ))
                        else:
                            duration_ms = (time.time() - start_time) * 1000
                            error_msg = f"Unknown tool: {tool_name}"
                            tool_error = {
                                "ok": False,
                                "error": error_msg,
                                "duration_ms": round(duration_ms, 2)
                            }
                            
                            await emit_callback("tool_result", {
                                "tool_name": tool_name,
                                "error": tool_error,
                                "tool_call_id": tool_call_id,
                                "trace_id": trace_id
                            })
                        
                        # Add ToolMessage with tool_call_id (required by LangChain)
                        # Content must be JSON string of the result
                        if tool_result:
                            tool_content = json.dumps(tool_result)
                        else:
                            tool_content = json.dumps(tool_error) if tool_error else json.dumps({"ok": False, "error": "Unknown error"})
                        
                        messages.append(ToolMessage(
                            content=tool_content,
                            tool_call_id=tool_call_id
                        ))
                else:
                    # No tool calls, we have final answer
                    break
            
            # Get final answer
            answer = response.content if hasattr(response, 'content') else str(response)
            
            if AGENT_VERBOSE:
                logger.info(f"[{trace_id}] 📝 Final answer ready | length={len(answer)} | tool_calls={len(tool_calls_list)}")
            
            # Stream answer
            words = answer.split()
            for i, word in enumerate(words):
                token = word + (" " if i < len(words) - 1 else "")
                await emit_callback("ai_token", {
                    "token": token,
                    "trace_id": trace_id
                })
                await asyncio.sleep(0.05)
            
            # Emit final answer (ALWAYS emit, even if empty)
            logger.info(f"[{trace_id}] 📤 Emitting final_answer")
            await emit_callback("final_answer", {
                "answer": answer,
                "tool_calls": [tc.model_dump() for tc in tool_calls_list],
                "trace_id": trace_id
            })
            
            # Update history
            self.chat_history.append(HumanMessage(content=message))
            self.chat_history.append(AIMessage(content=answer))
            if len(self.chat_history) > 10:
                self.chat_history = self.chat_history[-10:]
            
            return {
                "answer": answer,
                "tool_calls": tool_calls_list,
                "trace_id": trace_id
            }
            
        except Exception as e:
            import traceback
            error_trace = traceback.format_exc()
            logger.error(f"[{trace_id}] ❌ Streaming error: {e}\n{error_trace}")
            error_msg = f"I encountered an error: {str(e)}"
            
            # Emit agent_error first
            await emit_callback("agent_error", {
                "message": error_msg,
                "trace_id": trace_id,
                "error_type": type(e).__name__
            })
            
            # ALWAYS emit final_answer to close the streaming bubble
            await emit_callback("final_answer", {
                "answer": error_msg,
                "tool_calls": [],
                "trace_id": trace_id,
                "error": True
            })
            
            return {
                "answer": error_msg,
                "tool_calls": [],
                "trace_id": trace_id,
                "error": str(e)
            }


# Agent registry (session_id -> agent instance)
_agent_registry: dict[str, CineVerseAgent] = {}


def get_agent(session_id: str, owner_token: str) -> CineVerseAgent:
    """Get or create agent for session"""
    if session_id not in _agent_registry:
        _agent_registry[session_id] = CineVerseAgent(session_id, owner_token)
    return _agent_registry[session_id]


def clear_agent(session_id: str):
    """Clear agent from registry"""
    if session_id in _agent_registry:
        del _agent_registry[session_id]

