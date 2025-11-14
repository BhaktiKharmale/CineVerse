import {
  BOOKING_DATE_ISO,
  PRICING_CONFIG,
  PREBOOKED_SEATS,
  SEAT_ROWS,
  STATIC_MOVIE,
  STATIC_SHOWTIMES,
  STATIC_THEATER,
  SeatCategory,
  SeatDefinition,
  StaticShowtime,
} from "../constants/staticBookingData";

const TOOL_LATENCY_MS = 400;
const SEAT_LOCK_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_OWNER = "local-user";

type SeatStatus = "available" | "locked" | "booked";

interface SeatState extends SeatDefinition {
  status: SeatStatus;
  lockedBy?: string;
  lockedUntil?: number;
  bookedAt?: number;
}

interface SeatRowState {
  row: string;
  category: SeatCategory;
  price: number;
  seats: SeatState[];
}

export interface SeatMapResponse {
  showtimeId: string;
  rows: SeatRowState[];
  lockedByUser: string[];
  lockedUntil?: number;
}

export interface PriceQuote {
  seatIds: string[];
  subtotal: number;
  convenienceFee: number;
  total: number;
  seatPriceBreakdown: Array<{ seatId: string; price: number; category: SeatCategory }>;
}

export interface BookingDetails {
  confirmationNumber: string;
  movieTitle: string;
  theaterName: string;
  theaterCity: string;
  showtime: StaticShowtime;
  seats: string[];
  totalAmount: number;
  purchaser: {
    name: string;
    upiId: string;
  };
  bookedAt: number;
}

type ShowtimeSeatState = {
  seats: Map<string, SeatState>;
};

const showtimeSeatState: Map<string, ShowtimeSeatState> = new Map();
let bookingCounter = 1024;

function buildSeatDefinitions(): SeatDefinition[] {
  const seats: SeatDefinition[] = [];
  SEAT_ROWS.forEach((rowDef) => {
    rowDef.seatNumbers.forEach((seatNumber) => {
      seats.push({
        id: `${rowDef.row}${seatNumber}`,
        row: rowDef.row,
        column: seatNumber,
        category: rowDef.category,
        price: rowDef.price,
      });
    });
  });
  return seats;
}

const seatDefinitions = buildSeatDefinitions();

function initialiseShowtimeState(showtimeId: string): ShowtimeSeatState {
  const existing = showtimeSeatState.get(showtimeId);
  if (existing) {
    return existing;
  }

  const baseState: ShowtimeSeatState = {
    seats: new Map(),
  };

  const presetBooked = new Set(PREBOOKED_SEATS[showtimeId] || []);

  seatDefinitions.forEach((seat) => {
    baseState.seats.set(seat.id, {
      ...seat,
      status: presetBooked.has(seat.id) ? "booked" : "available",
      bookedAt: presetBooked.has(seat.id) ? Date.now() - 60 * 60 * 1000 : undefined,
    });
  });

  showtimeSeatState.set(showtimeId, baseState);
  return baseState;
}

function purgeExpiredLocks(showtimeId: string) {
  const now = Date.now();
  const state = initialiseShowtimeState(showtimeId);
  state.seats.forEach((seat) => {
    if (seat.status === "locked" && seat.lockedUntil && seat.lockedUntil < now) {
      seat.status = "available";
      delete seat.lockedBy;
      delete seat.lockedUntil;
    }
  });
}

function simulateLatency<T>(value: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      const result = value();
      setTimeout(() => resolve(result), TOOL_LATENCY_MS);
    } catch (error) {
      setTimeout(() => reject(error), TOOL_LATENCY_MS);
    }
  });
}

function toSeatMapResponse(showtimeId: string): SeatMapResponse {
  const state = initialiseShowtimeState(showtimeId);
  const rows: SeatRowState[] = SEAT_ROWS.map((rowDef) => ({
    row: rowDef.row,
    category: rowDef.category,
    price: rowDef.price,
    seats: rowDef.seatNumbers.map((seatNumber) => {
      const seatId = `${rowDef.row}${seatNumber}`;
      const seatState = state.seats.get(seatId)!;
      return { ...seatState };
    }),
  }));

  const lockedSeat = Array.from(state.seats.values()).find(
    (seat) => seat.status === "locked" && seat.lockedBy === LOCK_OWNER
  );

  return {
    showtimeId,
    rows,
    lockedByUser: Array.from(state.seats.values())
      .filter((seat) => seat.status === "locked" && seat.lockedBy === LOCK_OWNER)
      .map((seat) => seat.id),
    lockedUntil: lockedSeat?.lockedUntil,
  };
}

function ensureShowtimeExists(showtimeId: string) {
  const found = STATIC_SHOWTIMES.find((show) => show.id === showtimeId);
  if (!found) {
    throw new Error("Showtime not found");
  }
}

export function searchMovies(query: string) {
  return simulateLatency(() => {
    const normalized = query.trim().toLowerCase();
    const isMatch =
      normalized.includes("today") ||
      normalized.includes("todays") ||
      normalized.includes("today's") ||
      normalized.includes("kgf");

    if (!isMatch) {
      return [];
    }

    return [
      {
        movie: STATIC_MOVIE,
        showtimes: STATIC_SHOWTIMES,
        theater: STATIC_THEATER,
        date: BOOKING_DATE_ISO,
      },
    ];
  });
}

export function getShowtimes(movieId: string, date: string = BOOKING_DATE_ISO) {
  return simulateLatency(() => {
    if (movieId !== STATIC_MOVIE.id) {
      throw new Error("Movie not supported in static mode");
    }

    if (date !== BOOKING_DATE_ISO) {
      throw new Error("Only today's showtimes are available");
    }

    return STATIC_SHOWTIMES;
  });
}

export function getSeatmap(showtimeId: string) {
  return simulateLatency(() => {
    ensureShowtimeExists(showtimeId);
    purgeExpiredLocks(showtimeId);
    return toSeatMapResponse(showtimeId);
  });
}

export function lockSeats(showtimeId: string, seatIds: string[]) {
  return simulateLatency(() => {
    ensureShowtimeExists(showtimeId);
    if (seatIds.length === 0) {
      throw new Error("Select at least one seat");
    }

    purgeExpiredLocks(showtimeId);
    const state = initialiseShowtimeState(showtimeId);

    seatIds.forEach((seatId) => {
      const seat = state.seats.get(seatId);
      if (!seat) {
        throw new Error(`Seat ${seatId} not found`);
      }
      if (seat.status === "booked") {
        throw new Error(`Seat ${seatId} is already booked`);
      }
      if (seat.status === "locked" && seat.lockedBy !== LOCK_OWNER) {
        throw new Error(`Seat ${seatId} is currently locked by another user`);
      }
    });

    const expiry = Date.now() + SEAT_LOCK_DURATION_MS;
    seatIds.forEach((seatId) => {
      const seat = state.seats.get(seatId)!;
      seat.status = "locked";
      seat.lockedBy = LOCK_OWNER;
      seat.lockedUntil = expiry;
    });

    return {
      seats: seatIds,
      lockedUntil: expiry,
    };
  });
}

export function quotePrice(showtimeId: string, seatIds: string[]): Promise<PriceQuote> {
  return simulateLatency(() => {
    ensureShowtimeExists(showtimeId);
    if (seatIds.length === 0) {
      throw new Error("No seats selected for pricing");
    }

    purgeExpiredLocks(showtimeId);
    const state = initialiseShowtimeState(showtimeId);

    let subtotal = 0;
    const seatPriceBreakdown: PriceQuote["seatPriceBreakdown"] = [];

    seatIds.forEach((seatId) => {
      const seat = state.seats.get(seatId);
      if (!seat) {
        throw new Error(`Seat ${seatId} not found`);
      }
      subtotal += seat.price;
      seatPriceBreakdown.push({ seatId, price: seat.price, category: seat.category });
    });

    const convenienceFee = PRICING_CONFIG.convenienceFee;
    const total = subtotal + convenienceFee;

    return {
      seatIds,
      subtotal,
      convenienceFee,
      total,
      seatPriceBreakdown,
    };
  });
}

export function createBooking(
  showtimeId: string,
  seatIds: string[],
  user: { name: string; upiId: string }
): Promise<BookingDetails> {
  return simulateLatency(() => {
    ensureShowtimeExists(showtimeId);
    if (seatIds.length === 0) {
      throw new Error("No seats selected for booking");
    }

    if (!user.upiId || !user.upiId.trim()) {
      throw new Error("UPI ID is required to complete the booking");
    }

    purgeExpiredLocks(showtimeId);
    const state = initialiseShowtimeState(showtimeId);

    seatIds.forEach((seatId) => {
      const seat = state.seats.get(seatId);
      if (!seat) {
        throw new Error(`Seat ${seatId} not found`);
      }
      if (seat.status === "booked") {
        throw new Error(`Seat ${seatId} has already been booked`);
      }
      if (seat.status !== "locked" || seat.lockedBy !== LOCK_OWNER) {
        throw new Error(`Seat ${seatId} is no longer locked`);
      }
      if (seat.lockedUntil && seat.lockedUntil < Date.now()) {
        throw new Error(`Seat ${seatId} lock expired`);
      }
    });

    seatIds.forEach((seatId) => {
      const seat = state.seats.get(seatId)!;
      seat.status = "booked";
      delete seat.lockedBy;
      delete seat.lockedUntil;
      seat.bookedAt = Date.now();
    });

    const price = seatIds.reduce((sum, seatId) => {
      const seat = state.seats.get(seatId)!;
      return sum + seat.price;
    }, 0);

    const confirmationNumber = `CNF-KGF-${bookingCounter}`;
    bookingCounter += 1;

    return {
      confirmationNumber,
      movieTitle: STATIC_MOVIE.title,
      theaterName: STATIC_THEATER.name,
      theaterCity: STATIC_THEATER.city,
      showtime: STATIC_SHOWTIMES.find((show) => show.id === showtimeId)!,
      seats: [...seatIds],
      totalAmount: price + PRICING_CONFIG.convenienceFee,
      purchaser: { ...user },
      bookedAt: Date.now(),
    };
  });
}

export type { SeatRowState, SeatState };

export function resetStaticState() {
  showtimeSeatState.clear();
  bookingCounter = 1024;
}

