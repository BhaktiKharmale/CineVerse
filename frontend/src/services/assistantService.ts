/**
 * CineVerse Assistant Service
 * Handles API communication with the backend assistant
 */

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";
const ASSISTANT_ENABLED = import.meta.env.VITE_ASSISTANT_ENABLED !== "false";
const DEBUG = import.meta.env.VITE_ASSISTANT_DEBUG === "true";

// Storage keys
const SESSION_ID_KEY = "cineverse_assistant_session_id";
const OWNER_TOKEN_KEY = "cineverse_assistant_owner_token";
const CHAT_HISTORY_KEY = "cineverse_assistant_chat_history";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    tool_name: string;
    parameters: any;
    result?: any;
    error?: string;
  }>;
}

export interface AssistantRequest {
  message: string;
  client_message_id: string;  // Required: unique ID to prevent duplicates
  session_id?: string;
  owner_token?: string;
  history?: Array<{ role: string; content: string }>;
  last_message_ids?: string[];  // Last 5 message IDs for deduplication
}

export interface AssistantResponse {
  message: string;
  tool_calls?: Array<{
    tool_name: string;
    parameters: any;
    result?: any;
    error?: string;
  }>;
  session_id: string;
  trace_id: string;
  client_message_id: string;  // Echo back the client_message_id
  status?: string;  // "accepted", "duplicate", "completed", "processing"
  processing_id?: string;  // If status is "processing" or "accepted"
  error?: string;
}

function debugLog(message: string, ...args: any[]): void {
  if (DEBUG) {
    console.log(`[AssistantService] ${message}`, ...args);
  }
}

function generateUUID(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getSessionId(): string {
  let sessionId = localStorage.getItem(SESSION_ID_KEY);
  if (!sessionId) {
    sessionId = generateUUID();
    localStorage.setItem(SESSION_ID_KEY, sessionId);
  }
  return sessionId;
}

function getOwnerToken(): string {
  let ownerToken = localStorage.getItem(OWNER_TOKEN_KEY);
  if (!ownerToken) {
    ownerToken = generateUUID();
    localStorage.setItem(OWNER_TOKEN_KEY, ownerToken);
  }
  return ownerToken;
}

export function getChatHistory(): ChatMessage[] {
  try {
    const stored = localStorage.getItem(CHAT_HISTORY_KEY);
    if (stored) {
      const history = JSON.parse(stored);
      // Keep only last 20 messages
      return history.slice(-20);
    }
  } catch (error) {
    debugLog("Error loading chat history:", error);
  }
  return [];
}

export function saveChatHistory(messages: ChatMessage[]): void {
  try {
    // Keep only last 20 messages
    const limited = messages.slice(-20);
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(limited));
  } catch (error) {
    debugLog("Error saving chat history:", error);
  }
}

export function clearChatHistory(): void {
  localStorage.removeItem(CHAT_HISTORY_KEY);
}

/**
 * Check if assistant is available
 */
export async function checkAssistantHealth(): Promise<boolean> {
  if (!ASSISTANT_ENABLED) {
    return false;
  }

  try {
    const response = await fetch(`${API_BASE}/api/assistant/health`, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.ok === true;
  } catch (error) {
    debugLog("Health check error:", error);
    return false;
  }
}

// Inflight request tracking (Requirement 2)
const inflightRequests = new Map<string, Promise<AssistantResponse>>();

/**
 * Generate a unique client message ID
 */
export function generateClientMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Send a message to the assistant with deduplication support
 */
export async function sendMessage(
  message: string,
  history?: ChatMessage[],
  clientMessageId?: string
): Promise<AssistantResponse> {
  if (!ASSISTANT_ENABLED) {
    throw new Error("Assistant is disabled");
  }

  // Generate client_message_id if not provided (Requirement 2)
  const client_message_id = clientMessageId || generateClientMessageId();
  
  // Check if this request is already inflight (Requirement 2)
  if (inflightRequests.has(client_message_id)) {
    debugLog("Request already inflight, returning existing promise:", client_message_id);
    return inflightRequests.get(client_message_id)!;
  }

  debugLog("Sending message:", message, "client_message_id:", client_message_id);

  const sessionId = getSessionId();
  const ownerToken = getOwnerToken();

  // Get last 5 message IDs from history for deduplication
  const lastMessageIds = history
    ? history.slice(-5).map((msg) => msg.id).filter(Boolean)
    : undefined;

  const request: AssistantRequest = {
    message: message.trim(),
    client_message_id: client_message_id,
    session_id: sessionId,
    owner_token: ownerToken,
    history: history
      ? history.map((msg) => ({ role: msg.role, content: msg.content }))
      : undefined,
    last_message_ids: lastMessageIds,
  };

  // Create and store the promise (Requirement 2)
  const requestPromise = (async () => {
    try {
      const response = await fetch(`${API_BASE}/api/assistant/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.detail || `Request failed with status ${response.status}`
        );
      }

      const data: AssistantResponse = await response.json();
      debugLog("Received response:", data);
      
      // Handle duplicate/completed status
      if (data.status === "duplicate" || data.status === "accepted") {
        debugLog("Duplicate or accepted response:", data.status);
      }
      
      return data;
    } catch (error) {
      debugLog("Error sending message:", error);
      throw error;
    } finally {
      // Remove from inflight after completion (Requirement 2)
      inflightRequests.delete(client_message_id);
    }
  })();

  inflightRequests.set(client_message_id, requestPromise);
  return requestPromise;
}

/**
 * Get session ID
 */
export function getSessionIdPublic(): string {
  return getSessionId();
}

/**
 * Get owner token
 */
export function getOwnerTokenPublic(): string {
  return getOwnerToken();
}

export default {
  checkAssistantHealth,
  sendMessage,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  getSessionId: getSessionIdPublic,
  getOwnerToken: getOwnerTokenPublic,
};

