/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE: string; // Example: "http://localhost:8000"
  readonly VITE_WS_BASE?: string; // Optional WebSocket base URL, e.g. "ws://localhost:8000"
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
