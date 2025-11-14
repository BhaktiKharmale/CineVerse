import React, { useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import AdminSidebar from "../../components/admin/AdminSidebar";

export interface AdminLayoutContextValue {
  openSidebar: () => void;
  closeSidebar: () => void;
  toggleSidebar: () => void;
  toggleCollapse: () => void;
  isSidebarCollapsed: boolean;
}

const DashboardLayout: React.FC = () => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  const contextValue = useMemo<AdminLayoutContextValue>(
    () => ({
      openSidebar: () => setIsMobileSidebarOpen(true),
      closeSidebar: () => setIsMobileSidebarOpen(false),
      toggleSidebar: () => setIsMobileSidebarOpen((prev) => !prev),
      toggleCollapse: () => setIsSidebarCollapsed((prev) => !prev),
      isSidebarCollapsed,
    }),
    [isSidebarCollapsed],
  );

  return (
    <div className="flex min-h-screen bg-[#08080d] text-white">
      <div className="hidden lg:block">
        <AdminSidebar collapsed={isSidebarCollapsed} />
      </div>

      <div
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-[#1f1f25] bg-[#09090f] shadow-xl transition-transform duration-300 lg:hidden ${
          isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <AdminSidebar onNavigate={() => setIsMobileSidebarOpen(false)} />
      </div>
      {isMobileSidebarOpen && (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
          aria-label="Close admin navigation"
        />
      )}

      <main className="flex min-h-screen flex-1 flex-col bg-[#09090f]">
        <Outlet context={contextValue} />
      </main>
    </div>
  );
};

export default DashboardLayout;
