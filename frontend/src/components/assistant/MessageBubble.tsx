/**
 * Message Bubble Component
 * Displays a single chat message
 */
import React from "react";
import { User, Bot } from "lucide-react";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export default function MessageBubble({
  role,
  content,
  timestamp,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const timeStr = new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      className={`flex w-full gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
          isUser
            ? "bg-[#FF7A00] text-white"
            : "bg-[#2a2a2a] text-gray-300 border border-[#3f3f3f]"
        }`}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>

      {/* Message Content */}
      <div
        className={`flex max-w-[80%] flex-col gap-1 ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`rounded-2xl px-4 py-2 ${
            isUser
              ? "bg-[#FF7A00] text-white"
              : "bg-[#2a2a2a] text-gray-100 border border-[#3f3f3f]"
          }`}
        >
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {content}
          </p>
        </div>
        <span className="text-xs text-gray-500">{timeStr}</span>
      </div>
    </div>
  );
}

