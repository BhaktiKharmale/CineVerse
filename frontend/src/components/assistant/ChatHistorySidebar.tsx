/**
 * Chat History Sidebar Component
 * Displays past chat sessions with actions
 */
import React, { useState, useEffect } from "react";
import {
  History,
  X,
  MoreVertical,
  Trash2,
  Copy,
  Download,
  ExternalLink,
  AlertCircle,
} from "lucide-react";
import {
  getAllSessions,
  deleteSession,
  clearAllSessions,
  downloadSession,
  type ChatSession,
} from "../../services/chatHistoryService";
import toast from "react-hot-toast";

interface ChatHistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onRestore: (session: ChatSession, replace?: boolean) => void;
}

export default function ChatHistorySidebar({
  isOpen,
  onClose,
  onRestore,
}: ChatHistorySidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadSessions();
    }
  }, [isOpen]);

  const loadSessions = () => {
    const allSessions = getAllSessions();
    setSessions(allSessions);
  };

  const handleDelete = (sessionId: string) => {
    if (deleteSession(sessionId)) {
      loadSessions();
      toast.success("Session deleted");
      setOpenMenuId(null);
    } else {
      toast.error("Failed to delete session");
    }
  };

  const handleDuplicate = (session: ChatSession) => {
    const duplicated: ChatSession = {
      ...session,
      id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      title: `${session.title} (Copy)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onRestore(duplicated, false);
    setOpenMenuId(null);
    toast.success("Session duplicated");
  };

  const handleExport = (sessionId: string) => {
    try {
      downloadSession(sessionId);
      toast.success("Session exported");
      setOpenMenuId(null);
    } catch (error) {
      toast.error("Failed to export session");
    }
  };

  const handleClearAll = () => {
    clearAllSessions();
    loadSessions();
    setShowClearConfirm(false);
    toast.success("All history cleared");
  };

  const formatRelativeTime = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const getExcerpt = (session: ChatSession): string => {
    const firstAssistant = session.messages.find((m) => m.role === "assistant");
    if (firstAssistant) {
      return firstAssistant.text.slice(0, 80) + (firstAssistant.text.length > 80 ? "..." : "");
    }
    return "No messages";
  };

  const getBadges = (session: ChatSession) => {
    const badges = [];
    if (session.meta.bookingId) {
      badges.push({ label: "Booked", color: "bg-green-500/20 text-green-400" });
    }
    if (session.meta.lockId) {
      badges.push({ label: "Locked", color: "bg-yellow-500/20 text-yellow-400" });
    }
    if (session.meta.lastAction === "payment_failed") {
      badges.push({ label: "Failed", color: "bg-red-500/20 text-red-400" });
    }
    return badges;
  };

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sidebar */}
      <div
        className="fixed right-0 top-0 bottom-0 w-full sm:w-80 md:w-96 bg-[#1a1a1a] border-l border-[#333] z-50 flex flex-col shadow-2xl motion-reduce:transition-none"
        role="dialog"
        aria-label="Chat History"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#333] bg-[#222]">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-[#FF7A00]" />
            <h2 className="text-sm font-semibold text-white">Chat History</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition hover:bg-[#333] hover:text-white"
            aria-label="Close history"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <History className="h-12 w-12 text-gray-600 mb-4" />
              <p className="text-sm text-gray-400">No chat history yet</p>
              <p className="text-xs text-gray-500 mt-2">
                Your conversations will appear here
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((session) => {
                const badges = getBadges(session);
                const isMenuOpen = openMenuId === session.id;

                return (
                  <div
                    key={session.id}
                    className="group relative rounded-lg bg-[#222] border border-[#333] p-3 hover:border-[#FF7A00]/50 transition cursor-pointer"
                    onClick={(e) => {
                      // Don't trigger if clicking menu
                      if ((e.target as HTMLElement).closest(".menu-trigger")) {
                        return;
                      }
                      onRestore(session, true);
                    }}
                  >
                    {/* Title */}
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-medium text-white truncate flex-1">
                        {session.title}
                      </h3>
                      <button
                        className="menu-trigger rounded p-1 text-gray-400 hover:text-white hover:bg-[#333] transition opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(isMenuOpen ? null : session.id);
                        }}
                        aria-label="Session menu"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Menu Dropdown */}
                    {isMenuOpen && (
                      <div
                        className="absolute right-2 top-10 bg-[#2a2a2a] border border-[#3f3f3f] rounded-lg shadow-xl z-10 min-w-[160px]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-[#333] transition"
                          onClick={() => {
                            onRestore(session, true);
                            setOpenMenuId(null);
                          }}
                        >
                          <ExternalLink className="h-4 w-4" />
                          Open
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-[#333] transition"
                          onClick={() => handleDuplicate(session)}
                        >
                          <Copy className="h-4 w-4" />
                          Duplicate
                        </button>
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-300 hover:bg-[#333] transition"
                          onClick={() => handleExport(session.id)}
                        >
                          <Download className="h-4 w-4" />
                          Export
                        </button>
                        <div className="border-t border-[#3f3f3f] my-1" />
                        <button
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-400 hover:bg-[#333] transition"
                          onClick={() => {
                            if (confirm("Delete this session?")) {
                              handleDelete(session.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                          Delete
                        </button>
                      </div>
                    )}

                    {/* Excerpt */}
                    <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                      {getExcerpt(session)}
                    </p>

                    {/* Metadata */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {badges.map((badge, idx) => (
                          <span
                            key={idx}
                            className={`px-2 py-0.5 rounded text-xs font-medium ${badge.color}`}
                          >
                            {badge.label}
                          </span>
                        ))}
                      </div>
                      <span
                        className="text-xs text-gray-500"
                        title={new Date(session.updatedAt).toLocaleString()}
                      >
                        {formatRelativeTime(session.updatedAt)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-[#333] bg-[#222] p-3">
          {sessions.length > 0 && (
            <button
              className="w-full px-3 py-2 text-sm text-red-400 hover:bg-[#333] rounded transition"
              onClick={() => setShowClearConfirm(true)}
            >
              Clear All History
            </button>
          )}
        </div>
      </div>

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="fixed inset-0 bg-black/70" onClick={() => setShowClearConfirm(false)} />
          <div className="relative bg-[#1a1a1a] border border-[#333] rounded-lg p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="h-5 w-5 text-yellow-400" />
              <h3 className="text-lg font-semibold text-white">Clear All History?</h3>
            </div>
            <p className="text-sm text-gray-400 mb-6">
              This will permanently delete all chat sessions. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className="px-4 py-2 text-sm text-gray-300 hover:bg-[#333] rounded transition"
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition"
                onClick={handleClearAll}
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

