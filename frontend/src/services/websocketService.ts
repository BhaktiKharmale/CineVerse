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

    if (this.isConnecting || this.socket?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected or connecting, skipping...');
      return;
    }

    this.showtimeId = validatedShowtimeId;
    this.isManualClose = false;
    this.isConnecting = true;

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
        console.log('[WebSocket] Connected successfully to showtime:', this.showtimeId);
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        
        // Clear connection timeout
        if (this.connectionTimeout) {
          clearTimeout(this.connectionTimeout);
          this.connectionTimeout = null;
        }
        
        this.emit('connected');
        
        // Start ping interval to keep connection alive
        this.pingInterval = setInterval(() => {
          if (this.socket?.readyState === WebSocket.OPEN) {
            this.send({ type: 'ping', timestamp: Date.now() });
          }
        }, 25000); // Reduced ping interval
      };

      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types
          if (data.type === 'pong') {
            return; // Ignore pong responses
          }
          
          if (data.type === 'connected') {
            console.log('[WebSocket] Server confirmed connection:', data.message);
            this.emit('connected');
            return;
          }
          
          // Only log non-ping/pong messages to reduce noise
          if (data.type !== 'ping' && data.type !== 'pong') {
            console.log('[WebSocket] Message received:', data.type);
          }
          
          this.emit(data.type, data);
        } catch (error) {
          console.error('[WebSocket] Error parsing message:', error);
          this.emit('error', 'Failed to parse WebSocket message');
        }
      };

      this.socket.onclose = (event) => {
        console.log(`[WebSocket] Disconnected from showtime ${this.showtimeId}:`, {
          code: event.code,
          reason: event.reason,
          wasClean: event.wasClean
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
        
        // FIXED: Allow reconnection even after 403 errors (token might be expired but connection should work)
        // Only don't reconnect on manual close or policy violations
        if (!this.isManualClose && event.code !== 1003) {
          // Reconnect for all other cases, including 403 (expired token)
          this.handleReconnection();
        } else if (this.isManualClose) {
          console.log('[WebSocket] Manual close - not reconnecting');
        } else {
          console.log('[WebSocket] Not reconnecting due to policy violation:', event.code);
          this.emit('error', `WebSocket connection rejected: ${event.reason || 'Policy violation'}`);
        }
      };

      this.socket.onerror = (error) => {
        console.error('[WebSocket] Connection error for showtime', this.showtimeId, ':', error);
        this.isConnecting = false;
        this.emit('error', 'WebSocket connection failed');
        
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
    console.log('[WebSocket] Manual disconnect initiated for showtime:', this.showtimeId);
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
    
    if (this.socket) {
      this.socket.close(1000, 'Manual disconnect');
      this.socket = null;
    }
    
    this.showtimeId = null;
    this.reconnectAttempts = 0;
    this.isConnecting = false;
    this.listeners.clear();
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