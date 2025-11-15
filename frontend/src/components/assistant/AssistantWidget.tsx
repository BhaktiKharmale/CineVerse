/**
 * Assistant Widget Component
 * Main widget that combines the button and panel
 */
import React, { useState, useEffect } from "react";
import AssistantButton from "./AssistantButton";
import AssistantPanel from "./AssistantPanel";
import { checkAssistantHealth } from "../../services/assistantService";

const ASSISTANT_ENABLED = import.meta.env.VITE_ASSISTANT_ENABLED !== "false";
const DEBUG = import.meta.env.VITE_ASSISTANT_DEBUG === "true";

function debugLog(message: string, ...args: any[]): void {
  if (DEBUG) {
    console.log(`[AssistantWidget] ${message}`, ...args);
  }
}

export default function AssistantWidget() {
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isAssistantAvailable, setIsAssistantAvailable] = useState(false);
  const [isCheckingHealth, setIsCheckingHealth] = useState(true);

  useEffect(() => {
    if (!ASSISTANT_ENABLED) {
      debugLog("Assistant disabled via VITE_ASSISTANT_ENABLED");
      setIsAssistantAvailable(false);
      setIsCheckingHealth(false);
      return;
    }

    const checkHealth = async () => {
      debugLog("Checking assistant health...");
      try {
        const available = await checkAssistantHealth();
        setIsAssistantAvailable(available);
        debugLog("Health check result:", available);
      } catch (error) {
        debugLog("Health check error:", error);
        setIsAssistantAvailable(false);
      } finally {
        setIsCheckingHealth(false);
      }
    };

    checkHealth();
  }, []);

  // Don't render if explicitly disabled
  if (!ASSISTANT_ENABLED) {
    return null;
  }

  // Always show button, even if health check is pending or failed
  // The panel will handle displaying appropriate error messages
  return (
    <>
      <AssistantButton 
        onClick={() => setIsPanelOpen(!isPanelOpen)} 
        isOpen={isPanelOpen}
      />
      <AssistantPanel
        isOpen={isPanelOpen}
        onClose={() => setIsPanelOpen(false)}
      />
    </>
  );
}

