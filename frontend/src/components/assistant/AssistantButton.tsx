/**
 * Floating Assistant Button
 * Displays a floating button to open the assistant panel
 */
import React from "react";
import { MessageCircle } from "lucide-react";

interface AssistantButtonProps {
  onClick: () => void;
}

export default function AssistantButton({ onClick }: AssistantButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#FF7A00] shadow-lg transition-all hover:scale-110 hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#FF7A00] focus:ring-offset-2"
      aria-label="Open CineVerse Assistant"
      title="Chat with CineVerse Assistant"
    >
      <MessageCircle className="h-6 w-6 text-white" />
      <span className="sr-only">Open Assistant</span>
    </button>
  );
}

