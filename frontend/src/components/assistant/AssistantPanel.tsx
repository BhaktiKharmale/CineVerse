/**
 * Assistant Panel Component
 * Main chat panel for the assistant with history and reset functionality
 */
import React, { useState, useEffect, useRef, useCallback } from "react";
import { X, Send, Loader2, Sparkles, Bot, History, RotateCcw, AlertCircle } from "lucide-react";
import MessageBubble from "./MessageBubble";
import ChatHistorySidebar from "./ChatHistorySidebar";
import {
  ChatMessage,
  sendMessage,
  getChatHistory,
  saveChatHistory,
  clearChatHistory,
  getSessionIdPublic,
  getOwnerTokenPublic,
  generateClientMessageId,
} from "../../services/assistantService";
import {
  createSessionFromMessages,
  saveSession,
  type ChatSession,
} from "../../services/chatHistoryService";
import { useBooking } from "../../context/BookingContext";
import toast from "react-hot-toast";

const DEBUG = import.meta.env.VITE_ASSISTANT_DEBUG === "true";
function debugLog(message: string, ...args: any[]): void {
  if (DEBUG) {
    console.log(`[AssistantPanel] ${message}`, ...args);
  }
}

interface AssistantPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function AssistantPanel({
  isOpen,
  onClose,
}: AssistantPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Deduplication tracking (Requirement 2, 6)
  const pendingMessagesRef = useRef<Map<string, ChatMessage>>(new Map());
  const lastSentTextRef = useRef<string>("");
  const lastSentTimeRef = useRef<number>(0);
  const sendDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const isSendingRef = useRef<boolean>(false);
  
  // Requirement 2.D: StrictMode guard to prevent double execution
  const didMountRef = useRef<boolean>(false);
  
  const booking = useBooking();

  // Load chat history on mount and check connection
  useEffect(() => {
    // Requirement 2.D: StrictMode guard - prevent double execution
    if (didMountRef.current) {
      debugLog("StrictMode: Skipping duplicate mount effect");
      return;
    }
    didMountRef.current = true;
    
    if (isOpen) {
      const history = getChatHistory();
      setMessages(history);
      setConnectionError(null);
      setCurrentSessionId(null); // Start fresh session
      
      // Check if assistant is available
      import("../../services/assistantService").then(({ checkAssistantHealth }) => {
        checkAssistantHealth().catch(() => {
          setConnectionError("Unable to connect to assistant. Please check if the server is running.");
        });
      });
      
      // Focus input when panel opens
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
    
    // Cleanup on unmount
    return () => {
      didMountRef.current = false;
    };
  }, [isOpen]);

  // Auto-save current session to history (debounced)
  useEffect(() => {
    if (messages.length > 0 && isOpen) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      
      saveTimeoutRef.current = setTimeout(() => {
        const session = createSessionFromMessages(messages, {
          lockId: booking.lockId || undefined,
          showtimeId: booking.showtimeId ? String(booking.showtimeId) : undefined,
          bookingId: booking.bookingId || undefined,
          lastAction: booking.status === "completed" ? "booked" : 
                     booking.status === "locked" ? "locked" : undefined,
        });
        
        if (!currentSessionId || currentSessionId !== session.id) {
          setCurrentSessionId(session.id);
        }
        
        saveSession(session);
      }, 2000); // Debounce 2 seconds
    }
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [messages, isOpen, booking, currentSessionId]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N / Cmd+N: Reset chat
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        handleReset();
      }
      
      // Ctrl+H / Cmd+H: Toggle history
      if ((e.ctrlKey || e.metaKey) && e.key === "h") {
        e.preventDefault();
        setIsHistoryOpen(!isHistoryOpen);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isHistoryOpen]);

  const handleSend = async () => {
    const message = inputValue.trim();
    
    // Check if already sending (FIRST check to prevent race conditions)
    if (!message || isLoading || isSendingRef.current) {
      debugLog("Send blocked: already sending or empty message");
      return;
    }

    // Requirement 6: Debounce rapid repeated sends (800ms)
    const now = Date.now();
    if (message === lastSentTextRef.current && now - lastSentTimeRef.current < 800) {
      debugLog("Debounced duplicate send");
      return;
    }

    // Clear any existing debounce timeout
    if (sendDebounceRef.current) {
      clearTimeout(sendDebounceRef.current);
      sendDebounceRef.current = null;
    }

    // Check if this exact message is already pending
    for (const [msgId, pendingMsg] of pendingMessagesRef.current.entries()) {
      if (pendingMsg.content === message && pendingMsg.role === "user") {
        debugLog("Duplicate message already pending, ignoring");
        return;
      }
    }

    // Set sending flag IMMEDIATELY to prevent concurrent calls (CRITICAL)
    isSendingRef.current = true;
    
    try {
      // Requirement 2: Generate client_message_id
      const client_message_id = generateClientMessageId();
      
      // Requirement 2: Immediately append pending entry
      const userMessage: ChatMessage = {
        id: client_message_id,
        role: "user",
        content: message,
        timestamp: Date.now(),
      };

      // Requirement 2: Track pending message
      pendingMessagesRef.current.set(client_message_id, userMessage);
      lastSentTextRef.current = message;
      lastSentTimeRef.current = now;

      // Requirement 2: Add to messages immediately (pending state)
      const newMessages = [...messages, userMessage];
      setMessages(newMessages);
      setInputValue("");
      setIsLoading(true);
      setError(null);

      // Send to assistant with client_message_id
      const response = await sendMessage(message, newMessages, client_message_id);

      // Requirement 2: Replace pending entry, don't create new one
      // Use functional update to ensure we work with latest state
      setMessages((prevMessages) => {
        // Find and replace the pending user message
        const updated = prevMessages.map((msg) => {
          if (msg.id === client_message_id && msg.role === "user") {
            return userMessage; // Keep user message as is
          }
          return msg;
        });

        // Check if assistant message already exists (duplicate response)
        // Use client_message_id from response to match
        const assistantId = response.client_message_id || `assistant-${client_message_id}`;
        const existingAssistant = updated.find(
          (msg) => (msg.id === assistantId || msg.id === response.client_message_id) && msg.role === "assistant"
        );

        if (!existingAssistant) {
          // Add assistant message only if it doesn't exist
          const assistantMessage: ChatMessage = {
            id: assistantId,
            role: "assistant",
            content: response.message,
            timestamp: Date.now(),
            toolCalls: response.tool_calls,
          };
          updated.push(assistantMessage);
        } else {
          // Update existing assistant message (avoid duplicates)
          const index = updated.indexOf(existingAssistant);
          updated[index] = {
            ...existingAssistant,
            content: response.message,
            toolCalls: response.tool_calls,
          };
        }

        // Save history ONCE after update (deduplicated)
        saveChatHistory(updated);
        return updated;
      });

      // Remove from pending
      pendingMessagesRef.current.delete(client_message_id);
    } catch (err: any) {
      const errorMessage = err.message || "Failed to send message. Please try again.";
      setError(errorMessage);

      // Requirement 2: Update existing entry instead of creating new one
      setMessages((prevMessages) => {
        const updated = prevMessages.map((msg) => {
          if (msg.id === client_message_id && msg.role === "user") {
            // Replace user message with error message
            return {
              id: `error-${client_message_id}`,
              role: "assistant",
              content: `Sorry, I encountered an error: ${errorMessage}`,
              timestamp: Date.now(),
            };
          }
          return msg;
        });
        // Save history after error update
        saveChatHistory(updated);
        return updated;
      });

      pendingMessagesRef.current.delete(client_message_id);
    } finally {
      setIsLoading(false);
      isSendingRef.current = false;
      inputRef.current?.focus();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleReset = useCallback(async () => {
    // Check if there's an active lock
    if (booking.lockId && booking.showtimeId) {
      setShowResetConfirm(true);
      return;
    }
    
    // No lock, proceed with reset
    await performReset();
  }, [booking.lockId, booking.showtimeId]);

  const performReset = useCallback(async () => {
    // Save current session before resetting
    if (messages.length > 0) {
      const session = createSessionFromMessages(messages, {
        lockId: booking.lockId || undefined,
        showtimeId: booking.showtimeId ? String(booking.showtimeId) : undefined,
        bookingId: booking.bookingId || undefined,
      });
      saveSession(session);
    }

    // Release lock if exists
    if (booking.lockId && booking.showtimeId) {
      try {
        await booking.clearLock({ silent: true });
      } catch (err) {
        const expiresIn = booking.expiresAt 
          ? Math.max(0, Math.floor((new Date(booking.expiresAt).getTime() - Date.now()) / 1000))
          : 180;
        toast.error(
          `Couldn't release locks automatically — they will expire in ${expiresIn}s or you can retry.`,
          { duration: 5000 }
        );
      }
    }

    // Clear current chat
    clearChatHistory();
    setMessages([]);
    setInputValue("");
    setCurrentSessionId(null);
    setShowResetConfirm(false);
    
    // Show greeting
    toast.success("New chat started — your previous conversation is saved to History.", {
      duration: 3000,
    });
    
    // Announce for screen readers
    const announcement = document.createElement("div");
    announcement.setAttribute("role", "status");
    announcement.setAttribute("aria-live", "polite");
    announcement.className = "sr-only";
    announcement.textContent = "New chat started";
    document.body.appendChild(announcement);
    setTimeout(() => document.body.removeChild(announcement), 1000);
    
    inputRef.current?.focus();
  }, [messages, booking]);

  const handleRestoreSession = useCallback((session: ChatSession, replace: boolean = true) => {
    if (replace) {
      // Replace current session
      const restoredMessages: ChatMessage[] = session.messages.map((msg, idx) => ({
        id: `${msg.role}-${idx}-${Date.now()}`,
        role: msg.role as "user" | "assistant",
        content: msg.text,
        timestamp: new Date(msg.timestamp).getTime(),
      }));
      
      setMessages(restoredMessages);
      saveChatHistory(restoredMessages);
      setCurrentSessionId(session.id);
      setIsHistoryOpen(false);
      
      // Show status banner if session has expired locks/bookings
      if (session.meta.lockId) {
        toast("This session had seat locks that may have expired.", {
          icon: "ℹ️",
          duration: 4000,
        });
      }
      
      toast.success("Session restored");
      
      // Announce for screen readers
      const announcement = document.createElement("div");
      announcement.setAttribute("role", "status");
      announcement.setAttribute("aria-live", "polite");
      announcement.className = "sr-only";
      announcement.textContent = "Session restored";
      document.body.appendChild(announcement);
      setTimeout(() => document.body.removeChild(announcement), 1000);
    } else {
      // Merge: append to current
      const restoredMessages: ChatMessage[] = session.messages.map((msg, idx) => ({
        id: `${msg.role}-restored-${idx}-${Date.now()}`,
        role: msg.role as "user" | "assistant",
        content: msg.text,
        timestamp: new Date(msg.timestamp).getTime(),
      }));
      
      setMessages(prev => [...prev, ...restoredMessages]);
      setIsHistoryOpen(false);
      toast.success("Session merged");
    }
  }, []);

  const quickActions = [
    { label: "Today's Movies", query: "Show me today's movies" },
    { label: "Showtimes", query: "What are the showtimes available?" },
  ];

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-end pointer-events-none">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black/50 transition-opacity pointer-events-auto"
          onClick={onClose}
        />

        {/* Panel */}
        <div className="relative w-full max-w-md h-[calc(100vh-2rem)] md:h-[600px] bg-[#1a1a1a] border border-[#333] rounded-t-2xl md:rounded-2xl shadow-2xl flex flex-col pointer-events-auto transform transition-transform motion-reduce:transition-none">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-[#222] rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FF7A00]">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">
                  CineVerse Assistant
                </h2>
                <p className="text-xs text-gray-400">Ask me anything</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* History Button */}
              <button
                onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                className="rounded-full p-1.5 text-gray-400 transition hover:bg-[#333] hover:text-white"
                aria-label="Open chat history"
                title="Chat History (Ctrl+H / ⌘+H)"
              >
                <History className="h-5 w-5" />
              </button>
              
              {/* Reset Button */}
              <button
                onClick={handleReset}
                className="rounded-full p-1.5 text-gray-400 transition hover:bg-[#333] hover:text-white"
                aria-label="Reset chat"
                title="New Chat (Ctrl+N / ⌘+N)"
              >
                <RotateCcw className="h-5 w-5" />
              </button>
              
              {/* Close Button */}
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-gray-400 transition hover:bg-[#333] hover:text-white"
                aria-label="Close assistant"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#FF7A00]/20">
                  <Sparkles className="h-8 w-8 text-[#FF7A00]" />
                </div>
                <h3 className="mb-2 text-lg font-semibold text-white">
                  Welcome to CineVerse Assistant
                </h3>
                <p className="mb-6 max-w-xs text-sm text-gray-400">
                  I can help you find movies, showtimes, and book tickets. What
                  would you like to do?
                </p>
                <div className="flex flex-wrap gap-2">
                  {quickActions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (action.query) {
                          setInputValue(action.query);
                        }
                      }}
                      className="rounded-full bg-[#2a2a2a] px-4 py-2 text-xs text-gray-300 transition hover:bg-[#333] hover:text-white"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((msg) => (
                  <MessageBubble
                    key={msg.id}
                    role={msg.role}
                    content={msg.content}
                    timestamp={msg.timestamp}
                  />
                ))}
                {isLoading && (
                  <div className="flex gap-3">
                    <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#2a2a2a] border border-[#3f3f3f]">
                      <Bot className="h-4 w-4 text-gray-300" />
                    </div>
                    <div className="flex items-center gap-1 rounded-2xl bg-[#2a2a2a] px-4 py-2 border border-[#3f3f3f]">
                      <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                      <span className="text-xs text-gray-400">Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}

            {connectionError && (
              <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-3 py-2 text-sm text-yellow-400 mb-2">
                ⚠️ {connectionError}
              </div>
            )}
            {error && (
              <div className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">
                {error}
              </div>
            )}
          </div>

          {/* Input */}
          <div className="border-t border-[#333] bg-[#222] p-4">
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me anything..."
                disabled={isLoading || isSendingRef.current}
                className="flex-1 rounded-lg border border-[#3f3f3f] bg-[#1a1a1a] px-4 py-2 text-sm text-white placeholder-gray-500 focus:border-[#FF7A00] focus:outline-none focus:ring-1 focus:ring-[#FF7A00] disabled:opacity-50"
                aria-label="Chat input"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isLoading || isSendingRef.current}
                className="rounded-lg bg-[#FF7A00] px-4 py-2 text-white transition hover:bg-[#e66a00] disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                {isLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History Sidebar */}
      <ChatHistorySidebar
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        onRestore={handleRestoreSession}
      />

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/70" onClick={() => setShowResetConfirm(false)} />
          <div className="relative bg-[#1a1a1a] border border-[#333] rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
              <h3 className="text-lg font-semibold text-white">Reset Chat?</h3>
            </div>
            <p className="text-sm text-gray-400 mb-6">
              You have seats reserved. Reset will attempt to release them. Continue?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 text-sm text-gray-300 hover:bg-[#333] rounded transition"
                onClick={() => setShowResetConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm bg-[#FF7A00] text-white rounded hover:bg-[#e66a00] transition"
                onClick={performReset}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
