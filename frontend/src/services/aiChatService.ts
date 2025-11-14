// src/services/aiChatService.ts
import { io, Socket } from "socket.io-client";

// Use VITE_SOCKET_URL if available, otherwise fallback to VITE_API_BASE
const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001").replace(/\/$/, "");

// Storage keys
const SESSION_ID_KEY = "cineverse_ai_session_id";
const OWNER_TOKEN_KEY = "cineverse_ai_owner_token";
const CHAT_HISTORY_KEY = "cineverse_ai_chat_history";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: number;
  toolCalls?: Array<{
    tool_name: string;
    parameters: any;
    result?: any;
    error?: string;
  }>;
}

export interface AIChatService {
  connect: () => void;
  disconnect: () => void;
  sendMessage: (message: string) => void;
  isConnected: () => boolean;
  getSessionId: () => string;
  getOwnerToken: () => string;
  getChatHistory: () => ChatMessage[];
  clearHistory: () => void;
  onToken: (callback: (token: string) => void) => void;
  onToolCall: (callback: (data: any) => void) => void;
  onToolResult: (callback: (data: any) => void) => void;
  onFinalAnswer: (callback: (data: any) => void) => void;
  onError: (callback: (error: string) => void) => void;
  onConnected: (callback: () => void) => void;
  onDisconnected: (callback: () => void) => void;
  onBookingStatus: (callback: (data: any) => void) => void;
}

class AIChatServiceImpl implements AIChatService {
  private socket: Socket | null = null;
  private aiSocket: Socket | null = null;  // Namespace socket for /ai
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private isConnecting = false;

  // Callbacks
  private tokenCallbacks: Array<(token: string) => void> = [];
  private toolCallCallbacks: Array<(data: any) => void> = [];
  private toolResultCallbacks: Array<(data: any) => void> = [];
  private finalAnswerCallbacks: Array<(data: any) => void> = [];
  private errorCallbacks: Array<(error: string) => void> = [];
  private connectedCallbacks: Array<() => void> = [];
  private disconnectedCallbacks: Array<() => void> = [];
  private bookingStatusCallbacks: Array<(data: any) => void> = [];

  constructor() {
    this.initializeSession();
  }

  private initializeSession(): void {
    // Generate or retrieve session ID
    let sessionId = localStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
      sessionId = this.generateUUID();
      localStorage.setItem(SESSION_ID_KEY, sessionId);
    }

    // Generate or retrieve owner token
    let ownerToken = localStorage.getItem(OWNER_TOKEN_KEY);
    if (!ownerToken) {
      ownerToken = this.generateUUID();
      localStorage.setItem(OWNER_TOKEN_KEY, ownerToken);
    }
  }

  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  connect(): void {
    if (this.aiSocket?.connected || this.isConnecting) {
      return;
    }

    this.isConnecting = true;
    this.reconnectAttempts = 0;

    try {
      // Connect directly to the /ai namespace URL
      // Socket.IO client v4: connect to namespace URL directly
      const namespaceUrl = `${SOCKET_URL}/ai`;
      console.log(`[aiChatService] Connecting to Socket.IO namespace: ${namespaceUrl}`);
      
      // Socket.IO client configuration
      // Note: withCredentials and timeout are not standard Socket.IO v4 options,
      // but we include them as requested. Credentials are handled automatically when server has cors_credentials=True
      const socketOptions: any = {
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: this.maxReconnectAttempts,
        reconnectionDelay: this.reconnectDelay,
        reconnectionDelayMax: 5000,
        withCredentials: true,  // Requested option (handled automatically by Socket.IO when server enables CORS credentials)
        timeout: 10000,  // Requested option (connection timeout in ms)
      };
      
      // Connect directly to the /ai namespace
      this.aiSocket = io(namespaceUrl, socketOptions);
      
      // Store base socket reference (for disconnect)
      this.socket = this.aiSocket;

      // Listen on the /ai namespace socket
      this.aiSocket.on("connect", () => {
        console.log("✅ [aiChatService] Connected to AI namespace:", this.aiSocket?.id);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.connectedCallbacks.forEach((cb) => cb());
      });

      this.aiSocket.on("disconnect", (reason: string) => {
        console.log("❌ [aiChatService] Disconnected from AI namespace:", reason);
        this.disconnectedCallbacks.forEach((cb) => cb());
      });

      this.aiSocket.on("connect_error", (error: Error) => {
        console.error("[aiChatService] Connection error:", error.message || error);
        this.isConnecting = false;
        this.reconnectAttempts++;
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
          const errorMsg = `Failed to connect after ${this.maxReconnectAttempts} attempts: ${error.message || "Unknown error"}`;
          console.error(`[aiChatService] ${errorMsg}`);
          this.errorCallbacks.forEach((cb) => cb(errorMsg));
        }
      });

      this.aiSocket.on("connected", (data: any) => {
        console.log("[aiChatService] AI connected event:", data);
      });

      this.aiSocket.on("ai_token", (data: { token: string; trace_id: string } | string) => {
        // Handle both object and string formats
        const token = typeof data === 'string' ? data : data.token;
        const traceId = typeof data === 'object' ? data.trace_id : undefined;
        // Pass traceId to callbacks for stream tracking
        this.tokenCallbacks.forEach((cb) => {
          // Support both old signature (token only) and new (token, traceId)
          if (cb.length === 2) {
            (cb as (token: string, traceId?: string) => void)(token, traceId);
          } else {
            (cb as (token: string) => void)(token);
          }
        });
      });

      this.aiSocket.on("tool_call", (data: any) => {
        console.log("[aiChatService] Tool call:", data);
        this.toolCallCallbacks.forEach((cb) => cb(data));
      });

      this.aiSocket.on("tool_result", (data: any) => {
        console.log("[aiChatService] Tool result:", data);
        this.toolResultCallbacks.forEach((cb) => cb(data));
      });

      this.aiSocket.on("final_answer", (data: any) => {
        console.log("[aiChatService] Final answer:", data);
        this.finalAnswerCallbacks.forEach((cb) => cb(data));
      });

      this.aiSocket.on("error", (data: { message: string } | string) => {
        const errorMsg = typeof data === 'string' ? data : data.message;
        console.error("[aiChatService] Socket error:", errorMsg);
        this.errorCallbacks.forEach((cb) => cb(errorMsg));
      });

      // Add agent_error listener
      this.aiSocket.on("agent_error", (data: { message: string; trace_id?: string; error_type?: string }) => {
        console.error("[aiChatService] Agent error:", data);
        const errorMsg = data.message || "An error occurred";
        this.errorCallbacks.forEach((cb) => cb(errorMsg));
      });

      this.aiSocket.on("booking_status", (data: any) => {
        console.log("[aiChatService] Booking status:", data);
        this.bookingStatusCallbacks.forEach((cb) => cb(data));
      });
    } catch (error) {
      console.error("Error creating socket connection:", error);
      this.isConnecting = false;
      this.errorCallbacks.forEach((cb) => cb("Failed to initialize connection."));
    }
  }

  disconnect(): void {
    if (this.aiSocket) {
      this.aiSocket.disconnect();
      this.aiSocket = null;
    }
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  sendMessage(message: string): void {
    if (!this.aiSocket?.connected) {
      this.errorCallbacks.forEach((cb) => cb("Not connected. Please wait..."));
      return;
    }

    const sessionId = this.getSessionId();
    const ownerToken = this.getOwnerToken();

    this.aiSocket.emit("user_message", {
      message: message.trim(),
      session_id: sessionId,
      owner_token: ownerToken,
    });
  }

  confirmBooking(data: {
    showtime_id: number;
    seat_ids: number[];
    user_email: string;
    payment_ref?: string;
    trace_id: string;
  }): void {
    if (!this.aiSocket?.connected) {
      this.errorCallbacks.forEach((cb) => cb("Not connected. Please wait..."));
      return;
    }

    this.aiSocket.emit("book_confirm", {
      ...data,
      owner_token: this.getOwnerToken(),
    });
  }

  isConnected(): boolean {
    return this.aiSocket?.connected || false;
  }

  getSessionId(): string {
    let sessionId = localStorage.getItem(SESSION_ID_KEY);
    if (!sessionId) {
      sessionId = this.generateUUID();
      localStorage.setItem(SESSION_ID_KEY, sessionId);
    }
    return sessionId;
  }

  getOwnerToken(): string {
    let ownerToken = localStorage.getItem(OWNER_TOKEN_KEY);
    if (!ownerToken) {
      ownerToken = this.generateUUID();
      localStorage.setItem(OWNER_TOKEN_KEY, ownerToken);
    }
    return ownerToken;
  }

  getChatHistory(): ChatMessage[] {
    try {
      const stored = localStorage.getItem(CHAT_HISTORY_KEY);
      if (stored) {
        const history = JSON.parse(stored);
        // Keep only last 20 messages
        return history.slice(-20);
      }
    } catch (error) {
      console.error("Error loading chat history:", error);
    }
    return [];
  }

  saveChatHistory(messages: ChatMessage[]): void {
    try {
      // Keep only last 20 messages
      const limited = messages.slice(-20);
      localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(limited));
    } catch (error) {
      console.error("Error saving chat history:", error);
    }
  }

  clearHistory(): void {
    localStorage.removeItem(CHAT_HISTORY_KEY);
  }

  // Event subscription methods
  onToken(callback: (token: string) => void): void {
    this.tokenCallbacks.push(callback);
  }

  onToolCall(callback: (data: any) => void): void {
    this.toolCallCallbacks.push(callback);
  }

  onToolResult(callback: (data: any) => void): void {
    this.toolResultCallbacks.push(callback);
  }

  onFinalAnswer(callback: (data: any) => void): void {
    this.finalAnswerCallbacks.push(callback);
  }

  onError(callback: (error: string) => void): void {
    this.errorCallbacks.push(callback);
  }

  onConnected(callback: () => void): void {
    this.connectedCallbacks.push(callback);
  }

  onDisconnected(callback: () => void): void {
    this.disconnectedCallbacks.push(callback);
  }

  onBookingStatus(callback: (data: any) => void): void {
    this.bookingStatusCallbacks.push(callback);
  }

  // Remove listener methods for cleanup
  offToken(callback: (token: string) => void): void {
    this.tokenCallbacks = this.tokenCallbacks.filter((cb) => cb !== callback);
  }

  offToolCall(callback: (data: any) => void): void {
    this.toolCallCallbacks = this.toolCallCallbacks.filter((cb) => cb !== callback);
  }

  offToolResult(callback: (data: any) => void): void {
    this.toolResultCallbacks = this.toolResultCallbacks.filter((cb) => cb !== callback);
  }

  offFinalAnswer(callback: (data: any) => void): void {
    this.finalAnswerCallbacks = this.finalAnswerCallbacks.filter((cb) => cb !== callback);
  }

  offError(callback: (error: string) => void): void {
    this.errorCallbacks = this.errorCallbacks.filter((cb) => cb !== callback);
  }

  offConnected(callback: () => void): void {
    this.connectedCallbacks = this.connectedCallbacks.filter((cb) => cb !== callback);
  }

  offDisconnected(callback: () => void): void {
    this.disconnectedCallbacks = this.disconnectedCallbacks.filter((cb) => cb !== callback);
  }

  offBookingStatus(callback: (data: any) => void): void {
    this.bookingStatusCallbacks = this.bookingStatusCallbacks.filter((cb) => cb !== callback);
  }
}

// Singleton instance
export const aiChatService = new AIChatServiceImpl();

