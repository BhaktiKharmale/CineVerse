import React from "react";
import { PriceQuote } from "../../services/staticAgentTools";

interface PriceSummaryProps {
  quote: PriceQuote;
}

export function PriceSummary({ quote }: PriceSummaryProps) {
  return (
    <div className="space-y-3 rounded-lg border border-[#333] bg-[#111] p-4">
      <h3 className="text-sm font-semibold text-gray-200">Price summary</h3>

      <div className="space-y-2 text-sm text-gray-300">
        {quote.seatPriceBreakdown.map((seat) => (
          <div key={`summary-${seat.seatId}`} className="flex items-center justify-between">
            <span>
              Seat {seat.seatId} <span className="text-gray-500">({seat.category})</span>
            </span>
            <span>₹{seat.price}</span>
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-[#333] pt-2 text-gray-400">
          <span>Convenience fee</span>
          <span>₹{quote.convenienceFee}</span>
        </div>
      </div>

      <div className="flex items-center justify-between text-base font-semibold text-white">
        <span>Total payable</span>
        <span>₹{quote.total}</span>
      </div>
    </div>
  );
}

export default PriceSummary;
