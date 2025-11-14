import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import confetti from "canvas-confetti";
import toast from "react-hot-toast";
import { CheckCircle, Download, Home } from "lucide-react";
import paymentService from "../../services/paymentService";
import showtimeService, { ShowtimeDetails } from "../../services/showtimeService";
import { useBooking } from "../../context/BookingContext";

interface SuccessState {
  bookingId: string | number;
  amount: number;
  seats?: Array<{ seatId: string | number; label: string; price: number }>;
  showtimeId?: string | number;
}

interface Theatre {
  id: number;
  name: string;
  location_id?: number;
}

// Use the original ShowtimeDetails type to avoid type conflicts
type ShowtimeData = ShowtimeDetails & {
  theatre?: string | Theatre;
  cinema?: string;
};

const PaymentSuccess: React.FC = () => {
  const { bookingId: bookingIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { reset } = useBooking();

  const successState = (location.state || {}) as SuccessState;
  const bookingId = successState.bookingId ?? bookingIdParam;

  const [showtime, setShowtime] = useState<ShowtimeData | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      console.warn("[PaymentSuccess] Missing bookingId in URL/state", { successState, bookingIdParam });
      toast.error("Booking not found.");
      navigate("/home", { replace: true });
    }
  }, [bookingId, navigate, successState, bookingIdParam]);

  useEffect(() => {
    reset();
  }, [reset]);

  useEffect(() => {
    if (!successState.showtimeId) return;
    const loadMeta = async () => {
      try {
        const data = await showtimeService.getShowtimeDetails(successState.showtimeId!);
        setShowtime(data as ShowtimeData);
        console.log("Showtime data:", data); // Debug log
      } catch (error) {
        console.warn("[PaymentSuccess] Failed to load showtime metadata", error);
      }
    };
    loadMeta();
  }, [successState.showtimeId]);

  useEffect(() => {
    const duration = 2000;
    const end = Date.now() + duration;
    (function frame() {
      confetti({ particleCount: 4, angle: 60, spread: 55, origin: { x: 0 } });
      confetti({ particleCount: 4, angle: 120, spread: 55, origin: { x: 1 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
  }, []);

  const amountPaid = successState.amount ?? 0;
  const seatLabels = useMemo(() => successState.seats?.map((seat) => seat.label) ?? [], [successState.seats]);

  // Safe theatre name extraction
  const theatreName = useMemo(() => {
    if (!showtime) return "Theatre";
    
    const theatre = showtime.theatre;
    
    // Handle theatre object
    if (theatre && typeof theatre === 'object' && 'name' in theatre) {
      return theatre.name || "Theatre";
    }
    
    // Handle theatre string
    if (typeof theatre === 'string') {
      return theatre;
    }
    
    // Fallback to cinema or default
    return showtime.cinema || "Theatre";
  }, [showtime]);

  // Safe movie title extraction
  const movieTitle = useMemo(() => {
    if (!showtime) return "Movie";
    return showtime.movie_title || "Movie";
  }, [showtime]);

  // Format showtime date
  const formattedShowtime = useMemo(() => {
    if (!showtime?.start_time) return "Date/time unavailable";
    
    try {
      return new Date(showtime.start_time).toLocaleString('en-IN', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      console.warn("Error formatting showtime:", error);
      return "Date/time unavailable";
    }
  }, [showtime]);

  const handleDownload = async () => {
    if (!bookingId) return;
    setDownloading(true);
    try {
      const blob = await paymentService.downloadTicket(bookingId);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `ticket-${bookingId}.pdf`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[PaymentSuccess] Failed to download ticket", error);
      toast.error("Unable to download ticket. Please try again.");
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050509] py-16 text-white">
      <div className="mx-auto max-w-3xl px-4">
        <div className="rounded-3xl border border-[#1f1f25]/60 bg-[#111118] p-10 text-center shadow-xl">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-green-500/10 text-green-400">
            <CheckCircle size={42} />
          </div>
          <h1 className="mt-6 text-3xl font-bold text-[#f6c800]">Booking Confirmed!</h1>
          <p className="mt-2 text-gray-400">Your seats are locked in. Enjoy the show!</p>

          <div className="mt-8 grid gap-4 text-left sm:grid-cols-2">
            <div className="rounded-2xl bg-[#0d0d16] p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Booking ID</p>
              <p className="mt-1 text-lg font-semibold text-white">#{bookingId}</p>
            </div>
            <div className="rounded-2xl bg-[#0d0d16] p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Amount Paid</p>
              <p className="mt-1 text-lg font-semibold text-white">₹{amountPaid.toFixed(2)}</p>
            </div>
            <div className="rounded-2xl bg-[#0d0d16] p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Showtime</p>
              {/* FIXED: Access object properties safely */}
              <p className="mt-1 text-base text-white">
                {movieTitle} · {theatreName}
              </p>
              <p className="text-sm text-gray-400">
                {formattedShowtime}
              </p>
            </div>
            <div className="rounded-2xl bg-[#0d0d16] p-4 sm:col-span-2">
              <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Seats</p>
              <p className="mt-2 text-sm text-white">{seatLabels.length > 0 ? seatLabels.join(", ") : "Seat details unavailable"}</p>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#f6c800] to-[#ff9d1b] px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-[#050509] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleDownload}
              disabled={downloading}
            >
              <Download size={18} />
              {downloading ? "Preparing..." : "Download Ticket"}
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 rounded-full border border-[#2a2a3a] px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-gray-300 transition hover:bg-[#1a1a24]"
              onClick={() => navigate("/home")}
            >
              <Home size={18} />
              Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;