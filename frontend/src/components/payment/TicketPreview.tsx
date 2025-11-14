import React from "react";
import { BookingDetails } from "../../services/staticAgentTools";
import { STATIC_MOVIE, STATIC_THEATER, BOOKING_DATE_LABEL } from "../../constants/staticBookingData";

interface TicketPreviewProps {
  booking: BookingDetails;
  onClose: () => void;
}

export function TicketPreview({ booking, onClose }: TicketPreviewProps) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60 px-4">
      <div className="relative w-full max-w-md space-y-4 rounded-xl border border-[#333] bg-[#1a1a1a] p-6 shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 text-gray-400 transition hover:text-white"
          aria-label="Close ticket preview"
        >
          ✕
        </button>
        <div className="flex items-center gap-4">
          <img
            src={STATIC_MOVIE.posterUrl}
            alt={STATIC_MOVIE.title}
            className="h-24 w-16 rounded-md border border-[#444] object-cover"
          />
          <div>
            <p className="text-xs uppercase tracking-widest text-gray-500">Booking confirmed</p>
            <h3 className="text-lg font-semibold text-white">{STATIC_MOVIE.title}</h3>
            <p className="text-sm text-gray-400">{STATIC_THEATER.name}</p>
            <p className="text-xs text-gray-500">{STATIC_THEATER.addressLine}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm text-gray-300">
          <div>
            <p className="text-xs uppercase text-gray-500">Date</p>
            <p>{BOOKING_DATE_LABEL}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-500">Time</p>
            <p>{booking.showtime.startTime}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-500">Seats</p>
            <p>{booking.seats.join(", ")}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-500">Amount</p>
            <p>₹{booking.totalAmount}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-500">Confirmation</p>
            <p className="font-semibold text-white">{booking.confirmationNumber}</p>
          </div>
          <div>
            <p className="text-xs uppercase text-gray-500">Screen</p>
            <p>{booking.showtime.screen}</p>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-dashed border-[#333] pt-4 text-sm text-gray-300">
          <div>
            <p className="text-xs uppercase text-gray-500">Booked for</p>
            <p>{booking.purchaser.name}</p>
          </div>
          <div className="text-right">
            <p className="text-xs uppercase text-gray-500">Paid via UPI</p>
            <p className="font-mono text-sm text-white">{booking.purchaser.upiId}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            className="rounded-lg border border-[#3f3f3f] bg-[#2a2a2a] px-4 py-2 text-sm text-gray-300 transition hover:bg-[#313131]"
          >
            Share ticket
          </button>
          <button
            type="button"
            className="rounded-lg bg-[#FF7A00] px-4 py-2 text-sm text-white transition hover:bg-[#e66a00]"
          >
            Print ticket
          </button>
        </div>
      </div>
    </div>
  );
}

export default TicketPreview;
