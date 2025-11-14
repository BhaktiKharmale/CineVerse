import React from "react";
import { MessageCircle } from "lucide-react";

interface FloatingChatButtonProps {
  onClick: () => void;
}

export default function FloatingChatButton({ onClick }: FloatingChatButtonProps) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 z-[9998] flex h-14 w-14 items-center justify-center rounded-full bg-[#FF7A00] text-white shadow-lg transition-all duration-200 hover:bg-[#e66a00] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-[#FF7A00] focus:ring-offset-2 focus:ring-offset-[#0d0d0d]"
      aria-label="Open chat assistant"
      title="Chat with CineVerse Assistant"
    >
      <MessageCircle size={24} />
    </button>
  );
}
