/**
 * Showtime Context - Required data for seat selection
 * Stored in sessionStorage['cineverse.context']
 */
export interface ShowtimeContext {
  movie_id: number;
  showtime_id: number;
  theatre_id: number;
  showtime_start: string; // ISO format
  pricing: Record<string, number>; // e.g., { "premium": 350, "regular": 250 }
  screen_name?: string;
  owner: string; // UUID for Redis locks
  user_email?: string;
  // Optional metadata for display
  movie?: {
    title: string;
    poster?: string;
  };
  theatre?: string;
}

/**
 * Booking Context - Complete data for payment flow
 * Stored in sessionStorage['cineverse.checkout']
 * Extends ShowtimeContext with seat selection
 */
export interface BookingContext extends ShowtimeContext {
  seat_ids: number[]; // Non-empty array
  amount: number; // In INR (rupees) - calculated from seat_ids and pricing
  seat_labels?: string[];
}

/**
 * Validation result for booking context
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  context?: BookingContext;
}

