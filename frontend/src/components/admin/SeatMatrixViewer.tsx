import React, { useMemo } from "react";

export interface SeatMatrixSeat {
  id: string | number;
  row?: string | null;
  number?: number | null;
  status?: string | null;
}

interface SeatMatrixViewerProps {
  seats: SeatMatrixSeat[];
  loading?: boolean;
  emptyLabel?: string;
}

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500/80",
  booked: "bg-red-500/80",
  locked: "bg-orange-500/80",
  selected: "bg-[#f6c800]/80",
};

const SeatMatrixViewer: React.FC<SeatMatrixViewerProps> = ({ seats, loading = false, emptyLabel }) => {
  const grouped = useMemo(() => {
    const groups = new Map<string, SeatMatrixSeat[]>();
    seats.forEach((seat) => {
      const row = seat.row || "?";
      groups.set(row, [...(groups.get(row) || []), seat]);
    });
    return Array.from(groups.entries())
      .sort(([rowA], [rowB]) => rowA.localeCompare(rowB))
      .map(([row, items]) => ({ row, items: items.sort((a, b) => (a.number || 0) - (b.number || 0)) }));
  }, [seats]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-[#1f1f25] bg-[#0f0f16] text-gray-300">
        <span className="h-4 w-4 animate-spin rounded-full border border-[#1f1f25] border-t-[#f6c800]" />
        <span className="ml-3 text-sm">Loading seats...</span>
      </div>
    );
  }

  if (!seats || seats.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[#1f1f25] bg-[#0f0f16] p-8 text-center text-sm text-gray-500">
        {emptyLabel || "No seat data available."}
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[#1f1f25] bg-[#0f0f16] p-6">
      <div className="flex flex-wrap gap-3 text-xs text-gray-400">
        {Object.entries(STATUS_COLORS).map(([status, color]) => (
          <span key={status} className="inline-flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${color}`} aria-hidden />
            {status}
          </span>
        ))}
      </div>
      <div className="space-y-3">
        {grouped.map(({ row, items }) => (
          <div key={row} className="flex items-center gap-4">
            <span className="w-8 text-right text-sm font-semibold text-gray-400">{row}</span>
            <div className="flex flex-wrap gap-2">
              {items.map((seat) => {
                const status = (seat.status || "available").toLowerCase();
                const color = STATUS_COLORS[status] || "bg-slate-500/60";
                return (
                  <span
                    key={seat.id}
                    className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold text-black ${color}`}
                    aria-label={`Seat ${row}${seat.number ?? ""} — ${status}`}
                  >
                    {seat.number ?? "?"}
                  </span>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SeatMatrixViewer;
