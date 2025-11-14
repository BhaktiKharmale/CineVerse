// src/services/paymentService.ts
import axiosClient from "../api/axiosClient";

export interface ValidateLocksResponse {
  valid: boolean;
  reason?: string;
}

export interface CreateOrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  expiresAt: string;
  bookingId?: string;
  gateway: {
    provider: string;
    payload: Record<string, unknown>;
  };
  breakdown?: {
    baseAmount: number;
    convenienceFee?: number;
    tax?: number;
  };
  key_id?: string;
  order_id?: string;
}

export interface VerifyPaymentPayload {
  orderId: string;
  gatewayPayload: Record<string, unknown>;
  owner?: string;
}

export interface VerifyPaymentResponse {
  success: boolean;
  bookingId?: string | number;
  booking_id?: string | number;
  message?: string;
}

export interface OrderDetails extends CreateOrderResponse {
  status: "created" | "paid" | "expired" | "failed";
}

export interface ValidateLocksInput {
  showtimeId: string | number;
  seats: Array<{ seatId: string | number }>;
  lockId?: string;
  owner?: string;
}

export interface CreateOrderInput {
  showtimeId: string | number;
  seats: Array<{ seatId: string | number; price: number }>;
  lockId?: string;
  owner?: string;
}

const api = axiosClient;

async function postFirstThatWorks<T>(paths: string[], body: any): Promise<{ data?: T; all404: boolean; lastErr?: any }> {
  let saw404 = false;
  let lastErr: any;

  for (const p of paths) {
    try {
      const { data } = await api.post<T>(p, body, { headers: { "Content-Type": "application/json" } });
      return { data, all404: false };
    } catch (e: any) {
      lastErr = e;
      if (e?.response?.status === 404) {
        saw404 = true;
        continue;
      }
      throw e;
    }
  }

  return { data: undefined, all404: saw404, lastErr };
}

function buildValidateVariants(input: ValidateLocksInput) {
  const { showtimeId, seats, lockId, owner } = input;
  const baseSeatsArr = seats.map((s) => ({ seatId: s.seatId }));
  const variants: any[] = [];
  if (lockId) variants.push({ showtimeId, lockId, seats: baseSeatsArr });
  if (owner) variants.push({ showtimeId, owner, seats: baseSeatsArr });
  variants.push({ showtimeId, owner, seat_ids: seats.map((s) => s.seatId) });
  return variants;
}

function buildCreateOrderVariants(input: CreateOrderInput) {
  const { showtimeId, seats, lockId, owner } = input;
  const variants: any[] = [];
  if (lockId) variants.push({ showtimeId, lockId, seats });
  if (owner) variants.push({ showtimeId, owner, seats });
  variants.push({
    showtimeId,
    owner,
    seats: seats.map((s) => ({ seat_id: s.seatId, price: s.price })),
  });
  return variants;
}

function validatePaths(showtimeId: string | number) {
  return [
    `/api/payments/validate-locks`,
    `/payments/validate-locks`,
    `/payment/validate-locks`,
    `/locks/validate`,
    `/orders/validate-locks`,
    `/validate-locks`,
    `/showtimes/${showtimeId}/validate-locks`,
  ];
}

function createOrderPaths(showtimeId: string | number) {
  return [
    `/api/payments/create-order`,
    `/payments/create-order`,
    `/payments/order`,
    `/orders`,
    `/order`,
    `/checkout/create-order`,
    `/showtimes/${showtimeId}/orders`,
  ];
}

export const paymentService = {
  async validateLocks(payload: ValidateLocksInput): Promise<ValidateLocksResponse> {
    const paths = validatePaths(payload.showtimeId);
    const variants = buildValidateVariants(payload);
    for (const body of variants) {
      const res = await postFirstThatWorks<ValidateLocksResponse>(paths, body);
      if (res.data) return res.data;
      if (res.all404) return { valid: true };
    }
    throw new Error("Unable to validate locks");
  },

  async createOrder(payload: CreateOrderInput): Promise<CreateOrderResponse> {
    const paths = createOrderPaths(payload.showtimeId);
    const variants = buildCreateOrderVariants(payload);

    function normalizeBackendCreate(data: any): CreateOrderResponse {
      if (data && data.orderId) return data as CreateOrderResponse;
      if (data && (data.order_id || data.id)) {
        const orderId = data.orderId || data.order_id || data.id;
        let amountNum = 0;
        if (typeof data.amount === "number") {
          amountNum = data.amount >= 1000 ? data.amount / 100 : data.amount;
        }
        const gatewayProvider = (data.gateway && data.gateway.provider) || (data.provider || "razorpay");
        const gwPayload: Record<string, unknown> = data.gateway?.payload || data.payload || data.notes || {};
        if (data.key_id) gwPayload["key"] = data.key_id;
        if (data.order_id) gwPayload["order_id"] = data.order_id;
        if (data.id && !gwPayload["order_id"]) gwPayload["order_id"] = data.id;
        return {
          orderId: String(orderId),
          amount: amountNum,
          currency: data.currency || "INR",
          expiresAt: data.expiresAt || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          bookingId: data.bookingId || undefined,
          gateway: {
            provider: gatewayProvider,
            payload: gwPayload,
          },
          breakdown: data.breakdown || undefined,
          ...(data.key_id ? { key_id: data.key_id } : {}),
          ...(data.order_id ? { order_id: data.order_id } : {}),
        } as any;
      }
      return {
        orderId: `dev-${Date.now()}`,
        amount: payload.seats.reduce((s, it) => s + Number(it.price || 0), 0),
        currency: "INR",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        gateway: { provider: "unknown", payload: {} },
      } as CreateOrderResponse;
    }

    for (const body of variants) {
      const res = await postFirstThatWorks<any>(paths, body);
      if (res.data) return normalizeBackendCreate(res.data);
      if (res.all404) {
        const baseAmount = payload.seats.reduce((sum, s) => sum + Number(s.price || 0), 0);
        const convenienceFee = Math.round(baseAmount * 0.05);
        const tax = Math.round((baseAmount + convenienceFee) * 0.18);
        const amount = baseAmount + convenienceFee + tax;
        const now = Date.now();
        const expiresAt = new Date(now + 15 * 60 * 1000).toISOString();
        return {
          orderId: `dev-${now}`,
          amount,
          currency: "INR",
          expiresAt,
          gateway: {
            provider: "dev-fallback",
            payload: { notice: "No /create-order endpoint (404). Using synthesized order in dev." },
          },
          breakdown: { baseAmount, convenienceFee, tax },
        };
      }
    }
    throw new Error("Unable to create order");
  },

  async verifyPayment(payload: VerifyPaymentPayload & { owner?: string }) {
    const body: any = { ...payload };
    body.gatewayPayload = body.gatewayPayload || {};
    if (!("paymentId" in body.gatewayPayload) && !("id" in body.gatewayPayload)) {
      body.gatewayPayload.paymentId = `mock_${Date.now()}`;
    }
    const gp: any = body.gatewayPayload || {};
    body.paymentId = gp.paymentId || gp.id || gp.payment_id || body.paymentId || undefined;
    body.razorpay_order_id = gp.razorpay_order_id || gp.order_id || gp.orderId || body.razorpay_order_id;
    body.razorpay_payment_id = gp.razorpay_payment_id || gp.payment_id || gp.paymentId || body.razorpay_payment_id;
    body.razorpay_signature = gp.razorpay_signature || gp.signature || body.razorpay_signature;
    if (!body.orderId && (gp.order_id || gp.orderId || gp.order)) {
      body.orderId = gp.order_id || gp.orderId || gp.order;
    }
    if (payload.owner) body.owner = payload.owner;

    const { data } = await api.post<VerifyPaymentResponse>("/payments/verify", body);
    return data;
  },

  async getOrder(orderId: string) {
    const { data } = await api.get<OrderDetails>(`/payments/orders/${orderId}`);
    return data;
  },

  async downloadTicket(bookingId: string | number) {
    const response = await api.get<Blob>(`/payments/bookings/${bookingId}/ticket.pdf`, { responseType: "blob" });
    return response.data;
  },
};

export default paymentService;
export const createOrder = paymentService.createOrder;
export const verifyPayment = paymentService.verifyPayment;
export const validateLocks = paymentService.validateLocks;
export const getOrder = paymentService.getOrder;
