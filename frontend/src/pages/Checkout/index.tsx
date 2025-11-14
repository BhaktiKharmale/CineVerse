// src/pages/Checkout/index.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import paymentService, { CreateOrderResponse, OrderDetails } from "../../services/paymentService";
import { useBooking } from "../../context/BookingContext";
import Loader from "../../components/common/Loader";

type OrderLike = CreateOrderResponse | OrderDetails;

interface LocationState {
  order?: OrderLike;
  showtimeId?: string | number;
  seats?: SeatSummary[];
}

interface SeatSummary {
  seatId: string | number;
  label: string;
  price: number;
}

const CheckoutPage: React.FC = () => {
  const { orderId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { seats, lockId, showtimeId, clearLock, setBooking, reset } = useBooking();

  const locationState = (location.state || {}) as LocationState;
  const seatList: SeatSummary[] = locationState.seats ?? (seats ?? []);

  useEffect(() => {
    if (!orderId) {
      toast.error("Missing order information. Please select seats again.");
      navigate("/movies", { replace: true });
    }
  }, [orderId, navigate]);

  const [order, setOrder] = useState<OrderLike | null>(() => locationState.order ?? null);
  const [loading, setLoading] = useState(!order);
  const [paying, setPaying] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);

  // support different expiry field names
  const orderExpiry = (order as any)?.expiresAt ?? (order as any)?.expires_at ?? null;

  // Fetch order if not provided in route state (refresh scenario)
  useEffect(() => {
    if (order || !orderId) return;

    const fetchOrder = async () => {
      try {
        const response = await paymentService.getOrder(orderId);
        setOrder(response);
      } catch (error) {
        console.error("[Checkout] Failed to load order", error);
        toast.error("Order not found or expired.");
        await clearLock({ silent: true });
        navigate(`/show/${showtimeId ?? ""}/seats`, { replace: true });
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [order, orderId, clearLock, navigate, showtimeId]);

  // countdown
  useEffect(() => {
    if (!orderExpiry) {
      setRemainingSeconds(null);
      return;
    }
    const expiryTime = new Date(orderExpiry).getTime();
    const tick = () => {
      const diff = Math.floor((expiryTime - Date.now()) / 1000);
      setRemainingSeconds(diff > 0 ? diff : 0);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [orderExpiry]);

  useEffect(() => {
    if (remainingSeconds === 0) {
      toast.error("Order expired. Please select seats again.");
      reset();
      navigate(`/show/${showtimeId ?? ""}/seats`, { replace: true });
    }
  }, [remainingSeconds, navigate, reset, showtimeId]);

  const summary = useMemo(() => {
    if (!order) {
      return {
        base: 0,
        fee: 0,
        tax: 0,
        total: 0,
      };
    }

    const anyOrder: any = order as any;
    return {
      base: anyOrder.breakdown?.baseAmount ?? (anyOrder.amount ?? 0),
      fee: anyOrder.breakdown?.convenienceFee ?? 0,
      tax: anyOrder.breakdown?.tax ?? 0,
      total: anyOrder.amount ?? 0,
    };
  }, [order]);

  const handlePayment = async () => {
    if (!orderId || !order) return;
    setPaying(true);

    try {
      const anyOrder: any = order as any;
      // provider can be in different places depending on create-order path
      const provider = anyOrder.gateway?.provider ?? (anyOrder.notes?.gateway ?? "mock");

      // payload may be placed by backend differently
      const gatewayPayload = anyOrder.gateway?.payload ?? anyOrder.gatewayPayload ?? anyOrder.payload ?? {};

      if (provider === "razorpay" && typeof window !== "undefined" && (window as any).Razorpay) {
        const Razorpay = (window as any).Razorpay;

        // Ensure we have the key (Razorpay requires `key`)
        const keyFromOrder = anyOrder.key_id ?? gatewayPayload.key ?? gatewayPayload.key_id ?? null;
        const orderIdFromOrder = anyOrder.order_id ?? anyOrder.id ?? gatewayPayload.order_id ?? gatewayPayload.orderId ?? anyOrder.orderId ?? null;

        if (!keyFromOrder) {
          toast.error("Payment provider configuration missing. Unable to start payment.");
          setPaying(false);
          return;
        }

        const options: Record<string, any> = {
          ...gatewayPayload,
          key: keyFromOrder,
          order_id: orderIdFromOrder ?? undefined,
          handler: async (response: Record<string, unknown>) => {
            try {
              // keep paying true while verifying
              await finalizePayment(response);
            } catch (e) {
              setPaying(false);
              throw e;
            }
          },
          modal: {
            ondismiss: () => {
              setPaying(false);
            },
          },
        };

        const instance = new Razorpay(options);
        instance.open();
      } else {
        // fallback mock flow
        await finalizePayment({ status: "mock_success" });
      }
    } catch (error) {
      console.error("[Checkout] Payment initiation failed", error);
      const msg = (error as any)?.message ?? "Unable to start payment. Please try again.";
      toast.error(msg);
      setPaying(false);
    }
  };

  const finalizePayment = async (gatewayPayload: Record<string, unknown>) => {
    if (!orderId) return;

    try {
      // determine owner token to send: prefer explicit owner on the order, fallback to lockId from context
      const anyOrder: any = order as any;
      const ownerToken =
        anyOrder.owner ??
        anyOrder.owner_token ??
        anyOrder.lockOwner ??
        anyOrder.notes?.owner ??
        anyOrder.meta?.owner ??
        lockId ??
        "";

      const payload = {
        orderId,
        gatewayPayload,
        owner: ownerToken,
      };

      const result = await paymentService.verifyPayment(payload);

      // handle different shapes
      const resolvedBookingId = (result as any).bookingId ?? (result as any).booking_id ?? null;
      const successFlag = (result as any).success ?? true;

      console.info("[Checkout] verifyPayment response", result);

      if (!successFlag || !resolvedBookingId) {
        toast.error((result as any).message ?? "Payment verification failed.");
        setPaying(false);
        return;
      }

      setBooking(String(resolvedBookingId));
      toast.success("Payment successful!");
      navigate(`/booking/${resolvedBookingId}/success`, {
        replace: true,
        state: {
          bookingId: resolvedBookingId,
          amount: (order as any)?.amount ?? 0,
          seats: seatList,
          showtimeId: showtimeId ?? locationState.showtimeId,
        },
      });
    } catch (error: any) {
      console.error("[Checkout] Verification failed", error);
      const msg =
        error?.response?.data?.detail ??
        error?.response?.data?.message ??
        error?.response?.data ??
        error?.message ??
        "Unable to verify payment. Please retry.";
      toast.error(msg);
      setPaying(false);
    }
  };

  const handleCancel = async () => {
    await clearLock({ silent: true });
    reset();
    navigate(`/movie/${showtimeId ?? locationState.showtimeId ?? ""}`, { replace: true });
  };

  if (loading || !order) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#050509]">
        <Loader />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050509] py-12 text-white">
      <div className="mx-auto max-w-4xl px-4">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Payment Summary</h1>
            <p className="text-gray-400">Complete payment to confirm your booking.</p>
          </div>
          <div className="rounded-full border border-[#f6c800]/70 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#f6c800]">
            Order expires in{" "}
            {remainingSeconds !== null
              ? `${Math.floor((remainingSeconds ?? 0) / 60)
                  .toString()
                  .padStart(2, "0")}:${((remainingSeconds ?? 0) % 60).toString().padStart(2, "0")}`
              : "--:--"}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-3xl border border-[#1f1f25]/60 bg-[#111118] p-6">
            <h2 className="text-xl font-semibold">Selected Seats</h2>
            <div className="mt-4 space-y-3">
              {seatList.length > 0 ? (
                seatList.map((seat) => (
                  <div key={seat.seatId} className="flex items-center justify-between rounded-2xl bg-[#0d0d16] px-4 py-3">
                    <div>
                      <p className="text-sm font-medium text-white">{seat.label}</p>
                      <p className="text-xs text-gray-500">Seat</p>
                    </div>
                    <p className="text-sm font-semibold text-[#f6c800]">₹{seat.price.toFixed(2)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-400">Seat details unavailable.</p>
              )}
            </div>
            <button
              type="button"
              className="mt-6 text-sm text-[#f6c800] underline underline-offset-4 hover:text-[#ffd836]"
              onClick={() => navigate(`/show/${showtimeId}/seats`)}
            >
              Change seats
            </button>
          </div>

          <aside className="space-y-4">
            <div className="rounded-3xl border border-[#1f1f25]/60 bg-[#111118] p-6">
              <h3 className="text-lg font-semibold">Fare Breakdown</h3>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between">
                  <span>Base Fare</span>
                  <span>₹{summary.base.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-gray-400">
                  <span>Convenience Fees</span>
                  <span>₹{summary.fee.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-gray-400">
                  <span>Taxes</span>
                  <span>₹{summary.tax.toFixed(2)}</span>
                </div>
                <div className="border-t border-[#1f1f25]/60 pt-3 text-base font-semibold">
                  <div className="flex items-center justify-between">
                    <span>Total Payable</span>
                    <span>₹{summary.total.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-[#1f1f25]/60 bg-[#111118] p-6">
              <p className="text-sm text-gray-400">
                Seats remain locked for this order while you complete payment. Leaving now may release the seats.
              </p>
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  className="rounded-full bg-gradient-to-r from-[#f6c800] to-[#ff9d1b] px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-[#0b0b0f] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={paying}
                  onClick={handlePayment}
                >
                  {paying ? "Processing..." : "Proceed to Payment"}
                </button>
                <button
                  type="button"
                  className="rounded-full border border-[#2a2a3a] px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-gray-300 transition hover:bg-[#1a1a24]"
                  onClick={handleCancel}
                >
                  Cancel & Unlock Seats
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
