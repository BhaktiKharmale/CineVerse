import React from "react";
import { Menu, Search } from "lucide-react";

interface AdminHeaderProps {
  title: string;
  subtitle?: string;
  onSearchChange?: (query: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
  onToggleSidebar?: () => void;
}

const AdminHeader: React.FC<AdminHeaderProps> = ({
  title,
  subtitle,
  onSearchChange,
  searchPlaceholder,
  actions,
  onToggleSidebar,
}) => {
  return (
    <header className="flex flex-col gap-4 border-b border-[#1f1f25] bg-[#0b0b12] px-6 py-5 text-white md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-3">
        {onToggleSidebar && (
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#1f1f25] bg-[#11111a] text-gray-300 transition hover:border-[#f6c800]/50 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] md:hidden"
            onClick={onToggleSidebar}
            aria-label="Toggle admin navigation"
          >
            <Menu size={18} />
          </button>
        )}
        <div>
          <h1 className="text-2xl font-semibold leading-tight text-white">{title}</h1>
          {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
        </div>
      </div>
      <div className="flex w-full flex-col gap-3 md:w-auto md:flex-row md:items-center">
        {onSearchChange && (
          <label className="relative flex items-center">
            <span className="sr-only">Search</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="search"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder || "Search"}
              className="w-full rounded-full border border-[#1f1f25] bg-[#11111a] py-2 pl-10 pr-4 text-sm text-gray-200 placeholder:text-gray-500 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40 md:w-72"
            />
          </label>
        )}
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
};

export default AdminHeader;
