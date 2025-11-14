import React from "react";

export interface TabItem {
  id: string;
  label: string;
}

interface TabbedMenuProps {
  tabs: TabItem[];
  activeTabId: string;
  onTabChange: (tabId: string) => void;
}

export const TabbedMenu: React.FC<TabbedMenuProps> = ({ tabs, activeTabId, onTabChange }) => {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-3xl border border-[#1f1f25] bg-[#111111] px-4 py-3">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`relative px-3 py-2 text-sm font-semibold uppercase tracking-[0.25em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] ${
              isActive ? "text-[#f6c800]" : "text-gray-400 hover:text-white"
            }`}
            aria-current={isActive ? "page" : undefined}
          >
            {tab.label}
            <span
              className={`absolute left-0 right-0 -bottom-1 h-0.5 origin-center transform rounded-full bg-[#f6c800] transition ${
                isActive ? "scale-x-100 opacity-100 shadow-[0_0_12px_rgba(246,200,0,0.75)]" : "scale-x-0 opacity-0"
              }`}
              aria-hidden="true"
            />
          </button>
        );
      })}
    </div>
  );
};

export default TabbedMenu;

