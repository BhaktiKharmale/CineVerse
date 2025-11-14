// src/services/seatService.ts
import axios from "axios";
import { BookingContext } from "../types/booking";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";

export interface Seat {
  id: number;
  seat_id: number;
  row: string;
  num: number;
  number: number;
  zone: "premium" | "regular";
  status: "available" | "booked" | "locked";
  label?: string;
  booked?: boolean;
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
      status: "available" | "booked" | "locked";
    }>;
  }>;
}

export interface SeatMapResponse {
  showtime_id: number;
  sections: SeatSection[];
}

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
      console.log(`[seatService] Retry attempt ${attempt + 1}/${maxRetries} after ${delayMs}ms...`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError;
}

/**
 * Fetch seat map for a showtime with retry logic and extended timeout
 */
export async function fetchSeatMap(showtimeId: number): Promise<SeatMapResponse> {
  console.log(`[seatService] Fetching seats for showtime ${showtimeId} from ${API_BASE}/api/showtimes/${showtimeId}/seats`);
  
  return retryRequest(async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/showtimes/${showtimeId}/seats`, {
        timeout: 25000, // 25 second timeout for seat map (backend has 5s hard limit + network overhead)
      });
      
      // Check if backend returned unavailable flag
      if (response.data.seat_map_unavailable) {
        console.warn(`[seatService] ⚠ Backend returned seat_map_unavailable flag`);
        throw new Error(response.data.error || 'Seat map temporarily unavailable');
      }
      
      console.log(`[seatService] ✓ Seats loaded: ${response.data.sections?.length || 0} sections`);
      return response.data;
    } catch (error: any) {
      console.error(`[seatService] ✗ Failed to fetch seats:`, error.response?.status, error.response?.data || error.message);
      throw error;
    }
  }, 1); // Retry once (2 total attempts) with jittered delay
}

/**
 * Transform sections-based response to flat seat array for UI
 */
export function transformSeatsToFlat(sections: SeatSection[]): Seat[] {
  const seats: Seat[] = [];
  
  for (const section of sections) {
    const zone = section.name.toLowerCase() === "premium" ? "premium" : "regular";
    
    for (const rowData of section.rows) {
      for (const seatData of rowData.seats) {
        seats.push({
          id: seatData.seat_id, // Use seat_id as primary id
          seat_id: seatData.seat_id,
          row: seatData.row || rowData.row,
          num: seatData.num,
          number: seatData.num,
          zone,
          status: seatData.status,
          booked: seatData.status === "booked",
          label: `${seatData.row}${seatData.num}`,
        });
      }
    }
  }
  
  return seats;
}

/**
 * Get seat map as flat array (for backward compatibility)
 */
export async function getSeats(showtimeId: number): Promise<Seat[]> {
  const response = await fetchSeatMap(showtimeId);
  return transformSeatsToFlat(response.sections);
}

/**
 * Lock seats for a showtime
 */
export async function lockSeats(
  showtimeId: number,
  seatIds: number[],
  owner: string
): Promise<{ locked: number[]; conflicts: number[] }> {
  try {
    const response = await axios.post(
      `${API_BASE}/api/showtimes/${showtimeId}/redis-lock-seats`,
      {
        seat_ids: seatIds,
        owner,
        ttl_ms: 180000, // 3 minutes
      }
    );
    return {
      locked: response.data.locked || [],
      conflicts: response.data.conflicts || [],
    };
  } catch (error: any) {
    if (error.response?.status === 409) {
      return {
        locked: error.response.data?.locked || [],
        conflicts: error.response.data?.conflicts || [],
      };
    }
    throw error;
  }
}

/**
 * Unlock seats
 */
export async function unlockSeats(
  showtimeId: number,
  seatIds: number[],
  owner: string
): Promise<{ released: number[] }> {
  const response = await axios.post(
    `${API_BASE}/api/showtimes/${showtimeId}/redis-unlock-seats`,
    {
      seat_ids: seatIds,
      owner,
    }
  );
  return {
    released: response.data.released || [],
  };
}

