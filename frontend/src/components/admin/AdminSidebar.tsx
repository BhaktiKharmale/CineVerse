import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Film,
  Monitor,
  CalendarClock,
  Settings,
  TicketCheck,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  RowsIcon,
} from "lucide-react";
import { useAdminAuth } from "../../context/AdminAuthContext";

const NAV_ITEMS = [
  { to: "/admin/movies", label: "Movies", icon: Film },
  { to: "/admin/screens", label: "Screens", icon: Monitor },
  { to: "/admin/showtimes", label: "Showtimes", icon: CalendarClock },
  { to: "/admin/seat-tools", label: "Seat Tools", icon: RowsIcon },
  { to: "/admin/bookings", label: "Book Offline", icon: TicketCheck },
  { to: "/admin/requests", label: "Requests", icon: ClipboardList },
  { to: "/admin/settings", label: "Settings", icon: Settings },
];

interface AdminSidebarProps {
  collapsed?: boolean;
  onNavigate?: () => void;
}

const AdminSidebar: React.FC<AdminSidebarProps> = ({ collapsed = false, onNavigate }) => {
  const { adminEmail, logout } = useAdminAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/admin/login", { replace: true });
  };

  return (
    <aside
      className={`flex h-full flex-col border-r border-[#1f1f25] bg-[#09090f] text-gray-300 transition-all duration-300 ${
        collapsed ? "w-20" : "w-64"
      }`}
    >
      <div className="flex items-center gap-3 px-5 py-6">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f6c800]/15 text-[#f6c800]">
          <LayoutDashboard size={20} />
        </span>
        {!collapsed && (
          <div className="leading-tight">
            <p className="text-sm uppercase tracking-[0.28em] text-[#f6c800]">Admin</p>
            <p className="text-lg font-semibold text-white">CineVerse</p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `group flex items-center gap-3 rounded-xl border border-transparent px-4 py-3 text-sm font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] ${
                isActive
                  ? "border-[#f6c800]/60 bg-[#15151f] text-white"
                  : "text-gray-400 hover:border-[#f6c800]/30 hover:bg-[#12121a] hover:text-white"
              }`
            }
            onClick={onNavigate}
          >
            <Icon size={18} className="text-[#f6c800]/80" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-[#1f1f25] px-5 py-4 text-xs text-gray-500">
        {!collapsed && (
          <div className="mb-3">
            <p className="text-gray-400">Logged in as</p>
            <p className="truncate text-sm font-medium text-white">{adminEmail || "Admin"}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-[#f6c800]/60 bg-[#15151f] px-4 py-2 text-sm font-semibold text-[#f6c800] transition hover:bg-[#f6c800]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
        >
          <LogOut size={16} />
          {!collapsed && <span>Logout</span>}
        </button>
      </div>
    </aside>
  );
};

export default AdminSidebar;
