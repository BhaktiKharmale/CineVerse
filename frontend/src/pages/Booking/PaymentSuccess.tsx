import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import { CheckCircle, Download, Home, Calendar, MapPin, Ticket, Sparkles } from "lucide-react";
import paymentService from "../../services/paymentService";
import showtimeService, { ShowtimeDetails } from "../../services/showtimeService";
import { getSeatMap } from "../../services/showtimeService";
import { useBooking } from "../../context/BookingContext";
import api from "../../libs/apiClient";

interface SuccessState {
  bookingId: string | number;
  amount: number;
  seats?: Array<{ seatId: string | number; label: string; price: number }>;
  showtimeId?: string | number;
  orderId?: string | number;
}

interface BookingDetails {
  id: number;
  seat_numbers?: string;
  seat_labels?: string[];
  seats?: number;
  amount?: number;
  showtime?: {
    movie?: { title?: string };
    theatre?: { name?: string };
    start_time?: string;
  };
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
  const { bookingId: bookingIdParam, orderId: orderIdParam } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { reset, seats: bookingContextSeats } = useBooking();

  const successState = (location.state || {}) as SuccessState;
  const bookingId = successState.bookingId ?? bookingIdParam;

  const [showtime, setShowtime] = useState<ShowtimeData | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [iconScale, setIconScale] = useState(0);
  const [seatLabelsState, setSeatLabelsState] = useState<string[]>([]);

  // Debug logging
  useEffect(() => {
    console.log("[PaymentSuccess] State check:", {
      successState,
      bookingId,
      seatsInState: successState.seats,
      seatCount: successState.seats?.length || 0
    });
  }, [successState, bookingId]);

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

  // Animate icon on mount
  useEffect(() => {
    setIconScale(1);
  }, []);

  // Initialize seat labels from state or booking context immediately
  useEffect(() => {
    // Try navigation state first
    let seatsToUse = successState.seats;
    
    // Fallback to booking context if state is empty
    if ((!seatsToUse || seatsToUse.length === 0) && bookingContextSeats && bookingContextSeats.length > 0) {
      console.log("[PaymentSuccess] Using seats from booking context:", bookingContextSeats);
      seatsToUse = bookingContextSeats;
    }
    
    if (seatsToUse && Array.isArray(seatsToUse) && seatsToUse.length > 0) {
      const labels = seatsToUse
        .map((seat: any) => {
          if (typeof seat === 'string') return seat;
          if (seat?.label) return seat.label;
          if (seat?.seatLabel) return seat.seatLabel;
          return null;
        })
        .filter((label: any): label is string => Boolean(label));
      
      if (labels.length > 0) {
        console.log("[PaymentSuccess] Initializing seat labels:", labels);
        setSeatLabelsState(prev => prev.length === 0 ? labels : prev);
      }
    }
  }, [successState.seats, bookingContextSeats]);

  // Fetch booking details and convert seat IDs to labels
  useEffect(() => {
    const fetchAndConvertSeats = async () => {
      // First, check if we have seats in state or booking context (best case)
      let seatsToCheck = successState.seats || bookingContextSeats;
      if (seatsToCheck && seatsToCheck.length > 0) {
        const labels = seatsToCheck
          .map((seat: any) => seat?.label || seat?.seatLabel)
          .filter(Boolean);
        if (labels.length > 0) {
          console.log("[PaymentSuccess] Using seats from state/context:", labels);
          setSeatLabelsState(labels);
          return;
        }
      }

      // If no seats available, try to fetch from order/payment
      // We need showtimeId to fetch seat map
      const activeShowtimeId = successState.showtimeId || (showtime?.id ? String(showtime.id) : null);
      if (!activeShowtimeId) {
        console.warn("[PaymentSuccess] Missing showtimeId for seat conversion");
        return;
      }

      try {
        // Try to get order details to find seat IDs
        // First, try to get booking from payment verify response or order
        let seatIds: number[] = [];
        
        // Try fetching order details if we have orderId in state or URL params
        const activeOrderId = successState.orderId || orderIdParam;
        if (activeOrderId) {
          try {
            const orderRes = await api.get(`/payments/orders/${activeOrderId}`).catch(() => null);
            if (orderRes?.data?.seats) {
              const seatsStr = orderRes.data.seats;
              seatIds = seatsStr.split(',').map((s: string) => parseInt(s.trim())).filter((id: number) => !isNaN(id));
              console.log("[PaymentSuccess] Found seat IDs from order:", seatIds);
            }
          } catch (error) {
            console.warn("[PaymentSuccess] Failed to fetch order details", error);
          }
        }

        // If we have seat IDs, fetch seat map and convert to labels
        const activeShowtimeId = successState.showtimeId || (showtime?.id ? String(showtime.id) : null);
        if ((seatIds.length > 0 || bookingDetails?.seat_numbers) && activeShowtimeId) {
          const seatMap = await getSeatMap(activeShowtimeId);
          const seatIdToLabel = new Map<number, string>();
          
          if (seatMap?.seats) {
            seatMap.seats.forEach((seat: any) => {
              const seatId = seat.id || seat.seat_id || seat.seatId;
              const label = seat.label || `${seat.row || ''}${seat.number || seat.num || ''}`;
              if (seatId && label) {
                seatIdToLabel.set(Number(seatId), label);
              }
            });
          }
          
          // Use seat IDs from booking details or from order
          const idsToConvert = seatIds.length > 0 
            ? seatIds 
            : bookingDetails?.seat_numbers?.split(',').map(s => parseInt(s.trim())).filter(id => !isNaN(id)) || [];
          
          const labels = idsToConvert
            .map(id => seatIdToLabel.get(Number(id)) || `Seat ${id}`)
            .filter(Boolean);
          
          if (labels.length > 0) {
            console.log("[PaymentSuccess] Converted seat IDs to labels:", labels);
            setSeatLabelsState(labels);
            setBookingDetails(prev => ({
              ...prev,
              seat_labels: labels
            } as any));
          }
        }
      } catch (error) {
        console.warn("[PaymentSuccess] Failed to fetch and convert seats", error);
      }
    };
    
    fetchAndConvertSeats();
  }, [successState.seats, successState.showtimeId, bookingId, bookingDetails, bookingContextSeats, showtime]);

  useEffect(() => {
    if (!successState.showtimeId) return;
    const loadMeta = async () => {
      try {
        const data = await showtimeService.getShowtimeDetails(successState.showtimeId!);
        setShowtime(data as ShowtimeData);
      } catch (error) {
        console.warn("[PaymentSuccess] Failed to load showtime metadata", error);
      }
    };
    loadMeta();
  }, [successState.showtimeId]);


  const amountPaid = successState.amount ?? 0;
  
  // Get seat labels from state, booking context, converted labels, or booking details
  const seatLabels = useMemo(() => {
    console.log("[PaymentSuccess] Computing seatLabels:", {
      seatsInState: successState.seats,
      bookingContextSeats,
      seatLabelsState,
      bookingDetails
    });
    
    // First priority: seats from navigation state (already have labels)
    if (successState.seats && Array.isArray(successState.seats) && successState.seats.length > 0) {
      const labels = successState.seats
        .map((seat: any) => {
          if (typeof seat === 'string') return seat;
          if (seat?.label) return seat.label;
          if (seat?.seatLabel) return seat.seatLabel;
          return null;
        })
        .filter((label: any): label is string => Boolean(label));
      
      if (labels.length > 0) {
        console.log("[PaymentSuccess] Using labels from navigation state:", labels);
        return labels;
      }
    }
    
    // Second priority: seats from booking context
    if (bookingContextSeats && Array.isArray(bookingContextSeats) && bookingContextSeats.length > 0) {
      const labels = bookingContextSeats
        .map((seat: any) => {
          if (typeof seat === 'string') return seat;
          if (seat?.label) return seat.label;
          if (seat?.seatLabel) return seat.seatLabel;
          return null;
        })
        .filter((label: any): label is string => Boolean(label));
      
      if (labels.length > 0) {
        console.log("[PaymentSuccess] Using labels from booking context:", labels);
        return labels;
      }
    }
    
    // Third priority: converted seat labels from state
    if (seatLabelsState.length > 0) {
      console.log("[PaymentSuccess] Using converted labels:", seatLabelsState);
      return seatLabelsState;
    }
    
    // Fourth priority: seat_labels from booking details (converted from IDs)
    if (bookingDetails?.seat_labels && bookingDetails.seat_labels.length > 0) {
      console.log("[PaymentSuccess] Using labels from booking details:", bookingDetails.seat_labels);
      return bookingDetails.seat_labels;
    }
    
    // Fallback: seat_numbers from booking (IDs, not ideal but better than nothing)
    if (bookingDetails?.seat_numbers) {
      const fallback = bookingDetails.seat_numbers.split(',').map(s => s.trim());
      console.log("[PaymentSuccess] Using fallback seat numbers:", fallback);
      return fallback;
    }
    
    console.warn("[PaymentSuccess] No seat labels found! Check console for details.");
    return [];
  }, [successState.seats, bookingContextSeats, seatLabelsState, bookingDetails]);

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
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] via-[#0d0d16] to-[#0a0a0f] text-white relative overflow-hidden">
      {/* Subtle radial gradient background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-gradient-radial from-[#f6c800]/8 via-[#f6c800]/3 to-transparent rounded-full blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl px-4 py-8 sm:py-12">
        {/* Success Header - Closer to user */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center mb-5">
            <div className="relative">
              {/* Glowing ring */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#f6c800] to-[#ff9d1b] rounded-full blur-2xl opacity-40 animate-pulse" />
              {/* Success icon with scale animation */}
              <div 
                className="relative flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-[#f6c800] to-[#ff9d1b] shadow-[0_0_40px_rgba(246,200,0,0.6)] transition-transform duration-200"
                style={{ transform: `scale(${iconScale})` }}
              >
                <CheckCircle className="text-[#050509] w-10 h-10" strokeWidth={2.5} />
              </div>
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold mb-2 text-[#f6c800]">
            Booking Confirmed
          </h1>
          <p className="text-gray-400 text-base font-light">Your tickets are ready. Have a great show!</p>
        </div>

        {/* Main Content Card - Elevated with depth */}
        <div className="relative group">
          {/* Ambient shadow layers */}
          <div className="absolute -inset-1 bg-gradient-to-r from-[#f6c800]/10 via-[#ff9d1b]/10 to-[#f6c800]/10 rounded-3xl blur-xl opacity-60" />
          <div className="absolute -inset-0.5 bg-[#0a0a0f] rounded-3xl opacity-50" />
          
          <div className="relative rounded-3xl border border-[#1f1f25]/40 bg-gradient-to-br from-[#111118] via-[#0f0f15] to-[#0d0d16] p-6 sm:p-8 shadow-[0_20px_60px_rgba(0,0,0,0.5)] transition-all duration-300 hover:shadow-[0_25px_70px_rgba(0,0,0,0.6)] hover:-translate-y-0.5">
            {/* Booking Details Grid - Tighter spacing */}
            <div className="grid gap-4 sm:grid-cols-2 mb-6">
              {/* Booking ID Card */}
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0d0d16] to-[#0a0a0f] border border-[#1f1f25]/30 p-5 hover:border-[#f6c800]/20 transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-[#f6c800]/10 border border-[#f6c800]/20">
                    <Ticket className="w-4 h-4 text-[#f6c800]" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold">BOOKING ID</p>
                </div>
                <p className="text-2xl font-bold text-white">#{bookingId}</p>
              </div>

              {/* Amount Paid Card */}
              <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0d0d16] to-[#0a0a0f] border border-[#1f1f25]/30 p-5 hover:border-[#f6c800]/20 transition-all duration-300">
                <div className="flex items-center gap-3 mb-3">
                  <div className="p-2 rounded-lg bg-[#f6c800]/10 border border-[#f6c800]/20">
                    <Sparkles className="w-4 h-4 text-[#f6c800]" />
                  </div>
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold">AMOUNT PAID</p>
                </div>
                <p className="text-2xl font-bold text-[#f6c800]">₹{amountPaid.toFixed(2)}</p>
              </div>

              {/* Showtime Card - Full Width with divider */}
              <div className="relative sm:col-span-2">
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4" />
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0d0d16] to-[#0a0a0f] border border-[#1f1f25]/30 p-5 hover:border-[#f6c800]/20 transition-all duration-300">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="p-2 rounded-lg bg-[#f6c800]/10 border border-[#f6c800]/20">
                      <Calendar className="w-4 h-4 text-[#f6c800]" />
                    </div>
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold">SHOWING DETAILS</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xl font-bold text-white">
                      {movieTitle}
                    </p>
                    <div className="flex items-center gap-2 text-gray-300">
                      <MapPin className="w-4 h-4" />
                      <span className="text-sm font-medium">{theatreName}</span>
                    </div>
                    <p className="text-sm text-gray-400 font-normal">
                      {formattedShowtime}
                    </p>
                  </div>
                </div>
              </div>

              {/* Seats Card - Full Width with divider */}
              <div className="relative sm:col-span-2">
                <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent mb-4 mt-4" />
                <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-[#0d0d16] to-[#0a0a0f] border border-[#1f1f25]/30 p-5 hover:border-[#f6c800]/20 transition-all duration-300">
                  <p className="text-xs uppercase tracking-[0.2em] text-gray-500 font-semibold mb-4">SELECTED SEATS</p>
                  {seatLabels.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {seatLabels.map((seat, index) => (
                        <span
                          key={index}
                          className="px-3 py-1.5 rounded-lg bg-[#f6c800]/10 border border-[#f6c800]/30 text-[#f6c800] font-semibold text-sm"
                        >
                          {seat}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">Seat details unavailable</p>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons - Modern with personality */}
            <div className="flex flex-col sm:flex-row gap-3 pt-6 border-t border-white/10">
              <button
                type="button"
                className="group relative flex-1 inline-flex items-center justify-center gap-2.5 rounded-xl bg-gradient-to-r from-[#f6c800] to-[#ff9d1b] px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.15em] text-[#050509] transition-all duration-300 hover:shadow-[0_8px_25px_rgba(246,200,0,0.4)] hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                onClick={handleDownload}
                disabled={downloading}
              >
                <Download className="w-4 h-4 transition-transform group-hover:translate-y-0.5" />
                {downloading ? "Preparing..." : "Download Ticket"}
              </button>
              <button
                type="button"
                className="group flex-1 inline-flex items-center justify-center gap-2.5 rounded-xl border border-[#2a2a3a] bg-[#0d0d16]/40 px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.15em] text-gray-300 transition-all duration-300 hover:border-[#f6c800]/40 hover:bg-[#f6c800]/5 hover:text-[#f6c800] hover:shadow-[0_4px_15px_rgba(246,200,0,0.2)]"
                onClick={() => navigate("/home")}
              >
                <Home className="w-4 h-4 transition-transform group-hover:-translate-y-0.5" />
                Back to Home
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.6; }
        }
        .bg-gradient-radial {
          background: radial-gradient(circle, var(--tw-gradient-stops));
        }
      `}</style>
    </div>
  );
};

export default PaymentSuccess;