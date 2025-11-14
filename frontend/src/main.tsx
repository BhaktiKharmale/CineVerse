// src/main.tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/index.css";

// Import the canonical AuthProvider from context
import { AuthProvider } from "./context/AuthProvider";

console.info("[App] Booting client entry");
console.log("[ENV] VITE_API_BASE =", import.meta.env.VITE_API_BASE);
console.log("[ENV] VITE_SOCKET_URL =", import.meta.env.VITE_SOCKET_URL);
console.log("[ENV] VITE_AGENT_ENABLED =", import.meta.env.VITE_AGENT_ENABLED);

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element with id 'root' not found in index.html");
}

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>,
);
