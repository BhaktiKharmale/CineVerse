// frontend/src/components/showtimes/ViewToggle.tsx
import React from "react";

interface ViewToggleProps {
  activeView: "cinemas" | "movies";
  onChange: (view: "cinemas" | "movies") => void;
}

export const ViewToggle: React.FC<ViewToggleProps> = ({ activeView, onChange }) => {
  return (
    <div className="inline-flex bg-white rounded-full p-1 border border-gray-300 shadow-sm">
      <button
        onClick={() => onChange("cinemas")}
        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
          activeView === "cinemas"
            ? "bg-[#f6c800] text-black shadow-md"
            : "text-gray-700 hover:text-gray-900"
        }`}
      >
        Cinemas
      </button>
      <button
        onClick={() => onChange("movies")}
        className={`px-6 py-2 rounded-full text-sm font-bold transition-all ${
          activeView === "movies"
            ? "bg-[#f6c800] text-black shadow-md"
            : "text-gray-700 hover:text-gray-900"
        }`}
      >
        Movies
      </button>
    </div>
  );
};
