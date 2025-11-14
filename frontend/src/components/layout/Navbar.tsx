import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAdminAuth } from "../../context/AdminAuthContext";
import { useAuth } from "../../hooks/useAuth";
import { clearAllAuthTokens } from "../../libs/apiClient";

const NAV_LINKS = [
  { label: "Home", id: "home", href: "/home" },
  { label: "Cinemas", id: "cinemas", href: "/cinemas" },
  { label: "Offers", id: "offers", href: "/offers" },
];

const CITY_OPTIONS = ["Mumbai", "Bengaluru", "Hyderabad", "Delhi", "Chennai"];

const Navbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated: isAdminAuthenticated } = useAdminAuth();
  const { user, status, logout } = useAuth();

  const [city, setCity] = useState<string>("Mumbai");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isDropdownOpen]);

  const activeLinkId = useMemo(() => {
    if (location.pathname === "/" || location.pathname === "/home") {
      return "home";
    }
    if (location.pathname.startsWith("/offers")) {
      return "offers";
    }
    if (location.pathname.startsWith("/cinemas")) {
      return "cinemas";
    }
    return null;
  }, [location.pathname]);

  const handleNavigate = (href: string, id: string) => {
    setIsMobileMenuOpen(false);
    if (href.startsWith("#")) {
      const target = document.querySelector(href);
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }

    if (href === "#" || href === "") {
      console.info(`[Navbar] Placeholder link clicked: ${id}`);
      return;
    }

    navigate(href);
  };

  const handleLogout = async () => {
    if (isLoggingOut) return; // Prevent double clicks

    setIsLoggingOut(true);
    setIsDropdownOpen(false);

    try {
      // Your Auth context should clear user state; no navigation for smooth UX
      await logout();
    } catch (error) {
      console.error("[Navbar] Logout error:", error);
    } finally {
      // ✅ Guarantee client-side sign-out even if API fails
      clearAllAuthTokens();

      // ✅ No redirect → stays on current page without full re-mount
      setIsLoggingOut(false);
    }
  };

  const handleProfile = () => {
    setIsDropdownOpen(false);
    navigate("/profile");
  };

  const isAuthLoading = status === "idle" || status === "authenticating";
  const isAuthenticated = status === "authenticated" && !!user;

  const initials = useMemo(() => {
    if (!user) return "";
    if (user.avatar) return "";
    const source = user.name || user.email || "";
    const parts = source.trim().split(/\s+/);
    if (parts.length === 0) return "";
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }, [user]);

  const avatarLabel = user?.name || user?.email || "User";

  const renderNavLink = (link: (typeof NAV_LINKS)[number]) => {
    const isActive = activeLinkId === link.id;

    return (
      <button
        key={link.id}
        onClick={() => handleNavigate(link.href, link.id)}
        className={`relative px-3 py-1 text-sm font-medium tracking-wide transition-colors duration-200 ${
          isActive ? "text-black" : "text-gray-300 hover:text-white"
        }`}
        aria-label={`Navigate to ${link.label}`}
      >
        <span
          className={`relative z-[1] ${
            isActive
              ? "inline-flex items-center rounded-full bg-[#f6c800] px-3 py-1 shadow-[0_0_12px_rgba(246,200,0,0.35)]"
              : ""
          }`}
        >
          {link.label}
        </span>
        {!isActive && (
          <span className="pointer-events-none absolute inset-x-1 bottom-0 h-0.5 scale-x-0 bg-[#f6c800]/70 transition-transform duration-300 ease-out group-hover:scale-x-100" />
        )}
      </button>
    );
  };

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-[#1f1f25]/60 bg-[#0b0b0f]/95 text-white backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setIsMobileMenuOpen(false);
              navigate("/home");
            }}
            className="flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
            aria-label="Go to CineVerse home"
          >
            <div className="relative h-10 w-10 overflow-hidden rounded-full bg-[#111] ring-2 ring-[#f6c800]/40">
              <img src="/logo.jpg" alt="CineVerse logo" className="h-full w-full object-cover" loading="lazy" />
            </div>
            <span className="hidden text-2xl font-semibold tracking-wide text-white sm:inline">
              Cine<span className="text-[#f6c800]">Verse</span>
            </span>
          </button>

          <button
            className="flex h-10 w-10 items-center justify-center rounded-md border border-[#2a2a30] bg-[#121217] text-gray-300 transition hover:border-[#f6c800]/50 hover:text-white lg:hidden"
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
          >
            <span className="sr-only">{isMobileMenuOpen ? "Close menu" : "Open menu"}</span>
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              {isMobileMenuOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        <div className="hidden flex-1 items-center justify-center gap-2 lg:flex">
          {NAV_LINKS.map((link) => (
            <span key={link.id} className="group relative">
              {renderNavLink(link)}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="relative">
            <label className="sr-only" htmlFor="navbar-city-selector">
              Select city
            </label>
            <select
              id="navbar-city-selector"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="rounded-full border border-[#2a2a30] bg-[#121217] px-3 py-1.5 text-sm font-medium text-gray-200 shadow-[0_0_12px_rgba(246,200,0,0.12)] transition hover:border-[#f6c800]/60 focus:border-[#f6c800] focus:outline-none"
            >
              {CITY_OPTIONS.map((option) => (
                <option key={option} value={option} className="bg-[#0b0b0f] text-gray-200">
                  {option}
                </option>
              ))}
            </select>
          </div>

          <button
            className="rounded-full border border-[#f6c800]/70 bg-[#15151a] px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#f6c800]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
            onClick={() => navigate(isAdminAuthenticated ? "/admin" : "/admin/login")}
            aria-label={isAdminAuthenticated ? "Open admin dashboard" : "Open admin login"}
          >
            {isAdminAuthenticated ? "Admin" : "Admin Login"}
          </button>

          <div className="relative">
            {isAuthLoading && (
              <div className="h-8 w-8 animate-pulse rounded-full border border-[#2a2a30] bg-[#1a1a20]" aria-hidden="true" />
            )}

            {!isAuthLoading && !isAuthenticated && (
              <button
                className="rounded-full border border-[#f6c800]/70 bg-[#15151a] px-4 py-1.5 text-sm font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#f6c800]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
                onClick={() => navigate("/login")}
              >
                Login
              </button>
            )}

            {isAuthenticated && (
              <div ref={dropdownRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen((prev) => !prev)}
                  className="group flex h-10 w-10 items-center justify-center rounded-full border border-[#f6c800]/70 bg-[#15151a] text-sm font-semibold text-white transition hover:bg-[#f6c800]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
                  aria-haspopup="true"
                  aria-expanded={isDropdownOpen}
                  aria-label="User menu"
                >
                  {user?.avatar ? (
                    <img src={user.avatar} alt={avatarLabel} className="h-full w-full rounded-full object-cover" />
                  ) : (
                    <span aria-hidden="true">{initials || "U"}</span>
                  )}
                </button>

                {isDropdownOpen && (
                  <div
                    role="menu"
                    tabIndex={-1}
                    className="absolute right-0 mt-2 w-48 rounded-xl border border-[#2a2a30] bg-[#111117] p-1.5 text-sm text-gray-200 shadow-xl focus:outline-none"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleProfile}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 hover:bg-[#1e1e27] focus:bg-[#1e1e27] focus:outline-none"
                    >
                      <span className="text-[#f6c800]">•</span>
                      Profile
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={handleLogout}
                      disabled={isLoggingOut}
                      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-red-300 hover:bg-[#1e1e27] hover:text-red-200 focus:bg-[#1e1e27] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="text-red-400">•</span>
                      {isLoggingOut ? "Logging out..." : "Logout"}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="border-t border-[#1f1f25]/60 bg-[#0b0b0f] px-4 pb-4 pt-2 text-sm text-gray-300 lg:hidden">
          <div className="flex flex-col gap-2">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                onClick={() => handleNavigate(link.href, link.id)}
                className={`rounded-xl px-3 py-2 text-left transition ${
                  activeLinkId === link.id ? "bg-[#f6c800] text-black" : "hover:bg-[#161621] hover:text-white"
                }`}
              >
                {link.label}
              </button>
            ))}
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <label className="text-xs font-semibold uppercase tracking-[0.3em] text-gray-500" htmlFor="navbar-city-selector-mobile">
              City
            </label>
            <select
              id="navbar-city-selector-mobile"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              className="rounded-xl border border-[#2a2a30] bg-[#121217] px-3 py-2 text-sm text-gray-200 focus:border-[#f6c800] focus:outline-none"
            >
              {CITY_OPTIONS.map((option) => (
                <option key={option} value={option} className="bg-[#0b0b0f] text-gray-200">
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            {isAuthenticated ? (
              <>
                <button
                  onClick={handleProfile}
                  className="rounded-xl border border-[#2a2a30] px-3 py-2 text-left font-medium text-gray-200 hover:border-[#f6c800] hover:text-white"
                >
                  Profile
                </button>
                <button
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="rounded-xl border border-red-500/40 px-3 py-2 text-left font-medium text-red-300 hover:border-red-400 hover:text-red-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoggingOut ? "Logging out..." : "Logout"}
                </button>
              </>
            ) : (
              <button
                onClick={() => navigate("/login")}
                className="rounded-xl border border-[#f6c800]/70 px-3 py-2 text-left font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#1a1a1f]"
              >
                Login
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
};

export default Navbar;
