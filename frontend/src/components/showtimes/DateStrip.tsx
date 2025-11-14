// frontend/src/components/showtimes/DateStrip.tsx
import React from "react";

interface DateOption {
  value: string;
  label: string;
  display: string;
  isToday: boolean;
}

interface DateStripProps {
  dates: DateOption[];
  selected: string;
  onChange: (date: string) => void;
}

export const DateStrip: React.FC<DateStripProps> = ({ dates, selected, onChange }) => {
  return (
    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide">
      {dates.map((option) => {
        const isSelected = selected === option.value;
        const [month, day] = option.display.split(" ");
        
        return (
          <button
            key={option.value}
            onClick={() => onChange(option.value)}
            className={`flex flex-col items-center justify-center px-5 py-3 rounded-lg transition-all whitespace-nowrap min-w-[100px] border ${
              isSelected
                ? "bg-[#f6c800] text-black shadow-md font-bold border-[#f6c800]"
                : "bg-white text-gray-700 hover:bg-gray-50 border-gray-300"
            }`}
          >
            <span className={`text-xs font-semibold mb-1 uppercase ${isSelected ? "text-black" : "text-gray-500"}`}>
              {month}
            </span>
            <span className={`text-3xl font-bold leading-none ${isSelected ? "text-black" : "text-gray-900"}`}>
              {day}
            </span>
            <span className={`text-sm mt-1 font-medium ${isSelected ? "text-black" : "text-gray-600"}`}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
};
