// frontend/src/components/showtimes/LegendBar.tsx
import React from "react";

export const LegendBar: React.FC = () => {
  return (
    <div className="flex flex-wrap items-center gap-5 text-sm">
      {/* Status Indicators */}
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-green-500 rounded-sm"></div>
        <span className="text-gray-800 font-medium">Available</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-amber-500 rounded-sm"></div>
        <span className="text-gray-800 font-medium">Filling Fast</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-red-500 rounded-sm"></div>
        <span className="text-gray-800 font-medium">Sold Out</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 bg-gray-400 rounded-sm"></div>
        <span className="text-gray-800 font-medium">Lapsed</span>
      </div>
      
      {/* Separator */}
      <div className="w-px h-6 bg-gray-300 mx-1"></div>
      
      {/* Feature Icons */}
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
        </svg>
        <span className="text-gray-800 font-medium">Subtitle</span>
      </div>
      <div className="flex items-center gap-2">
        <svg className="w-4 h-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
        <span className="text-gray-800 font-medium">Accessibility</span>
      </div>
    </div>
  );
};
