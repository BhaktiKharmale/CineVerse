// src/components/common/UserAvatarMenu.tsx
import React, { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

/**
 * Small user avatar button that shows initials when logged in.
 * - Uses useAuth() context (user + status + logout).
 * - Computes isAuthenticated from status and user.
 * - Renders Login button when not authenticated.
 *
 * Drop this into your header (top-right).
 */

export default function UserAvatarMenu(): React.ReactElement {
  const { user, status, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  // derive auth boolean from context shape
  const isAuthenticated = status === "authenticated" && !!user;
  const isLoading = status === "idle" || status === "authenticating";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const initials = (() => {
    const name = user?.name || user?.email || "";
    if (!name) return "U";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  })();

  if (isLoading) {
    return (
      <div className="flex items-center">
        <div className="h-10 w-10 animate-pulse rounded-full border border-[#2a2a30] bg-[#1a1a20]" aria-hidden />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/login")}
          className="text-sm font-medium px-3 py-1 rounded-md bg-transparent border border-gray-700 hover:bg-gray-800"
        >
          Login
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-400 text-[#0b0b10] font-semibold shadow-sm border border-gray-700 focus:outline-none"
        title={user?.name || user?.email || "Profile"}
      >
        {initials}
      </button>

      {open && (
        <div
          role="menu"
          aria-label="user menu"
          className="absolute right-0 mt-2 w-44 bg-[#0f1115] border border-gray-800 rounded-md shadow-lg z-50 overflow-hidden"
        >
          <Link
            to="/profile"
            onClick={() => setOpen(false)}
            className="block px-4 py-2 text-sm text-gray-100 hover:bg-gray-800"
          >
            Profile
          </Link>

          <button
            onClick={async () => {
              setOpen(false);
              try {
                await logout();
              } catch {
                // best-effort logout — provider handles state
              }
            }}
            className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-gray-800"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}
