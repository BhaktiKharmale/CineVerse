"""
LLM factory and model configuration
"""
from langchain_openai import ChatOpenAI
from app.ai.config import OPENAI_API_KEY, LLM_MODEL, AGENT_VERBOSE, check_ai_enabled
import logging

logger = logging.getLogger(__name__)

def get_llm(temperature: float = 0.7, streaming: bool = False):
    """
    Factory function to create ChatOpenAI instance
    
    Args:
        temperature: Sampling temperature (0.0 - 1.0)
        streaming: Enable token streaming
    
    Returns:
        ChatOpenAI instance
    """
    check_ai_enabled()
    
    model = ChatOpenAI(
        model=LLM_MODEL,
        temperature=temperature,
        streaming=streaming,
        openai_api_key=OPENAI_API_KEY,
        verbose=AGENT_VERBOSE,
        request_timeout=30,
        max_retries=1
    )
    
    if AGENT_VERBOSE:
        logger.info(f"Initialized LLM: {LLM_MODEL} (streaming={streaming}, temp={temperature})")
    
    return model

def get_streaming_llm(temperature: float = 0.7):
    """Get LLM configured for streaming"""
    return get_llm(temperature=temperature, streaming=True)


def get_non_streaming_llm(temperature: float = 0.5):
    """Get LLM for non-streaming (tool calls, structured output)"""
    return get_llm(temperature=temperature, streaming=False)

