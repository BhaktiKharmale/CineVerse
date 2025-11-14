// src/services/websocketService.ts
import { SeatInfo } from "./showtimeService";

export interface WebSocketMessage {
  type: 'seat_update' | 'seat_locked' | 'seat_released' | 'ping' | 'pong' | 'error';
  data?: any;
  seats?: SeatInfo[];
  seat?: SeatInfo;
  message?: string;
}

class WebSocketService {
  private socket: WebSocket | null = null;
  private showtimeId: string | null = null;
  private listeners: Map<string, Function[]> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 2; // Reduced attempts
  private reconnectDelay = 3000; // Reduced delay
  private isManualClose = false;
  private pingInterval: NodeJS.Timeout | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private isConnecting = false;

  // FIXED: Get authentication token from multiple possible locations
  private getAuthToken(): string | null {
    try {
      return localStorage.getItem("cine_user_token") || 
             localStorage.getItem("token") || 
             localStorage.getItem("cineverse_owner_token") ||
             sessionStorage.getItem("cine_user_token");
    } catch {
      return null;
    }
  }

  // FIXED: Use correct WebSocket URL matching backend endpoint
  private buildWebSocketUrl(showtimeId: string): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_API_BASE?.replace(/^https?:\/\//, '') || '127.0.0.1:8001';
    // Backend endpoint is: /api/showtimes/{showtime_id}/seats/ws
    // WebSocket URLs don't use /api prefix in the protocol, so we use /api/showtimes/.../seats/ws
    const baseUrl = `${protocol}//${host}/api/showtimes/${showtimeId}/seats/ws`;
    
    // Backend WebSocket endpoint is public (no authentication required)
    // But we can optionally pass token for future use
    const authToken = this.getAuthToken();
    if (authToken) {
      return `${baseUrl}?token=${encodeURIComponent(authToken)}`;
    }
    
    return baseUrl;
  }

  connect(showtimeId: string | number) {
    // Validate showtimeId to prevent NaN connections
    const validatedShowtimeId = String(showtimeId);
    if (!validatedShowtimeId || validatedShowtimeId === 'NaN' || validatedShowtimeId === 'null' || validatedShowtimeId === 'undefined') {
      console.error('[WebSocket] Invalid showtimeId:', showtimeId);
      this.emit('error', 'Invalid showtime ID');
      return;
    }

    // If already connected to the same showtime, don't reconnect
    if (this.socket?.readyState === WebSocket.OPEN && this.showtimeId === validatedShowtimeId) {
      console.log('[WebSocket] Already connected to this showtime, skipping...');
      return;
    }

    // If connecting or connected to different showtime, disconnect first
    if (this.isConnecting || this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      console.log('[WebSocket] Closing existing connection before connecting to new showtime...');
      this.disconnect();
      // Wait a bit for disconnect to complete
      setTimeout(() => {
        this.connect(showtimeId);
      }, 100);
      return;
    }

    this.showtimeId = validatedShowtimeId;
    this.isManualClose = false;
    this.isConnecting = true;
    this.reconnectAttempts = 0; // Reset reconnect attempts for new connection

    try {
      const wsUrl = this.buildWebSocketUrl(validatedShowtimeId);
      console.log('[WebSocket] Connecting to:', wsUrl);
      this.socket = new WebSocket(wsUrl);

      // Set connection timeout
      this.connectionTimeout = setTimeout(() => {
        if (this.socket?.readyState === WebSocket.CONNECTING) {
          console.log('[WebSocket] Connection timeout');
          this.socket.close();
          this.handleReconnection();
        }
      }, 8000); // Reduced timeout

      this.socket.onopen = () => {
        console.log('[WebSocket] WebSocket opened, waiting for server confirmation...');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Clear connection timeout
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
        // Don't emit 'connected' here - wait for server's 'connected' message
        // The server will send a 'connected' message after accepting and validating
        
        // Start ping interval to keep connection alive (but wait a bit first)
        setTimeout(() => {
          if (this.socket?.readyState === WebSocket.OPEN && this.pingInterval === null) {
            this.pingInterval = setInterval(() => {
              if (this.socket?.readyState === WebSocket.OPEN) {
                console.log('[WebSocket] Sending ping to server');
                this.send({ type: 'ping', timestamp: Date.now() });
              }
            }, 25000); // Ping every 25 seconds
          }
        }, 2000); // Wait 2 seconds before starting ping
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle ping from server - respond with pong
          if (data.type === 'ping') {
            console.log('[WebSocket] Received ping from server, sending pong');
            this.send({ type: 'pong', timestamp: data.timestamp || Date.now() });
            return;
          }
          
          // Handle pong from server (response to our ping)
          if (data.type === 'pong') {
            console.log('[WebSocket] Received pong from server');
            return; // Acknowledge but don't emit
          }
          
          if (data.type === 'connected') {
            console.log('[WebSocket] ✅ Server confirmed connection:', data.message);
            console.log('[WebSocket] Connected successfully to showtime:', this.showtimeId);
            this.emit('connected');
            return;
          }
          
          // Log other message types
          console.log('[WebSocket] Message received:', data.type);
          
          this.emit(data.type, data);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
          this.emit('error', 'Failed to parse WebSocket message');
        }
      };

      this.socket.onclose = (event) => {
        // Store showtimeId and manual close flag before they might be cleared
        const showtimeIdForLog = this.showtimeId;
        const wasManualClose = this.isManualClose;
        
        console.log(`[WebSocket] Disconnected from showtime ${showtimeIdForLog}:`, {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean,
          wasManualClose: wasManualClose
        });
        
        this.isConnecting = false;
        this.emit('disconnected', { code: event.code, reason: event.reason });
        
        // Clear connection timeout
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
        // Clear ping interval
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        
        // Code 1006 = Abnormal Closure (no close frame received)
        // This usually means connection failed before it was established
        // Don't treat this as manual close - it's a connection failure
        if (event.code === 1006 && !event.wasClean) {
          console.warn('[WebSocket] Connection closed abnormally (1006) - connection may have failed before establishment');
          console.warn('[WebSocket] This usually indicates: network error, CORS issue, or server rejection');
          
          // Only reconnect if it wasn't a manual close and we have a valid showtimeId
          if (!wasManualClose && showtimeIdForLog) {
            console.log('[WebSocket] Attempting to reconnect after abnormal closure...');
            // Reset manual close flag for abnormal closures - they're not intentional
            this.isManualClose = false;
            this.handleReconnection();
          } else if (wasManualClose) {
            console.log('[WebSocket] Manual close detected - not reconnecting after 1006');
          } else if (!showtimeIdForLog) {
            console.error('[WebSocket] Cannot reconnect - showtimeId is null');
          }
          return;
        }
        
        // FIXED: Allow reconnection even after 403 errors (token might be expired but connection should work)
        // Only don't reconnect on manual close or policy violations
        if (!wasManualClose && event.code !== 1003) {
          // Reconnect for all other cases, including 403 (expired token)
          this.handleReconnection();
        } else if (wasManualClose) {
          console.log('[WebSocket] Manual close - not reconnecting');
        } else {
          console.log('[WebSocket] Not reconnecting due to policy violation:', event.code);
          this.emit('error', `WebSocket connection rejected: ${event.reason || 'Policy violation'}`);
        }
      };

      this.socket.onerror = (error) => {
        // Store showtimeId before it might be cleared
        const showtimeIdForLog = this.showtimeId;
        console.error('[WebSocket] Connection error for showtime', showtimeIdForLog, ':', error);
        this.isConnecting = false;
        
        // Log more details about the error
        if (this.socket) {
          console.error('[WebSocket] Socket state:', {
            readyState: this.socket.readyState,
            url: this.socket.url,
            protocol: this.socket.protocol
          });
        }
        
        // Only emit error if socket is actually closed or in error state
        if (this.socket?.readyState === WebSocket.CLOSED || this.socket?.readyState === WebSocket.CLOSING) {
          this.emit('error', 'WebSocket connection failed');
        }
        
        // Clear connection timeout
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
      };

    } catch (error) {
      console.error('[WebSocket] Connection setup failed:', error);
      this.isConnecting = false;
      this.emit('error', 'Failed to setup WebSocket connection');
      this.handleReconnection();
    }
  }

  private handleReconnection() {
    if (!this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts && this.showtimeId) {
      this.reconnectAttempts++;
      const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 15000);
      console.log(`[WebSocket] Reconnecting in ${delay}ms... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
      
      setTimeout(() => {
        if (this.showtimeId && !this.isManualClose) {
          this.connect(this.showtimeId);
        }
      }, delay);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[WebSocket] Max reconnection attempts reached, giving up');
      this.emit('error', 'Unable to establish WebSocket connection after multiple attempts');
    }
  }

  send(message: any) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('[WebSocket] Error sending message:', error);
        return false;
      }
    } else {
      console.warn('[WebSocket] Cannot send message, socket not open. State:', this.socket?.readyState);
      return false;
    }
  }

  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(callback);
  }

  off(event: string, callback: Function) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      const index = listeners.indexOf(callback);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    }
  }

  private emit(event: string, data?: any) {
    const listeners = this.listeners.get(event);
    if (listeners) {
      // Use setTimeout to avoid blocking the WebSocket thread
      setTimeout(() => {
        listeners.forEach(callback => {
          try {
            callback(data);
          } catch (error) {
            console.error(`Error in WebSocket listener for ${event}:`, error);
          }
        });
      }, 0);
    }
  }

  disconnect() {
    const showtimeIdForLog = this.showtimeId;
    console.log('[WebSocket] Manual disconnect initiated for showtime:', showtimeIdForLog);
    
    // Set manual close flag first to prevent reconnection
    this.isManualClose = true;
    
    // Clear connection timeout
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }
    
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    // Cancel any pending reconnection attempts
    // (This is handled by isManualClose flag, but we can be explicit)
    
    const hadSocket = !!this.socket;
    if (this.socket) {
      try {
        // Only close if socket is in a valid state
        const state = this.socket.readyState;
        if (state === WebSocket.OPEN) {
          // Socket is open - close gracefully
          this.socket.close(1000, 'Manual disconnect');
        } else if (state === WebSocket.CONNECTING) {
          // Socket is still connecting - abort the connection
          // Close with code 1000 to indicate normal closure
          this.socket.close(1000, 'Manual disconnect');
        } else {
          // Socket is already closed or closing - just clean up
          console.log('[WebSocket] Socket already closed/closing, cleaning up');
        }
      } catch (error) {
        console.warn('[WebSocket] Error closing socket:', error);
      } finally {
        // Always nullify the socket reference
        this.socket = null;
      }
    }
    
    // Reset state (but keep showtimeId until socket is actually closed)
    // This allows error handlers to still log the showtimeId
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    
    // Clear showtimeId after a short delay to allow error handlers to log it
    // Delay clearing showtimeId to allow onclose handler to use it
    if (hadSocket) {
      // Delay clearing showtimeId to allow onclose handler to use it
      setTimeout(() => {
        this.showtimeId = null;
      }, 200);
    } else {
      // No socket was created, clear immediately
      this.showtimeId = null;
    }
  }

  isConnected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  getConnectionStatus(): string {
    if (!this.socket) return 'DISCONNECTED';
    switch (this.socket.readyState) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'CONNECTED';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'DISCONNECTED';
      default: return 'UNKNOWN';
    }
  }

  shouldReconnect(): boolean {
    return !this.isManualClose && this.reconnectAttempts < this.maxReconnectAttempts;
  }

  getCurrentShowtimeId(): string | null {
    return this.showtimeId;
  }

  // FIXED: New method to test connection without authentication
  connectWithoutAuth(showtimeId: string | number) {
    const validatedShowtimeId = String(showtimeId);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_API_BASE?.replace(/^https?:\/\//, '') || '127.0.0.1:8001';
    const wsUrl = `${protocol}//${host}/ws/showtimes/${validatedShowtimeId}/seats`;
    
    console.log('[WebSocket] Connecting without authentication:', wsUrl);
    this.connect(validatedShowtimeId);
  }
}

export const webSocketService = new WebSocketService();