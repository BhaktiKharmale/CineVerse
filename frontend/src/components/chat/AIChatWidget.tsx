import React, { useState, useEffect } from "react";
import FloatingChatButton from "./FloatingChatButton";
import ChatPanel from "./ChatPanel";

const AGENT_ENABLED = import.meta.env.VITE_AGENT_ENABLED !== "false";
const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";

console.log("[AIChatWidget] Module loaded:", {
  VITE_AGENT_ENABLED: import.meta.env.VITE_AGENT_ENABLED,
  AGENT_ENABLED,
  VITE_API_BASE: import.meta.env.VITE_API_BASE,
  API_BASE,
});

export default function AIChatWidget() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isAgentAvailable, setIsAgentAvailable] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);

  useEffect(() => {
    if (!AGENT_ENABLED) {
      console.log("[AIChatWidget] Agent disabled via VITE_AGENT_ENABLED");
      setIsAgentAvailable(false);
      setIsCheckingHealth(false);
      return;
    }

    const checkHealth = async () => {
      console.log(`[AIChatWidget] Checking health at ${API_BASE}/ai/health`);
      try {
        const response = await fetch(`${API_BASE}/ai/health`, {
          method: "GET",
          headers: { Accept: "application/json" },
        });

        if (!response.ok) {
          console.warn(`[AIChatWidget] Health check failed: ${response.status} ${response.statusText}`);
          setIsAgentAvailable(false);
          return;
        }

        const data = await response.json();
        console.log("[AIChatWidget] Health check response:", data);
        setIsAgentAvailable(data.ok === true);
      } catch (error) {
        console.error("[AIChatWidget] Health check error:", error);
        setIsAgentAvailable(false);
      } finally {
        setIsCheckingHealth(false);
      }
    };

    checkHealth();
  }, [isPanelOpen]);

  useEffect(() => {
    console.log("[AIChatWidget] State:", {
      AGENT_ENABLED,
      isCheckingHealth,
      isAgentAvailable,
      API_BASE,
    });
  }, [isCheckingHealth, isAgentAvailable]);

  if (!AGENT_ENABLED) {
    console.log("[AIChatWidget] Not rendering - AGENT_ENABLED is false");
    return null;
  }

  return (
    <>
      <FloatingChatButton onClick={() => setIsPanelOpen(true)} />
      <ChatPanel isOpen={isPanelOpen} onClose={() => setIsPanelOpen(false)} />
    </>
  );
}
