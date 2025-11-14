import axios from "axios";
import { ShowtimeContext } from "../types/booking";
import { saveShowtimeContext, loadShowtimeContext, validateShowtimeContext, generateOwnerUUID } from "./bookingContext";

const BASE_URL = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";

/**
 * Retry helper for network requests
 */
async function retryRequest<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      
      // Don't retry on 4xx errors (client errors)
      if (error.response?.status && error.response.status >= 400 && error.response.status < 500) {
        throw error;
      }
      
      // If this was the last attempt, throw the error
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retrying
      console.log(`[showtimeContext] Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Fetch showtime details from API and reconstruct context with retry logic
 */
export const fetchShowtimeContext = async (
  showtimeId: number,
  movieId?: number
): Promise<ShowtimeContext | null> => {
  try {
    const response = await retryRequest(
      () => axios.get(`${BASE_URL}/api/showtimes/${showtimeId}`, {
        timeout: 10000, // 10 second timeout (this is a fast endpoint)
      }),
      1 // Retry once (2 total attempts)
    );
    const data = response.data;

    // Get user email
    const getUserEmail = (): string => {
      try {
        const userStr = localStorage.getItem("cine_user");
        if (userStr) {
          const user = JSON.parse(userStr);
          return user.email || "guest@example.com";
        }
      } catch (e) {
        console.error("Error reading user email:", e);
      }
      return "guest@example.com";
    };

    // Generate or retrieve owner UUID
    const getOwnerUUID = (): string => {
      const stored = sessionStorage.getItem("cineverse.lockOwner");
      if (stored) return stored;
      const newUUID = generateOwnerUUID();
      sessionStorage.setItem("cineverse.lockOwner", newUUID);
      return newUUID;
    };

    // Build context from API response
    const context: ShowtimeContext = {
      movie_id: data.movie_id || movieId || 0,
      showtime_id: data.id,
      theatre_id: data.theatre_id || 0,
      showtime_start: data.start_time || new Date().toISOString(),
      pricing: data.pricing || { premium: 350, regular: 250 },
      screen_name: data.screen_name,
      owner: getOwnerUUID(),
      user_email: getUserEmail(),
      movie: data.movie ? {
        title: data.movie.title || "Unknown Movie",
        poster: data.movie.poster_url,
      } : undefined,
      theatre: data.theatre?.name,
    };

    // Validate before returning
    const validation = validateShowtimeContext(context);
    if (validation.valid && validation.context) {
      saveShowtimeContext(validation.context);
      return validation.context;
    }

    console.error("Reconstructed context validation failed:", validation.errors);
    return null;
  } catch (error: any) {
    console.error("Failed to fetch showtime context:", error);
    return null;
  }
};

/**
 * Route guard: Recover and validate showtime context
 */
export const recoverShowtimeContext = async (
  showtimeIdFromRoute: number | null,
  locationState?: any
): Promise<{ context: ShowtimeContext | null; errors: string[] }> => {
  const errors: string[] = [];

  // Try 1: Location state
  if (locationState?.showtime_id) {
    const validation = validateShowtimeContext(locationState);
    if (validation.valid && validation.context) {
      if (!showtimeIdFromRoute || validation.context.showtime_id === showtimeIdFromRoute) {
        saveShowtimeContext(validation.context);
        return { context: validation.context, errors: [] };
      } else {
        errors.push("Showtime ID mismatch between route and context");
      }
    }
  }

  // Try 2: sessionStorage
  const stored = loadShowtimeContext();
  if (stored) {
    const validation = validateShowtimeContext(stored);
    if (validation.valid && validation.context) {
      if (!showtimeIdFromRoute || validation.context.showtime_id === showtimeIdFromRoute) {
        return { context: validation.context, errors: [] };
      } else {
        errors.push("Showtime ID mismatch between route and stored context");
      }
    } else {
      errors.push(...validation.errors);
    }
  }

  // Try 3: Fetch from API if we have showtimeId
  if (showtimeIdFromRoute) {
    const fetched = await fetchShowtimeContext(showtimeIdFromRoute);
    if (fetched) {
      return { context: fetched, errors: [] };
    } else {
      errors.push("Failed to fetch showtime from API");
    }
  }

  return { context: null, errors };
};

