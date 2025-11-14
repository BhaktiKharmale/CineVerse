import { BookingContext, ShowtimeContext, ValidationResult } from "../types/booking";

const CONTEXT_KEY = "cineverse.context"; // Showtime context
const CHECKOUT_KEY = "cineverse.checkout"; // Full booking context (with seats)
const FALLBACK_KEY = "cineverse.lastSelection";

/**
 * Save showtime context to sessionStorage
 */
export const saveShowtimeContext = (context: ShowtimeContext): void => {
  try {
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(context));
  } catch (error) {
    console.error("Failed to save showtime context:", error);
  }
};

/**
 * Load showtime context from sessionStorage
 */
export const loadShowtimeContext = (): ShowtimeContext | null => {
  try {
    const stored = sessionStorage.getItem(CONTEXT_KEY);
    if (stored) {
      return JSON.parse(stored) as ShowtimeContext;
    }
  } catch (error) {
    console.error("Failed to load showtime context:", error);
  }
  return null;
};

/**
 * Save booking context (with seats) to sessionStorage
 */
export const saveBookingContext = (context: BookingContext): void => {
  try {
    sessionStorage.setItem(CHECKOUT_KEY, JSON.stringify(context));
    // Also save showtime context separately
    const { seat_ids, amount, seat_labels, ...showtimeContext } = context;
    saveShowtimeContext(showtimeContext);
    // Also save as fallback
    sessionStorage.setItem(FALLBACK_KEY, JSON.stringify(context));
  } catch (error) {
    console.error("Failed to save booking context:", error);
  }
};

/**
 * Load booking context from sessionStorage
 */
export const loadBookingContext = (): BookingContext | null => {
  try {
    const stored = sessionStorage.getItem(CHECKOUT_KEY);
    if (stored) {
      return JSON.parse(stored) as BookingContext;
    }
  } catch (error) {
    console.error("Failed to load booking context:", error);
  }
  return null;
};

/**
 * Load fallback booking context
 */
export const loadFallbackContext = (): BookingContext | null => {
  try {
    const stored = sessionStorage.getItem(FALLBACK_KEY);
    if (stored) {
      return JSON.parse(stored) as BookingContext;
    }
  } catch (error) {
    console.error("Failed to load fallback context:", error);
  }
  return null;
};

/**
 * Clear all booking contexts from storage
 */
export const clearBookingContext = (): void => {
  try {
    sessionStorage.removeItem(CONTEXT_KEY);
    sessionStorage.removeItem(CHECKOUT_KEY);
    sessionStorage.removeItem(FALLBACK_KEY);
  } catch (error) {
    console.error("Failed to clear booking context:", error);
  }
};

/**
 * Validate showtime context
 */
export const validateShowtimeContext = (
  context: any
): { valid: boolean; errors: string[]; context?: ShowtimeContext } => {
  const errors: string[] = [];

  if (!context) {
    return { valid: false, errors: ["Showtime context is missing"] };
  }

  // Validate movie_id
  if (typeof context.movie_id !== "number" || context.movie_id <= 0) {
    errors.push("movie_id must be a positive number");
  }

  // Validate showtime_id
  if (typeof context.showtime_id !== "number" || context.showtime_id <= 0) {
    errors.push("showtime_id must be a positive number");
  }

  // Validate theatre_id
  if (typeof context.theatre_id !== "number" || context.theatre_id <= 0) {
    errors.push("theatre_id must be a positive number");
  }

  // Validate showtime_start
  if (typeof context.showtime_start !== "string" || context.showtime_start.trim().length === 0) {
    errors.push("showtime_start must be a non-empty string (ISO format)");
  }

  // Validate pricing
  if (!context.pricing || typeof context.pricing !== "object") {
    errors.push("pricing must be an object");
  } else {
    const pricing = context.pricing as Record<string, number>;
    for (const [key, value] of Object.entries(pricing)) {
      if (typeof value !== "number" || value <= 0) {
        errors.push(`pricing.${key} must be a positive number`);
      }
    }
  }

  // Validate owner
  if (typeof context.owner !== "string" || context.owner.trim().length < 8) {
    errors.push("owner must be a non-empty string (UUID)");
  }

  return {
    valid: errors.length === 0,
    errors,
    context: errors.length === 0 ? (context as ShowtimeContext) : undefined,
  };
};

/**
 * Validate booking context
 */
export const validateBookingContext = (
  context: any
): ValidationResult => {
  const errors: string[] = [];

  if (!context) {
    return { valid: false, errors: ["Booking context is missing"] };
  }

  // Validate movie_id (from ShowtimeContext)
  if (typeof context.movie_id !== "number" || context.movie_id <= 0) {
    errors.push("movie_id must be a positive number");
  }

  // Validate showtime_id
  if (typeof context.showtime_id !== "number" || context.showtime_id <= 0) {
    errors.push("showtime_id must be a positive number");
  }

  // Validate theatre_id (from ShowtimeContext)
  if (typeof context.theatre_id !== "number" || context.theatre_id <= 0) {
    errors.push("theatre_id must be a positive number");
  }

  // Validate seat_ids
  if (!Array.isArray(context.seat_ids) || context.seat_ids.length === 0) {
    errors.push("seat_ids must be a non-empty array");
  } else if (!context.seat_ids.every((id: any) => typeof id === "number" && id > 0)) {
    errors.push("seat_ids must contain only positive numbers");
  }

  // Validate amount
  if (typeof context.amount !== "number" || context.amount <= 0) {
    errors.push("amount must be a positive number");
  }

  // Validate owner
  if (typeof context.owner !== "string" || context.owner.trim().length === 0) {
    errors.push("owner must be a non-empty string (UUID)");
  }

  // Validate user_email (optional but should be valid if present)
  if (context.user_email !== undefined && context.user_email !== null) {
    if (typeof context.user_email !== "string" || context.user_email.trim().length === 0) {
      errors.push("user_email must be a non-empty string");
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(context.user_email)) {
      errors.push("user_email must be a valid email address");
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    context: errors.length === 0 ? (context as BookingContext) : undefined,
  };
};

/**
 * Generate a UUID v4 for seat lock owner
 */
export const generateOwnerUUID = (): string => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

