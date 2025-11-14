import React from "react";
import { SeatRowState, SeatState } from "../../services/staticAgentTools";

interface SeatMapProps {
  rows: SeatRowState[];
  selectedSeatIds: Set<string>;
  onToggleSeat: (seat: SeatState) => void;
  lockedUntil?: number;
  lastUpdatedKey: string;
}

const categoryColors: Record<string, string> = {
  Silver: "bg-[#1f2933] border-[#6b7280]",
  Gold: "bg-[#2f2f1d] border-[#facc15]",
  Platinum: "bg-[#312e81] border-[#a78bfa]",
};

const disabledColors: Record<string, string> = {
  Silver: "bg-[#111827] border-[#374151] text-gray-500",
  Gold: "bg-[#16160d] border-[#4b5563] text-gray-500",
  Platinum: "bg-[#1f1b42] border-[#4c1d95] text-gray-500",
};

export function SeatMap({ rows, selectedSeatIds, onToggleSeat, lockedUntil, lastUpdatedKey }: SeatMapProps) {
  return (
    <div className="space-y-4" key={`seatmap-${lastUpdatedKey}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200">Select seats</h3>
        {lockedUntil && (
          <span className="text-xs text-gray-400">
            Hold ends at {new Date(lockedUntil).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        )}
      </div>

      <div className="rounded-lg border border-[#333] bg-[#111] p-4">
        <div className="mb-3 text-center text-xs uppercase tracking-widest text-gray-500">Screen</div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div key={`seat-row-${row.row}`} className="flex items-center gap-3">
              <div className="w-8 text-right text-sm text-gray-500">{row.row}</div>
              <div className="flex flex-wrap gap-2">
                {row.seats.map((seat) => {
                  const isSelected = selectedSeatIds.has(seat.id);
                  const isDisabled = seat.status !== "available" && !isSelected;
                  const colorClasses = isDisabled ? disabledColors[seat.category] : categoryColors[seat.category];

                  return (
                    <button
                      key={`${row.row}-${seat.id}`}
                      type="button"
                      disabled={isDisabled}
                      className={`h-10 w-10 transform rounded-md border text-sm font-medium transition hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-[#FF7A00] focus:ring-offset-0 ${
                        isSelected
                          ? "bg-[#FF7A00] border-[#FF7A00] text-white shadow-lg"
                          : `${colorClasses} text-gray-200`
                      } ${isDisabled ? "cursor-not-allowed opacity-70" : "hover:shadow-lg"}`}
                      onClick={() => onToggleSeat(seat)}
                      aria-label={`Seat ${seat.row}${seat.column} ${isDisabled ? "occupied" : isSelected ? "selected" : "available"}`}
                    >
                      {seat.column}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs text-gray-400">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm border border-[#6b7280] bg-[#1f2933]" /> Silver ₹180
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm border border-[#facc15] bg-[#2f2f1d]" /> Gold ₹240
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-sm border border-[#a78bfa] bg-[#312e81]" /> Platinum ₹320
        </div>
      </div>
    </div>
  );
}

export default SeatMap;
