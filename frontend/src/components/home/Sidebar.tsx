// src/components/home/Sidebar.tsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

const Sidebar: React.FC = () => {
  const { logout } = useAuth();

  const linkCls = (active: boolean) =>
    `flex items-center gap-3 px-3 py-2 rounded-md ${active ? "bg-gray-700 text-white font-semibold" : "text-gray-300 hover:bg-gray-800"}`;

  return (
    <aside className="w-72 bg-[#0b0b10] border-r border-gray-800 p-6 h-screen sticky top-0">
      <nav className="flex flex-col gap-2">
        <NavLink to="/profile" className={({ isActive }) => linkCls(isActive)}>
          <span>Personal Details</span>
        </NavLink>

        <NavLink to="/my-bookings" className={({ isActive }) => linkCls(isActive)}>
          My Bookings
        </NavLink>

        <NavLink to="/alerts" className={({ isActive }) => linkCls(isActive)}>
          Movie Alerts
        </NavLink>

        <NavLink to="/preferences" className={({ isActive }) => linkCls(isActive)}>
          Preferences
        </NavLink>

        <NavLink to="/saved-cards" className={({ isActive }) => linkCls(isActive)}>
          Saved Cards
        </NavLink>

        <NavLink to="/gift-balance" className={({ isActive }) => linkCls(isActive)}>
          Gift Card Balance
        </NavLink>
      </nav>

      <div className="mt-auto pt-6">
        <button
          onClick={() => logout()}
          className="w-full text-left px-3 py-2 rounded-md text-red-400 hover:bg-gray-800"
        >
          Logout
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
