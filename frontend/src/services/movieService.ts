import axiosClient from "../api/axiosClient";
import type { AxiosError } from "axios";

type HttpError = AxiosError | { response?: { status?: number } };

export interface MovieSummary {
  id: number | string;
  title: string;
  poster_url?: string | null;
  genre?: string;
  language?: string;
  duration?: number;
  rating?: number;
  synopsis?: string;
  description?: string;
}

// Backend API response shape
export interface ShowtimeTime {
  showtime_id: number;
  start_time: string;
  price?: number;
  available_seats: number;
  capacity: number;
  status: string;
  language?: string;
  format?: string;
}

export interface ShowtimeTheatre {
  theatre_id: number;
  theatre_name: string;
  location?: string;
  times: ShowtimeTime[];
}

export interface ShowtimesResponse {
  movie_id: number;
  date?: string;
  theatres: ShowtimeTheatre[];
}

// Legacy interface for compatibility
export interface ShowtimeSummary {
  id: number | string;
  start_time: string;
  auditorium?: string;
  screen?: string;
  theatre?: string;
  cinema?: string;
  cinema_id?: number;
  cinema_name?: string;
  cinema_location?: string;
  address?: string;
  price?: number;
  pricing?: Record<string, number>;
  available_seats?: number;
  total_seats?: number;
  capacity?: number;
  status?: string;
  language?: string;
  format?: string;
}

const api = axiosClient;

const fetchWithFallback = async <T>(primary: () => Promise<T>, fallback: () => Promise<T>): Promise<T> => {
  try {
    const result = await primary();
    if (Array.isArray(result) && result.length === 0) {
      console.warn('⚠️ Primary returned empty array, trying fallback');
      return fallback();
    }
    return result;
  } catch (error) {
    const httpError = error as AxiosError;
    const status = httpError?.response?.status;
    const url = httpError?.config?.url;
    const method = httpError?.config?.method?.toUpperCase();
    
    console.error('❌ Primary request failed:', {
      url: url || 'unknown',
      method: method || 'GET',
      status: status || 'network error',
      message: httpError?.message || 'Unknown error',
      responseData: httpError?.response?.data,
      requestHeaders: httpError?.config?.headers,
      responseHeaders: httpError?.response?.headers,
    });
    
    if (status === 401 || status === 403 || status === 404) {
      console.log('🔄 Attempting fallback due to status:', status);
      try {
        return await fallback();
      } catch (fallbackError) {
        const fbError = fallbackError as AxiosError;
        console.error('❌ Fallback also failed:', {
          url: fbError?.config?.url,
          status: fbError?.response?.status,
          message: fbError?.message,
        });
        throw fallbackError;
      }
    }
    throw error;
  }
};

export const movieService = {
  async getMovies(): Promise<MovieSummary[]> {
    return fetchWithFallback(
      async () => {
        const { data } = await api.get<MovieSummary[]>("/user/movies");
        return data ?? [];
      },
      async () => {
        const { data } = await api.get<MovieSummary[]>("/movies");
        return data ?? [];
      },
    );
  },

  async getMovie(movieId: string | number): Promise<MovieSummary> {
    return fetchWithFallback(
      async () => {
        const { data } = await api.get<MovieSummary>(`/user/movies/${movieId}`);
        return data;
      },
      async () => {
        const { data } = await api.get<MovieSummary>(`/movies/${movieId}`);
        return data;
      },
    );
  },

  // New method using real backend API shape
  async getShowtimesGrouped(movieId: string | number, params?: Record<string, unknown>): Promise<ShowtimesResponse> {
    const config = params ? { params } : undefined;
    
    // 🔍 STEP 1: Network debugging - Log exact URL construction
    console.group('🌐 [SHOWTIMES REQUEST] Detailed Network Debug');
    console.log('📍 Movie ID:', movieId);
    console.log('📍 Query Params:', params);
    console.log('📍 Base URL:', import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8001');
    console.log('📍 Full URL (user):', `${import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8001'}/api/user/movies/${movieId}/showtimes?${new URLSearchParams(params as any).toString()}`);
    console.log('📍 Full URL (public fallback):', `${import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8001'}/api/movies/${movieId}/showtimes?${new URLSearchParams(params as any).toString()}`);
    console.groupEnd();
    
    return fetchWithFallback(
      async () => {
        console.log('🔹 Attempting USER scope: /user/movies/${movieId}/showtimes');
        const { data, status, headers } = await api.get<ShowtimesResponse>(`/user/movies/${movieId}/showtimes`, config);
        console.log('✅ USER scope SUCCESS - Status:', status, 'Headers:', headers);
        console.log('📦 Response data:', data);
        return data;
      },
      async () => {
        console.log('🔹 Fallback to PUBLIC scope: /movies/${movieId}/showtimes');
        const { data, status, headers } = await api.get<ShowtimesResponse>(`/movies/${movieId}/showtimes`, config);
        console.log('✅ PUBLIC scope SUCCESS - Status:', status, 'Headers:', headers);
        console.log('📦 Response data:', data);
        return data;
      },
    );
  },

  // Legacy method for compatibility
  async getShowtimes(movieId: string | number, params?: Record<string, unknown>): Promise<ShowtimeSummary[]> {
    const config = params ? { params } : undefined;
    return fetchWithFallback(
      async () => {
        const { data } = await api.get<ShowtimeSummary[]>(`/user/movies/${movieId}/showtimes`, config);
        return data ?? [];
      },
      async () => {
        const { data } = await api.get<ShowtimeSummary[]>(`/movies/${movieId}/showtimes`, config);
        return data ?? [];
      },
    );
  },
};

/**
 * Filter showtimes response to show only available ones
 * Rules: available_seats > 0 AND start_time is in the future AND status != SOLD_OUT
 */
export function filterAvailableShowtimesGrouped(response: ShowtimesResponse): ShowtimesResponse {
  const now = Date.now();
  
  const filteredTheatres = response.theatres
    .map((theatre) => {
      const filteredTimes = theatre.times.filter((time) => {
        // Check if start time is in the future
        const startTime = new Date(time.start_time).getTime();
        if (startTime <= now) {
          return false;
        }

        // Check status
        const status = time.status?.toLowerCase();
        if (status === "sold_out" || status === "lapsed" || status === "inactive") {
          return false;
        }

        // Check available seats
        if (time.available_seats <= 0) {
          return false;
        }

        return true;
      });

      return {
        ...theatre,
        times: filteredTimes,
      };
    })
    // Remove theatres with no available times
    .filter((theatre) => theatre.times.length > 0);

  return {
    ...response,
    theatres: filteredTheatres,
  };
}

/**
 * Filter showtimes to show only available ones (legacy)
 * Rules: available_seats > 0 AND start_time is in the future AND status != SOLD_OUT
 */
export function filterAvailableShowtimes(showtimes: ShowtimeSummary[]): ShowtimeSummary[] {
  const now = Date.now();
  return showtimes.filter((showtime) => {
    // Check if start time is in the future
    const startTime = new Date(showtime.start_time).getTime();
    if (startTime <= now) {
      return false;
    }

    // Check status
    const status = showtime.status?.toLowerCase();
    if (status === "sold_out" || status === "sold-out" || status === "lapsed" || status === "inactive") {
      return false;
    }

    // Check available seats
    const availableSeats = showtime.available_seats ?? showtime.capacity;
    if (availableSeats !== undefined && availableSeats <= 0) {
      return false;
    }

    return true;
  });
}

export default movieService;

