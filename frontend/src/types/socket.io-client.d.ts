// Type declarations for socket.io-client
// This ensures TypeScript can properly resolve the module
// socket.io-client v4 includes its own types, but this declaration
// helps with module resolution in some TypeScript configurations
declare module "socket.io-client" {
  export interface Socket {
    connected: boolean;
    id?: string;
    on(event: string, callback: (...args: any[]) => void): this;
    emit(event: string, ...args: any[]): this;
    disconnect(): this;
    of(nsp: string): Socket;
  }

  export interface SocketOptions {
    path?: string;
    transports?: string[];
    autoConnect?: boolean;
    reconnection?: boolean;
    reconnectionAttempts?: number;
    reconnectionDelay?: number;
    reconnectionDelayMax?: number;
  }

  export function io(uri?: string, opts?: SocketOptions): Socket;
  export default io;
}

