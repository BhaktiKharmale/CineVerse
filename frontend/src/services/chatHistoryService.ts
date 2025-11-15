/**
 * Chat History Service
 * Manages chat session history with localStorage persistence
 */

const HISTORY_STORAGE_KEY = "cineverse_chat_history_v1";
const MAX_SESSIONS = parseInt(import.meta.env.VITE_ASSISTANT_HISTORY_MAX || "200", 10);
const HISTORY_ENABLED = import.meta.env.VITE_ASSISTANT_HISTORY_ENABLED !== "false";
const SYNC_SERVER = import.meta.env.VITE_ASSISTANT_HISTORY_SYNC_SERVER === "true";
const DEBUG = import.meta.env.VITE_ASSISTANT_DEBUG === "true";

export interface ChatSessionMessage {
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
}

export interface ChatSessionMeta {
  bookingId?: string;
  lockId?: string;
  showtimeId?: string;
  lastAction?: "locked" | "booked" | "payment_failed";
  persistedFromServer?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatSessionMessage[];
  meta: ChatSessionMeta;
}

function debugLog(message: string, ...args: any[]): void {
  if (DEBUG) {
    console.log(`[ChatHistoryService] ${message}`, ...args);
  }
}

/**
 * Sanitize messages to remove sensitive data
 */
function sanitizeMessage(message: ChatSessionMessage): ChatSessionMessage {
  let text = message.text;
  
  // Redact UPI IDs (format: xyz@paytm, xyz@upi, etc.)
  text = text.replace(/\b[\w.-]+@(paytm|upi|ybl|okaxis|payu)\b/gi, "[UPI_REDACTED]");
  
  // Redact payment tokens (long alphanumeric strings)
  text = text.replace(/\b[a-zA-Z0-9]{32,}\b/g, (match) => {
    // Keep booking IDs and other short IDs
    if (match.length < 40) return match;
    return "[TOKEN_REDACTED]";
  });
  
  // Redact credit card patterns (simplified)
  text = text.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, "[CARD_REDACTED]");
  
  return { ...message, text };
}

/**
 * Sanitize session metadata
 */
function sanitizeMeta(meta: ChatSessionMeta): ChatSessionMeta {
  const sanitized = { ...meta };
  // Keep bookingId and lockId but remove any sensitive payment data
  // These are safe to store as they're just references
  return sanitized;
}

/**
 * Get all stored sessions
 */
export function getAllSessions(): ChatSession[] {
  if (!HISTORY_ENABLED) {
    return [];
  }

  try {
    const stored = localStorage.getItem(HISTORY_STORAGE_KEY);
    if (!stored) return [];
    
    const sessions: ChatSession[] = JSON.parse(stored);
    // Sort by updatedAt descending (most recent first)
    return sessions.sort((a, b) => 
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (error) {
    debugLog("Error loading sessions:", error);
    return [];
  }
}

/**
 * Get a specific session by ID
 */
export function getSession(sessionId: string): ChatSession | null {
  const sessions = getAllSessions();
  return sessions.find(s => s.id === sessionId) || null;
}

/**
 * Save a session (create or update)
 */
export function saveSession(session: ChatSession): void {
  if (!HISTORY_ENABLED) {
    return;
  }

  try {
    const sessions = getAllSessions();
    
    // Find existing session or create new
    const existingIndex = sessions.findIndex(s => s.id === session.id);
    
    // Sanitize before saving
    const sanitized: ChatSession = {
      ...session,
      messages: session.messages.map(sanitizeMessage),
      meta: sanitizeMeta(session.meta),
    };
    
    if (existingIndex >= 0) {
      // Update existing
      sessions[existingIndex] = sanitized;
    } else {
      // Add new
      sessions.push(sanitized);
    }
    
    // Enforce max sessions limit (remove oldest)
    if (sessions.length > MAX_SESSIONS) {
      sessions.sort((a, b) => 
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      sessions.splice(MAX_SESSIONS);
    }
    
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(sessions));
    debugLog(`Saved session ${session.id} (${sessions.length} total)`);
    
    // Optionally sync to server
    if (SYNC_SERVER) {
      syncSessionToServer(sanitized).catch(err => {
        debugLog("Failed to sync session to server:", err);
      });
    }
  } catch (error) {
    debugLog("Error saving session:", error);
  }
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  try {
    const sessions = getAllSessions();
    const filtered = sessions.filter(s => s.id !== sessionId);
    
    if (filtered.length === sessions.length) {
      return false; // Session not found
    }
    
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(filtered));
    debugLog(`Deleted session ${sessionId}`);
    
    // Optionally delete from server
    if (SYNC_SERVER) {
      deleteSessionFromServer(sessionId).catch(err => {
        debugLog("Failed to delete session from server:", err);
      });
    }
    
    return true;
  } catch (error) {
    debugLog("Error deleting session:", error);
    return false;
  }
}

/**
 * Clear all sessions
 */
export function clearAllSessions(): void {
  try {
    localStorage.removeItem(HISTORY_STORAGE_KEY);
    debugLog("Cleared all sessions");
    
    // Optionally clear from server
    if (SYNC_SERVER) {
      clearAllSessionsFromServer().catch(err => {
        debugLog("Failed to clear sessions from server:", err);
      });
    }
  } catch (error) {
    debugLog("Error clearing sessions:", error);
  }
}

/**
 * Create a new session from current chat messages
 */
export function createSessionFromMessages(
  messages: Array<{ role: "user" | "assistant" | "system"; content: string; timestamp: number }>,
  meta: ChatSessionMeta = {}
): ChatSession {
  const id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const now = new Date().toISOString();
  
  // Generate title from first user message
  const firstUserMessage = messages.find(m => m.role === "user");
  const title = firstUserMessage?.content.slice(0, 50) || "Untitled chat";
  
  const session: ChatSession = {
    id,
    title,
    createdAt: now,
    updatedAt: now,
    messages: messages.map(msg => ({
      role: msg.role,
      text: msg.content,
      timestamp: new Date(msg.timestamp).toISOString(),
    })),
    meta,
  };
  
  return session;
}

/**
 * Export session as JSON
 */
export function exportSession(sessionId: string): string | null {
  const session = getSession(sessionId);
  if (!session) return null;
  
  try {
    return JSON.stringify(session, null, 2);
  } catch (error) {
    debugLog("Error exporting session:", error);
    return null;
  }
}

/**
 * Download session as JSON file
 */
export function downloadSession(sessionId: string): void {
  const json = exportSession(sessionId);
  if (!json) {
    throw new Error("Session not found or export failed");
  }
  
  const session = getSession(sessionId);
  const filename = `cineverse-chat-${session?.id || sessionId}-${Date.now()}.json`;
  
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ========================================
// Server Sync Functions (Optional)
// ========================================

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";

async function syncSessionToServer(session: ChatSession): Promise<void> {
  if (!SYNC_SERVER) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/assistant/history`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(session),
    });
    
    if (!response.ok) {
      throw new Error(`Server sync failed: ${response.status}`);
    }
    
    debugLog(`Synced session ${session.id} to server`);
  } catch (error) {
    debugLog("Server sync error:", error);
    throw error;
  }
}

async function deleteSessionFromServer(sessionId: string): Promise<void> {
  if (!SYNC_SERVER) return;
  
  try {
    const response = await fetch(`${API_BASE}/api/assistant/history/${sessionId}`, {
      method: "DELETE",
    });
    
    if (!response.ok && response.status !== 404) {
      throw new Error(`Server delete failed: ${response.status}`);
    }
  } catch (error) {
    debugLog("Server delete error:", error);
    throw error;
  }
}

async function clearAllSessionsFromServer(): Promise<void> {
  if (!SYNC_SERVER) return;
  
  try {
    // This would need a bulk delete endpoint
    const response = await fetch(`${API_BASE}/api/assistant/history`, {
      method: "DELETE",
    });
    
    if (!response.ok) {
      throw new Error(`Server clear failed: ${response.status}`);
    }
  } catch (error) {
    debugLog("Server clear error:", error);
    throw error;
  }
}

/**
 * Load sessions from server (on app start, if sync enabled)
 */
export async function loadSessionsFromServer(): Promise<ChatSession[]> {
  if (!SYNC_SERVER) {
    return getAllSessions(); // Fallback to localStorage
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/assistant/history`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      throw new Error(`Server load failed: ${response.status}`);
    }
    
    const sessions: ChatSession[] = await response.json();
    
    // Merge with localStorage (server takes precedence)
    const localSessions = getAllSessions();
    const serverIds = new Set(sessions.map(s => s.id));
    const localOnly = localSessions.filter(s => !serverIds.has(s.id));
    
    const merged = [...sessions, ...localOnly];
    localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(merged));
    
    return merged;
  } catch (error) {
    debugLog("Server load error, using localStorage:", error);
    return getAllSessions(); // Fallback to localStorage
  }
}

