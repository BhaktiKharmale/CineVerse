// src/services/showtimeService.ts
import api from "../api/axiosClient";
import { webSocketService } from "./websocketService";

/* =========================
   Types
========================= */

export interface SeatInfo {
  id: number | string;
  seatId?: number | string;
  label?: string;
  row?: string;
  number?: number;
  status: "available" | "booked" | "locked" | "blocked" | "wheelchair" | string;
  price?: number;
  zone?: string;
  locked_by?: string | null;
  lockedBy?: string | null;
  [k: string]: any;
}

export interface SeatSection {
  name: string;
  price: number;
  rows: Array<{
    row: string;
    seats: Array<{
      seat_id: number;
      num: number;
      row: string;
      status: string;
      locked_by?: string | null;
      [k: string]: any;
    }>;
  }>;
}

export interface SeatMapNormalized {
  seats: SeatInfo[];
  seat_map_unavailable?: boolean;
  error?: string;
}

export interface ShowtimeDetails {
  id: string | number;
  movie_id?: string | number;
  start_time?: string;
  end_time?: string;
  theatre?: any;
  pricing?: Record<string, number>;
  movie?: any;
  [k: string]: any;
}

export interface SeatLockResponse {
  lockId: string;
  expiresAt: string;
  seats: Array<{ seatId: number; status: SeatInfo["status"] }>;
  conflicts?: Array<{ seatId: number; reason?: string }>;
}

/* =========================
   Internal helpers
========================= */

function extractSections(data: any): SeatSection[] | null {
  if (!data) return null;
  if (Array.isArray(data.sections)) return data.sections as SeatSection[];
  if (Array.isArray(data.layout?.sections)) return data.layout.sections as SeatSection[];
  if (Array.isArray(data.data?.sections)) return data.data.sections as SeatSection[];
  
  // Handle flat seats array
  if (Array.isArray(data.seats)) {
    return [
      {
        name: "default",
        price: data.price ?? 0,
        rows: [
          {
            row: "A",
            seats: data.seats.map((s: any) => ({
              seat_id: s.seat_id ?? s.id ?? s.seatId ?? s.label,
              num: s.num ?? s.no ?? s.number,
              row: s.row ?? "A",
              status: s.status ?? "available",
              locked_by: s.locked_by ?? s.lockedBy,
            })),
          },
        ],
      },
    ];
  }
  
  // Handle sections with rows structure
  if (data.sections && Array.isArray(data.sections)) {
    return data.sections.map((section: any) => ({
      name: section.name || "default",
      price: section.price ?? 0,
      rows: section.rows?.map((row: any) => ({
        row: row.row || "A",
        seats: row.seats?.map((seat: any) => ({
          seat_id: seat.seat_id ?? seat.id ?? seat.seatId,
          num: seat.num ?? seat.number,
          row: seat.row ?? row.row,
          status: seat.status ?? "available",
          locked_by: seat.locked_by ?? seat.lockedBy,
        })) || []
      })) || []
    }));
  }
  
  return null;
}

// FIXED: Consistent seat ID generation
function transformSectionsToSeats(sections: SeatSection[], pricing?: Record<string, number>, showtimeId?: string | number): SeatInfo[] {
  const seats: SeatInfo[] = [];
  
  for (const section of sections) {
    const zone = (section.name || "").toLowerCase();
    const price = section.price ?? pricing?.[zone] ?? 0;
    
    for (const rowData of section.rows ?? []) {
      for (const seatData of rowData.seats ?? []) {
        // Generate consistent ID that matches backend pattern
        const baseSeatId = Number(seatData.seat_id ?? seatData.id ?? seatData.num);
        const consistentId = showtimeId && baseSeatId ? 
          Number(showtimeId) * 10000 + baseSeatId : 
          baseSeatId;
        
        const finalId = Number.isFinite(consistentId) ? consistentId : seatData.seat_id;
        const rowStr = seatData.row ?? rowData.row ?? "";
        const numVal = seatData.num ?? Number(seatData.seat_id ?? 0);
        
        seats.push({
          id: finalId,
          seatId: finalId,
          label: `${rowStr}${numVal}`,
          row: rowStr,
          number: numVal,
          status: seatData.status === "locked" ? "locked" : 
                 seatData.status === "booked" ? "booked" : "available",
          price,
          zone,
          locked_by: seatData.locked_by ?? seatData.lockedBy ?? undefined,
          lockedBy: seatData.locked_by ?? seatData.lockedBy ?? undefined,
          raw: seatData,
        });
      }
    }
  }
  return seats;
}

function normalizeLockData(raw: any, ownerForFallback?: string, ttlMsFallback = 180000): SeatLockResponse {
  const seatsArr: Array<{ seatId: number; status: SeatInfo["status"] }> = Array.isArray(raw?.seats)
    ? raw.seats.map((e: any) => ({ 
        seatId: Number(e?.seatId ?? e?.seat_id ?? e?.id), 
        status: (e?.status ?? "locked") 
      }))
    : Array.isArray(raw?.locked)
    ? raw.locked.map((id: number) => ({ seatId: Number(id), status: "locked" as const }))
    : [];

  const conflictsArr: Array<{ seatId: number; reason?: string }> = Array.isArray(raw?.conflicts)
    ? raw.conflicts.map((c: any) => (typeof c === "object" ? { 
        seatId: Number(c?.seatId ?? c?.seat_id ?? c?.id), 
        reason: c?.reason 
      } : { seatId: Number(c) }))
    : Array.isArray(raw?.detail?.conflicts)
    ? raw.detail.conflicts.map((c: any) => (typeof c === "object" ? { 
        seatId: Number(c?.seatId ?? c?.seat_id ?? c?.id), 
        reason: c?.reason 
      } : { seatId: Number(c) }))
    : [];

  const lockId = String(raw?.lockId ?? raw?.lock_id ?? ownerForFallback ?? "");
  const expiresAt = raw?.expiresAt ?? raw?.expires_at ?? raw?.expires ?? 
                   new Date(Date.now() + Number(raw?.ttl_ms ?? ttlMsFallback)).toISOString();

  return { lockId, expiresAt, seats: seatsArr, conflicts: conflictsArr };
}

/* =========================
   Public API
========================= */

export async function getShowtimeDetails(showtimeId: string | number): Promise<ShowtimeDetails> {
  const { data } = await api.get<ShowtimeDetails>(`/showtimes/${showtimeId}`);
  return data;
}

// FIXED: getSeatMap with consistent ID generation
export async function getSeatMap(showtimeId: string | number): Promise<SeatMapNormalized> {
  try {
    const { data } = await api.get(`/showtimes/${showtimeId}/seats`, { timeout: 25_000 });

    if (data?.seat_map_unavailable) {
      return {
        seats: [],
        seat_map_unavailable: true,
        error: data.error || "Seat map temporarily unavailable",
      };
    }

    const sections = extractSections(data);
    if (!sections || sections.length === 0) {
      return {
        seats: [],
        seat_map_unavailable: true,
        error: "Invalid seat map format received from server",
      };
    }
    
    // Pass showtimeId for consistent ID generation
    return { 
      seats: transformSectionsToSeats(sections, data?.pricing, showtimeId), 
      seat_map_unavailable: false 
    };
  } catch (error: any) {
    console.error('Seat map loading error:', error);
    return {
      seats: [],
      seat_map_unavailable: true,
      error: error?.response?.data?.message || error?.message || "Failed to load seat map",
    };
  }
}

/* ---------- Lock / Unlock ---------- */

function extractSeatIdsFromParams(params: any): number[] {
  if (!params) return [];
  
  if (Array.isArray(params.seatIds) && params.seatIds.length) {
    return params.seatIds.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n));
  }
  if (Array.isArray(params.seat_ids) && params.seat_ids.length) {
    return params.seat_ids.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n));
  }
  if (Array.isArray(params.seats) && params.seats.length) {
    return params.seats.map((s: any) => Number(s?.seatId ?? s?.seat_id ?? s?.id ?? s)).filter((n: number) => Number.isFinite(n));
  }
  if (Array.isArray(params) && params.length && (typeof params[0] === "number" || typeof params[0] === "string")) {
    return params.map((n: any) => Number(n)).filter((n: number) => Number.isFinite(n));
  }
  
  return [];
}

export async function lockSeats(
  showtimeId: string | number,
  params: { owner?: string; owner_token?: string; seatIds?: number[]; seat_ids?: number[]; seats?: any[]; ttlMs?: number } | any
): Promise<SeatLockResponse> {
  const id = String(showtimeId);
  const owner = params?.owner ?? params?.owner_token ?? params?.ownerId;
  const ttlMs = typeof params?.ttlMs !== "undefined" ? Number(params.ttlMs) : undefined;

  let seatIds = extractSeatIdsFromParams(params);
  if (seatIds.length === 0 && Array.isArray(params) && params.length && typeof params[0] === "object") {
    seatIds = params.map((p: any) => Number(p.id ?? p.seatId ?? p.seat_id)).filter((n: number) => Number.isFinite(n));
  }
  if (seatIds.length === 0) throw new Error("No seat IDs provided to lockSeats.");

  // Use Redis locking first
  if (owner) {
    const redisPayload: any = { owner, seat_ids: seatIds };
    if (typeof ttlMs !== "undefined") redisPayload.ttl_ms = ttlMs;
    
    try {
      const { data } = await api.post(`/showtimes/${id}/redis-lock-seats`, redisPayload, { 
        headers: { "Content-Type": "application/json" } 
      });
      return normalizeLockData(data, owner, ttlMs ?? 180000);
    } catch (err: any) {
      const resp = err?.response;
      // Handle conflict responses gracefully
      if (resp && (resp.status === 409 || resp.status === 200) && resp.data) {
        return normalizeLockData(resp.data, owner, ttlMs ?? 180000);
      }
      throw err;
    }
  }

  // DB fallback
  try {
    const { data } = await api.post(`/showtimes/${id}/lock-seats`, { seat_ids: seatIds }, { 
      headers: { "Content-Type": "application/json" } 
    });
    return normalizeLockData(data, undefined, 180000);
  } catch (err: any) {
    const resp = err?.response;
    if (resp && resp.data) {
      return normalizeLockData(resp.data, undefined, 180000);
    }
    throw err;
  }
}

export async function extendLock(showtimeId: string | number, payload: any): Promise<{ expiresAt: string }> {
  const id = String(showtimeId);
  
  try {
    if (payload?.owner) {
      const redisPayload: any = {
        owner: payload.owner,
        seat_ids: payload?.seat_ids ?? payload?.seatIds ?? [],
        ttl_ms: payload?.ttlMs ?? payload?.ttl_ms ?? 180000,
      };
      const { data } = await api.post(`/showtimes/${id}/redis-extend-locks`, redisPayload, { 
        headers: { "Content-Type": "application/json" } 
      });
      return data;
    }
  } catch (e) {
    console.warn('Redis extend lock failed, falling back:', e);
  }

  // Fallback
  const { data } = await api.post(`/showtimes/${id}/extend-locks`, payload, { 
    headers: { "Content-Type": "application/json" } 
  });
  return data;
}

export async function unlockSeats(showtimeId: string | number, payload: { lockId?: string; owner?: string; seatIds?: number[] } | any) {
  const id = String(showtimeId);
  const { lockId, owner, seatIds } = payload ?? {};

  // Try multiple unlock strategies
  const attempts = [];
  
  if (owner) {
    attempts.push(
      api.post(`/showtimes/${id}/redis-unlock-seats`, { owner }, { 
        headers: { "Content-Type": "application/json" } 
      })
    );
  }
  
  if (owner && Array.isArray(seatIds) && seatIds.length > 0) {
    attempts.push(
      api.post(`/showtimes/${id}/redis-unlock-seats`, { 
        owner, 
        seats: seatIds.map((id) => ({ seatId: id })) 
      }, { headers: { "Content-Type": "application/json" } })
    );
  }
  
  if (lockId) {
    attempts.push(
      api.post(`/showtimes/${id}/redis-unlock-seats`, { lockId }, { 
        headers: { "Content-Type": "application/json" } 
      })
    );
  }

  // Try all attempts, succeed if any works
  if (attempts.length > 0) {
    try {
      await Promise.any(attempts);
      return; // Success
    } catch (e) {
      console.warn('All unlock attempts failed:', e);
    }
  }

  // Final fallback
  try {
    await api.post(`/showtimes/${id}/redis-unlock-seats`, { 
      lock_id: lockId, 
      owner, 
      seat_ids: seatIds 
    }, { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    console.warn('Final unlock attempt failed:', e);
    // Don't throw - unlocking is best effort
  }
}

/* =========================
   Real-time WebSocket Methods
========================= */

type SeatUpdateCallbacks = {
  onSeatUpdate?: (seats: SeatInfo[]) => void;
  onSeatLocked?: (seat: SeatInfo) => void;
  onSeatReleased?: (seat: SeatInfo) => void;
  onError?: (error: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
};

function normalizeSeatFromWS(raw: any): SeatInfo {
  const seatId = Number(raw.seat_id ?? raw.seatId ?? raw.id ?? raw.seat_id_param ?? raw.label?.replace?.(/\D/g, ""));
  const num = Number(raw.num ?? raw.number ?? raw.no ?? raw.label?.replace?.(/\D/g, "") ?? seatId);
  const row = raw.row ?? (typeof raw.label === "string" ? raw.label.replace(/[0-9]/g, "") : raw.row) ?? "";
  const status = raw.status ?? raw.state ?? (raw.type === "book" ? "booked" : raw.type === "lock" ? "locked" : "available");
  const lockedBy = raw.locked_by ?? raw.lockedBy ?? raw.owner ?? undefined;
  
  return {
    id: Number.isFinite(seatId) ? seatId : raw.id,
    seatId: Number.isFinite(seatId) ? seatId : raw.seatId,
    label: raw.label ?? `${row}${num}`,
    row,
    number: Number.isFinite(num) ? num : undefined,
    status,
    locked_by: lockedBy,
    lockedBy,
    raw,
  };
}

export function connectToSeatUpdates(showtimeId: string | number, callbacks: SeatUpdateCallbacks): () => void {
  const numericId = typeof showtimeId === "string" ? parseInt(showtimeId, 10) : showtimeId;

  // Wrapped event handlers
  const onSeatUpdateWrapped = (payload: any) => {
    try {
      const rawSeats = Array.isArray(payload) ? payload : payload?.seats ?? [];
      const normalized = rawSeats.map((r: any) => normalizeSeatFromWS(r));
      callbacks.onSeatUpdate?.(normalized);
    } catch (e: any) {
      console.error('Error in seat update handler:', e);
      callbacks.onError?.(String(e));
    }
  };

  const onSeatLockedWrapped = (payload: any) => {
    try {
      const seatNormalized = normalizeSeatFromWS(payload?.seat ?? payload);
      callbacks.onSeatLocked?.(seatNormalized);
    } catch (e: any) {
      console.error('Error in seat locked handler:', e);
      callbacks.onError?.(String(e));
    }
  };

  const onSeatReleasedWrapped = (payload: any) => {
    try {
      const seatNormalized = normalizeSeatFromWS(payload?.seat ?? payload);
      callbacks.onSeatReleased?.(seatNormalized);
    } catch (e: any) {
      console.error('Error in seat released handler:', e);
      callbacks.onError?.(String(e));
    }
  };

  const onConnectedWrapped = () => {
    console.log('[WebSocket] Connected to seat updates');
    callbacks.onConnected?.();
  };

  const onDisconnectedWrapped = () => {
    console.log('[WebSocket] Disconnected from seat updates');
    callbacks.onDisconnected?.();
  };

  const onErrorWrapped = (error: string) => {
    console.error('[WebSocket] Error:', error);
    callbacks.onError?.(error);
  };

  // Register listeners
  if (callbacks.onSeatUpdate) webSocketService.on("seat_update", onSeatUpdateWrapped);
  if (callbacks.onSeatLocked) webSocketService.on("seat_locked", onSeatLockedWrapped);
  if (callbacks.onSeatReleased) webSocketService.on("seat_released", onSeatReleasedWrapped);
  if (callbacks.onError) webSocketService.on("error", onErrorWrapped);
  if (callbacks.onConnected) webSocketService.on("connected", onConnectedWrapped);
  if (callbacks.onDisconnected) webSocketService.on("disconnected", onDisconnectedWrapped);

  // Initiate connection
  try {
    webSocketService.connect(numericId);
  } catch (e) {
    console.error("WebSocket connect failed:", e);
    callbacks.onError?.("WebSocket connect failed");
  }

  // Return cleanup function
  return () => {
    if (callbacks.onSeatUpdate) webSocketService.off("seat_update", onSeatUpdateWrapped);
    if (callbacks.onSeatLocked) webSocketService.off("seat_locked", onSeatLockedWrapped);
    if (callbacks.onSeatReleased) webSocketService.off("seat_released", onSeatReleasedWrapped);
    if (callbacks.onError) webSocketService.off("error", onErrorWrapped);
    if (callbacks.onConnected) webSocketService.off("connected", onConnectedWrapped);
    if (callbacks.onDisconnected) webSocketService.off("disconnected", onDisconnectedWrapped);
  };
}

export function disconnectFromSeatUpdates(): void {
  try {
    webSocketService.disconnect();
  } catch (e) {
    console.warn("webSocketService.disconnect error:", e);
  }
}

export function removeSeatUpdateListeners(callbacks: Partial<Record<keyof SeatUpdateCallbacks, Function>>): void {
  if (callbacks.onSeatUpdate) webSocketService.off("seat_update", callbacks.onSeatUpdate as Function);
  if (callbacks.onSeatLocked) webSocketService.off("seat_locked", callbacks.onSeatLocked as Function);
  if (callbacks.onSeatReleased) webSocketService.off("seat_released", callbacks.onSeatReleased as Function);
  if (callbacks.onError) webSocketService.off("error", callbacks.onError as Function);
  if (callbacks.onConnected) webSocketService.off("connected", callbacks.onConnected as Function);
  if (callbacks.onDisconnected) webSocketService.off("disconnected", callbacks.onDisconnected as Function);
}

export function getWebSocketStatus(): string {
  try {
    return webSocketService.getConnectionStatus();
  } catch {
    return "UNKNOWN";
  }
}
// Add to showtimeService.ts
export function connectToSeatUpdatesPublic(showtimeId: string | number, callbacks: SeatUpdateCallbacks): () => void {
  const numericId = typeof showtimeId === "string" ? parseInt(showtimeId, 10) : showtimeId;

  // Wrapped event handlers
  const onSeatUpdateWrapped = (payload: any) => {
    try {
      const rawSeats = Array.isArray(payload) ? payload : payload?.seats ?? [];
      const normalized = rawSeats.map((r: any) => normalizeSeatFromWS(r));
      callbacks.onSeatUpdate?.(normalized);
    } catch (e: any) {
      console.error('Error in seat update handler:', e);
      callbacks.onError?.(String(e));
    }
  };

  const onSeatLockedWrapped = (payload: any) => {
    try {
      const seatNormalized = normalizeSeatFromWS(payload?.seat ?? payload);
      callbacks.onSeatLocked?.(seatNormalized);
    } catch (e: any) {
      console.error('Error in seat locked handler:', e);
      callbacks.onError?.(String(e));
    }
  };

  const onSeatReleasedWrapped = (payload: any) => {
    try {
      const seatNormalized = normalizeSeatFromWS(payload?.seat ?? payload);
      callbacks.onSeatReleased?.(seatNormalized);
    } catch (e: any) {
      console.error('Error in seat released handler:', e);
      callbacks.onError?.(String(e));
    }
  };

  const onConnectedWrapped = () => {
    console.log('[WebSocket] Connected to seat updates');
    callbacks.onConnected?.();
  };

  const onDisconnectedWrapped = () => {
    console.log('[WebSocket] Disconnected from seat updates');
    callbacks.onDisconnected?.();
  };

  const onErrorWrapped = (error: string) => {
    console.error('[WebSocket] Error:', error);
    callbacks.onError?.(error);
  };

  // Register listeners
  if (callbacks.onSeatUpdate) webSocketService.on("seat_update", onSeatUpdateWrapped);
  if (callbacks.onSeatLocked) webSocketService.on("seat_locked", onSeatLockedWrapped);
  if (callbacks.onSeatReleased) webSocketService.on("seat_released", onSeatReleasedWrapped);
  if (callbacks.onError) webSocketService.on("error", onErrorWrapped);
  if (callbacks.onConnected) webSocketService.on("connected", onConnectedWrapped);
  if (callbacks.onDisconnected) webSocketService.on("disconnected", onDisconnectedWrapped);

  // Use the public connection method
  try {
    webSocketService.connectWithoutAuth(numericId);
  } catch (e) {
    console.error("WebSocket connect failed:", e);
    callbacks.onError?.("WebSocket connect failed");
  }

  // Return cleanup function
  return () => {
    if (callbacks.onSeatUpdate) webSocketService.off("seat_update", onSeatUpdateWrapped);
    if (callbacks.onSeatLocked) webSocketService.off("seat_locked", onSeatLockedWrapped);
    if (callbacks.onSeatReleased) webSocketService.off("seat_released", onSeatReleasedWrapped);
    if (callbacks.onError) webSocketService.off("error", onErrorWrapped);
    if (callbacks.onConnected) webSocketService.off("connected", onConnectedWrapped);
    if (callbacks.onDisconnected) webSocketService.off("disconnected", onDisconnectedWrapped);
  };
}
/* =========================
   Exports
========================= */

const showtimeService = {
  getShowtimeDetails,
  getSeatMap,
  lockSeats,
  extendLock,
  unlockSeats,
  connectToSeatUpdates,
  disconnectFromSeatUpdates,
  removeSeatUpdateListeners,
  getWebSocketStatus,
};

export default showtimeService;