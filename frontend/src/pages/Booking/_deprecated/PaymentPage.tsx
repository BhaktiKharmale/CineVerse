/**
 * @deprecated Legacy payment flow retained for compatibility. Prefer Booking/PaymentSummary.
 */
// src/pages/Booking/_deprecated/PaymentPage.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../../components/layout/Navbar";
import Footer from "../../../components/layout/Footer";
import PaymentOptions, { PaymentMethod } from "../../../components/payment/PaymentOptions";
import OrderSummary from "../../../components/payment/OrderSummary";
import { loadBookingContext, validateBookingContext, clearBookingContext } from "../../../utils/bookingContext";
import { BookingContext } from "../../../types/booking";
import {
  createOrder,
  verifyPayment,
  validateLocks,
  CreateOrderResponse,
  ValidateLocksResponse,
  VerifyPaymentResponse,
} from "../../../services/paymentService";
import toast from "react-hot-toast";

declare global {
  interface Window {
    Razorpay: any;
  }
}

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";

export default function PaymentPageNew() {
  const navigate = useNavigate();
  const [bookingContext, setBookingContext] = useState<BookingContext | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [userEmail, setUserEmail] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [conflictError, setConflictError] = useState<{ message: string; conflicts: number[] } | null>(null);
  const [razorpayLoaded, setRazorpayLoaded] = useState(false);

  // Load Razorpay script
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setRazorpayLoaded(true);
    script.onerror = () => {
      console.error("Failed to load Razorpay script");
      toast.error("Payment gateway unavailable");
    };
    document.body.appendChild(script);
    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, []);

  // Load booking context
  useEffect(() => {
    const context = loadBookingContext();
    if (context) {
      const validation = validateBookingContext(context);
      if (validation.valid && validation.context) {
        setBookingContext(validation.context);
        setUserEmail(validation.context.user_email || "");
      } else {
        setValidationErrors(validation.errors);
      }
    } else {
      setValidationErrors(["Booking context not found. Please start over."]);
    }
  }, []);

  // Calculate total with convenience fee
  const calculateTotal = () => {
    if (!bookingContext) return 0;
    const baseAmount = Number(bookingContext.amount || 0);
    const convenienceFee = Math.max(baseAmount * 0.02, 18);
    return baseAmount + convenienceFee;
  };

  const handleProceedToPay = async () => {
    if (!bookingContext || !selectedMethod) {
      toast.error("Please select a payment method");
      return;
    }

    if (!userEmail || !userEmail.includes("@")) {
      toast.error("Please enter a valid email address");
      return;
    }

    setIsCreatingOrder(true);
    setConflictError(null);

    try {
      // Validate locks first — service expects a ValidateLocksInput object
      const lockPayload = {
        showtimeId: bookingContext.showtime_id,
        seats: (bookingContext.seat_ids || []).map((s: number) => ({ seatId: s })),
        owner: bookingContext.owner || undefined,
        lockId: (bookingContext as any).lockId || undefined,
      };

      const lockValidation: ValidateLocksResponse = await validateLocks(lockPayload);

      if (!lockValidation.valid) {
        // be tolerant in reading server shapes
        const conflicts: number[] =
          (lockValidation as any).conflicts ||
          (lockValidation as any).invalid_seats ||
          [];
        const msg =
          (lockValidation as any).message ||
          lockValidation.reason ||
          "Seats are no longer available";
        setConflictError({
          message: msg,
          conflicts,
        });
        setIsCreatingOrder(false);
        return;
      }

      // Create order with convenience fee — createOrder expects CreateOrderInput
      const seatCount = (bookingContext.seat_ids || []).length || 1;

      // Derive per-seat price safely:
      // 1) if bookingContext contains a price_per_seat (legacy), use it — accessed via `any` to avoid TS error
      // 2) else compute from bookingContext.amount / seatCount
      // 3) else fallback to 250
      let perSeat = (() => {
        try {
          const bcAny = bookingContext as any;
          if (bcAny && bcAny.price_per_seat != null) {
            const val = Number(bcAny.price_per_seat);
            if (!Number.isNaN(val) && val > 0) return val;
          }
        } catch {
          // ignore
        }
        // fallback: divide total amount by seat count if available
        const totalAmount = Number(bookingContext.amount || 0);
        if (totalAmount > 0) {
          const candidate = totalAmount / Math.max(1, seatCount);
          if (!Number.isNaN(candidate) && candidate > 0) return candidate;
        }
        return 250; // sensible default
      })();

      // Build payload expected by createOrder
      const createPayload = {
        showtimeId: bookingContext.showtime_id,
        seats: (bookingContext.seat_ids || []).map((s: number) => ({
          seatId: s,
          price: perSeat,
        })),
        owner: bookingContext.owner || undefined,
        lockId: (bookingContext as any).lockId || undefined,
      };

      const totalAmount = calculateTotal();

      const orderData: CreateOrderResponse = await createOrder(createPayload as any);

      // Route based on payment method
      if (selectedMethod === "upi_qr") {
        const rid = (orderData as any).order_id ?? (orderData as any).orderId;
        navigate(`${API_BASE}/payment/upi-status?order_id=${encodeURIComponent(rid)}`);
        setIsCreatingOrder(false);
        return;
      }

      // For typical gateways (Razorpay), open checkout
      if (selectedMethod === "card" || selectedMethod === "upi_app" || selectedMethod === "wallet" || selectedMethod === "netbanking") {
        openRazorpayCheckout(orderData);
        return;
      }

      toast.error("Payment method not yet implemented");
      setIsCreatingOrder(false);
    } catch (error: any) {
      console.error("Payment error:", error);
      if (error?.code === "SEAT_CONFLICT" || (error?.response?.data?.reason === "locks_invalid")) {
        setConflictError({
          message: error?.message || "Seats are no longer available",
          conflicts: error?.conflicts || error?.response?.data?.invalid_seats || [],
        });
      } else {
        const msg = error?.response?.data?.detail || error?.message || "Failed to create payment order";
        toast.error(msg);
      }
      setIsCreatingOrder(false);
    }
  };

  const openRazorpayCheckout = (orderData: CreateOrderResponse) => {
    if (!window.Razorpay || !razorpayLoaded) {
      toast.error("Payment gateway not loaded. Please refresh the page.");
      setIsCreatingOrder(false);
      return;
    }

    if (!bookingContext) {
      setIsCreatingOrder(false);
      return;
    }

    // tolerate different backend shapes (key_id, order_id vs key/orderId)
    const key = (orderData as any).key_id ?? (orderData as any).key ?? undefined;
    const orderId = (orderData as any).order_id ?? (orderData as any).orderId ?? undefined;
    const amountInRupees = (orderData as any).amount ?? calculateTotal();
    // If backend returned paise, convert heuristically:
    const amountToPass = amountInRupees > 1000 ? Math.round(amountInRupees) : Math.round(amountInRupees * 100);

    if (!key) {
      toast.error("Payment provider key missing. Cannot start checkout.");
      setIsCreatingOrder(false);
      return;
    }

    const options = {
      key,
      amount: amountToPass,
      currency: (orderData as any).currency || "INR",
      name: "CineVerse",
      description: `Booking for ${bookingContext.movie?.title || "Movie"}`,
      order_id: orderId,
      prefill: {
        email: userEmail,
        contact: userPhone,
      },
      theme: {
        color: "#FF7A00",
      },
      modal: {
        ondismiss: () => {
          setIsCreatingOrder(false);
          toast.error("Payment cancelled");
        },
      },
      handler: async (response: any) => {
        try {
          const payload = {
            orderId: orderId ?? response?.razorpay_order_id ?? response?.order_id,
            gatewayPayload: {
              razorpay_order_id: response?.razorpay_order_id ?? response?.order_id,
              razorpay_payment_id: response?.razorpay_payment_id ?? response?.payment_id ?? response?.id,
              razorpay_signature: response?.razorpay_signature ?? response?.signature,
              paymentId: response?.payment_id ?? response?.id,
            },
            owner: bookingContext.owner,
          };

          const verifyData: VerifyPaymentResponse = await verifyPayment(payload as any);

          const bookingId = (verifyData as any).booking_id ?? (verifyData as any).bookingId ?? null;
          const downloadUrl = (verifyData as any).download_url ?? (verifyData as any).downloadUrl ?? null;
          const amt = (verifyData as any).amount ?? (verifyData as any).paid_amount ?? null;

          if (!bookingId) {
            toast.error((verifyData as any).message ?? "Payment verified but booking not found");
            setIsCreatingOrder(false);
            return;
          }

          clearBookingContext();
          toast.success("Payment successful!");

          navigate("/payment-success", {
            state: {
              booking_id: bookingId,
              download_url: downloadUrl,
              amount: amt,
              message: (verifyData as any).message,
            },
          });
        } catch (err: any) {
          console.error("Payment verification failed:", err);
          const msg = err?.response?.data?.detail || err?.message || "Payment verification failed";
          toast.error(msg);
          setIsCreatingOrder(false);
        }
      },
    };

    const razorpay = new window.Razorpay(options);
    razorpay.open();
  };

  if (validationErrors.length > 0) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white">
        <Navbar />
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
          <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-semibold text-red-400 mb-4">Invalid Booking</h2>
            <ul className="list-disc list-inside text-gray-300 space-y-2 mb-6">
              {validationErrors.map((error, idx) => (
                <li key={idx}>{error}</li>
              ))}
            </ul>
            <button
              onClick={() => navigate("/home")}
              className="w-full py-2 px-4 bg-[#FF7A00] hover:bg-[#e66a00] text-white rounded-lg font-semibold transition-colors"
            >
              Back to Home
            </button>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  if (!bookingContext) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#FF7A00]"></div>
      </div>
    );
  }

  const totalAmount = calculateTotal();
  const seatSelectionTarget = bookingContext
    ? `/seat-selection?showtime_id=${bookingContext.showtime_id}`
    : "/seat-selection";
  const posterSrc = bookingContext?.movie?.poster || "/images/placeholder_poster.svg";
  const scheduleSummary = bookingContext
    ? (() => {
        try {
          const date = new Date(bookingContext.showtime_start);
          const dateLabel = date.toLocaleDateString("en-IN", {
            weekday: "short",
            day: "numeric",
            month: "short",
          });
          const timeLabel = date.toLocaleTimeString("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
          });
          return `${dateLabel} • ${timeLabel}`;
        } catch {
          return bookingContext.showtime_start;
        }
      })()
    : "";

  const handleEditSeats = () => {
    if (bookingContext) {
      navigate(seatSelectionTarget, { state: bookingContext });
    } else {
      navigate("/seat-selection");
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <Navbar />

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Conflict Error Banner */}
        {conflictError && (
          <div className="mb-6 bg-red-900/30 border border-red-700 rounded-lg p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-red-300 mb-2">{conflictError.message}</h3>
                {conflictError.conflicts.length > 0 && (
                  <p className="text-sm text-red-200">
                    Conflicted seats: {conflictError.conflicts.join(", ")}
                  </p>
                )}
              </div>
              <button
                onClick={handleEditSeats}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                Choose Different Seats
              </button>
            </div>
          </div>
        )}

        {bookingContext && (
          <div className="mb-8 flex flex-col gap-4 rounded-3xl border border-[#1f1f25] bg-[#111118]/85 p-6 shadow-[0_40px_120px_-70px_rgba(246,200,0,0.75)] backdrop-blur md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="relative h-24 w-16 overflow-hidden rounded-2xl border border-[#2a2a30] bg-[#0f0f16]">
                <img
                  src={posterSrc}
                  alt={bookingContext.movie?.title || "Movie poster"}
                  className="h-full w-full object-cover"
                  onError={(event) => {
                    const img = event.target as HTMLImageElement;
                    const placeholder = "/images/placeholder_poster.svg";
                    if (!img.src.endsWith(placeholder)) {
                      img.src = placeholder;
                    }
                  }}
                />
                <span className="absolute inset-0 rounded-2xl border border-[#f6c800]/10" />
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Payment Summary</p>
                <h1 className="text-2xl font-semibold text-white">
                  {bookingContext.movie?.title || "Your booking"}
                </h1>
                <p className="text-sm text-gray-400">
                  {bookingContext.theatre || "CineVerse"}
                  {scheduleSummary ? ` • ${scheduleSummary}` : ""}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#f6c800] md:flex-row md:items-center md:gap-3">
              <button
                type="button"
                onClick={handleEditSeats}
                className="rounded-full border border-[#f6c800]/70 px-5 py-2 text-xs font-semibold text-[#f6c800] transition hover:bg-[#f6c800]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
              >
                Edit Seats
              </button>
              <button
                type="button"
                onClick={() => setSelectedMethod(null)}
                className="rounded-full border border-[#2a2a30] px-5 py-2 text-xs font-semibold text-gray-300 transition hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
              >
                Change Payment Method
              </button>
            </div>
          </div>
        )}

        {/* Two-column layout on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 lg:grid-cols-[65%_35%] gap-6">
          {/* Left: Payment Options */}
          <div className="bg-[#111] rounded-lg p-6">
            <PaymentOptions
              selectedMethod={selectedMethod}
              onSelectMethod={setSelectedMethod}
            />
          </div>

          {/* Right: Order Summary */}
          <div className="lg:sticky lg:top-6 h-fit">
            <OrderSummary
              context={bookingContext}
              userEmail={userEmail}
              userPhone={userPhone}
              onEmailChange={setUserEmail}
              onPhoneChange={setUserPhone}
            />

            {/* Proceed to Pay Button */}
            <button
              onClick={handleProceedToPay}
              disabled={!selectedMethod || isCreatingOrder}
              className="w-full mt-4 py-4 px-6 bg-[#FF7A00] hover:bg-[#e66a00] disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg font-semibold text-lg transition-colors shadow-lg"
            >
              {isCreatingOrder ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  Processing...
                </span>
              ) : (
                `Proceed to Pay ₹${totalAmount.toFixed(2)}`
              )}
            </button>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
