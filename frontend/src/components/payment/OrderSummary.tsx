import React, { useState } from "react";
import { Mail, Phone, Tag, ChevronDown, ChevronUp } from "lucide-react";
import { BookingContext } from "../../types/booking";

interface OrderSummaryProps {
  context: BookingContext;
  userEmail: string;
  userPhone: string;
  onEmailChange: (email: string) => void;
  onPhoneChange: (phone: string) => void;
}

export default function OrderSummary({
  context,
  userEmail,
  userPhone,
  onEmailChange,
  onPhoneChange,
}: OrderSummaryProps) {
  const [showOffers, setShowOffers] = useState(false);

  const convenienceFee = Math.max(context.amount * 0.02, 18);
  const totalAmount = context.amount + convenienceFee;

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  const formatTime = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6 rounded-lg border border-[#333] bg-[#1a1a1a] p-6">
      <h3 className="text-xl font-semibold text-white">Order Summary</h3>

      <div className="space-y-2 border-b border-[#333] pb-4">
        <h4 className="text-lg font-semibold text-white">{context.movie?.title || "Movie Title"}</h4>
        <div className="space-y-1 text-sm text-gray-400">
          <p>{context.theatre || "Theatre Name"}</p>
          <p>
            {formatDate(context.showtime_start)} • {formatTime(context.showtime_start)}
          </p>
          {context.screen_name && <p>Screen: {context.screen_name}</p>}
        </div>
      </div>

      <div className="border-b border-[#333] pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm text-gray-400">Seats</p>
            <p className="mt-1 font-medium text-white">
              {context.seat_ids.length} {context.seat_ids.length === 1 ? "Ticket" : "Tickets"}
            </p>
            <p className="mt-1 text-xs text-gray-500">
              {(context.seat_labels && context.seat_labels.length > 0 ? context.seat_labels : context.seat_ids.map((id) => id.toString())).join(", ")}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2 border-b border-[#333] pb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Ticket Price</span>
          <span className="text-white">₹{context.amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Convenience Fees</span>
          <span className="text-white">₹{convenienceFee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between pt-2 text-lg font-semibold">
          <span className="text-white">Total Amount</span>
          <span className="text-[#FF7A00]">₹{totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-white">For Sending Booking Details</h4>
        <div className="space-y-2">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="email"
              value={userEmail}
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="Enter email address"
              className="w-full rounded-lg border border-[#333] bg-[#111] py-2 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:outline-none"
            />
          </div>
          <div className="relative">
            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="tel"
              value={userPhone}
              onChange={(event) => onPhoneChange(event.target.value)}
              placeholder="Enter phone number"
              className="w-full rounded-lg border border-[#333] bg-[#111] py-2 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:border-[#FF7A00] focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="border-t border-[#333] pt-4">
        <button
          onClick={() => setShowOffers(!showOffers)}
          className="flex w-full items-center justify-between text-sm text-gray-400 transition-colors hover:text-white"
        >
          <div className="flex items-center gap-2">
            <Tag size={16} />
            <span>Apply Offers</span>
          </div>
          {showOffers ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showOffers && (
          <div className="mt-3 rounded-lg bg-[#111] p-3 text-sm text-gray-500">No offers available at the moment.</div>
        )}
      </div>
    </div>
  );
}
