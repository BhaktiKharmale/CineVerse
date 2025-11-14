// src/context/BookingContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from "react";
import toast from "react-hot-toast";
import showtimeService from "../services/showtimeService";

const STORAGE_KEY = "cineverse_booking_ctx";

export type BookingStatus = "idle" | "selecting" | "locked" | "checkout" | "completed";

export interface BookingState {
  movieId: string | number | null;
  showtimeId: string | number | null;
  orderId: string | null;
  bookingId: string | null;
  lockId: string | null;
  expiresAt: string | null;
  seats: Array<{ seatId: string | number; label: string; price: number }> | null;
  status: BookingStatus;
}

type BookingAction =
  | { type: "RESET" }
  | { type: "SET_MOVIE"; movieId: string | number }
  | { type: "SET_SHOWTIME"; showtimeId: string | number }
  | { type: "SET_LOCK"; lockId: string; expiresAt: string; seats: BookingState["seats"] }
  | { type: "CLEAR_LOCK" }
  | { type: "SET_ORDER"; orderId: string }
  | { type: "SET_BOOKING"; bookingId: string }
  | { type: "SET_STATUS"; status: BookingStatus }
  | { type: "HYDRATE"; payload: BookingState };

const initialState: BookingState = {
  movieId: null,
  showtimeId: null,
  orderId: null,
  bookingId: null,
  lockId: null,
  expiresAt: null,
  seats: null,
  status: "idle",
};

function reducer(state: BookingState, action: BookingAction): BookingState {
  switch (action.type) {
    case "RESET":
      return { ...initialState };
    case "SET_MOVIE":
      return { ...initialState, movieId: action.movieId, status: "selecting" };
    case "SET_SHOWTIME":
      return {
        ...state,
        showtimeId: action.showtimeId,
        status: "selecting",
        orderId: null,
        lockId: null,
        bookingId: null,
        seats: null,
        expiresAt: null,
      };
    case "SET_LOCK":
      return {
        ...state,
        lockId: action.lockId,
        expiresAt: action.expiresAt,
        seats: action.seats,
        status: "locked",
      };
    case "CLEAR_LOCK":
      return {
        ...state,
        lockId: null,
        expiresAt: null,
        seats: null,
        status: "selecting",
        orderId: null,
      };
    case "SET_ORDER":
      return { ...state, orderId: action.orderId, status: "checkout" };
    case "SET_BOOKING":
      return { ...state, bookingId: action.bookingId, status: "completed" };
    case "SET_STATUS":
      return { ...state, status: action.status };
    case "HYDRATE":
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

/** Stable owner token used for seat locks */
const getOwnerToken = (): string => {
  const key = "cineverse_owner_token";
  let owner = localStorage.getItem(key);
  if (!owner) {
    owner =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(key, owner);
  }
  return owner;
};

interface BookingContextValue extends BookingState {
  setMovie: (movieId: string | number) => void;
  setShowtime: (showtimeId: string | number) => void;
  setLock: (lockId: string, expiresAt: string, seats: BookingState["seats"]) => void;
  clearLock: (options?: { silent?: boolean }) => Promise<void>;
  setOrder: (orderId: string) => void;
  setBooking: (bookingId: string) => void;
  reset: () => void;
}

const BookingContext = createContext<BookingContextValue | undefined>(undefined);

const persistState = (state: BookingState) => {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn("[BookingContext] Persist failed", err);
  }
};

const readState = (): BookingState | null => {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as BookingState) : null;
  } catch (err) {
    console.warn("[BookingContext] Read failed", err);
    return null;
  }
};

export const BookingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  const isHydratingRef = useRef(false);

  // Hydrate from sessionStorage; if stale and we had a lock, try to unlock gracefully.
  const hydrate = useCallback(async () => {
    if (isHydratingRef.current) return;
    
    isHydratingRef.current = true;
    const stored = readState();
    if (!stored) {
      isHydratingRef.current = false;
      return;
    }

    const stillValid =
      stored.expiresAt && new Date(stored.expiresAt).getTime() > Date.now();

    if (stillValid) {
      dispatch({ type: "HYDRATE", payload: stored });
      isHydratingRef.current = false;
      return;
    }

    if (stored.lockId && stored.showtimeId) {
      try {
        const owner = getOwnerToken();
        const seatIds = (stored.seats || [])
          .map((s) => Number(s.seatId))
          .filter((n) => Number.isFinite(n));
        await showtimeService.unlockSeats(stored.showtimeId, {
          lockId: stored.lockId,
          owner,
          seatIds,
        });
      } catch (err) {
        // no noise on stale cleanup
        console.debug("[BookingContext] Stale unlock failed (ignored)", err);
      } finally {
        sessionStorage.removeItem(STORAGE_KEY);
        isHydratingRef.current = false;
      }
    } else {
      isHydratingRef.current = false;
    }
  }, []);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // FIXED: Only persist when specific state changes, not on every render
  const prevStateRef = useRef<BookingState>(state);
  useEffect(() => {
    const hasChanged = 
      prevStateRef.current.showtimeId !== state.showtimeId ||
      prevStateRef.current.lockId !== state.lockId ||
      prevStateRef.current.seats !== state.seats ||
      prevStateRef.current.expiresAt !== state.expiresAt;
    
    if (hasChanged) {
      persistState(state);
      prevStateRef.current = state;
    }
  }, [state]);

  const reset = useCallback(() => {
    dispatch({ type: "RESET" });
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const setMovie = useCallback((movieId: string | number) => {
    dispatch({ type: "SET_MOVIE", movieId });
  }, []);

  const setShowtime = useCallback((showtimeId: string | number) => {
    dispatch({ type: "SET_SHOWTIME", showtimeId });
  }, []);

  const setLock = useCallback(
    (lockId: string, expiresAt: string, seats: BookingState["seats"]) => {
      dispatch({ type: "SET_LOCK", lockId, expiresAt, seats });
    },
    []
  );

  const setOrder = useCallback((orderId: string) => {
    dispatch({ type: "SET_ORDER", orderId });
  }, []);

  const setBooking = useCallback((bookingId: string) => {
    dispatch({ type: "SET_BOOKING", bookingId });
  }, []);

  const clearLock = useCallback(
    async (options?: { silent?: boolean }) => {
      // If there is no active lock/showtime, just clear local state.
      if (!state.showtimeId || !state.lockId) {
        dispatch({ type: "CLEAR_LOCK" });
        return;
      }

      // Gather best-effort payload for flexible backend handling.
      const owner = getOwnerToken();
      const seatIds = (state.seats || [])
        .map((s) => Number(s.seatId))
        .filter((n) => Number.isFinite(n));

      try {
        await showtimeService.unlockSeats(state.showtimeId, {
          lockId: state.lockId,
          owner,
          seatIds,
        });
      } catch (err) {
        if (!options?.silent) {
          toast.error("Unable to unlock seats. They will expire automatically.");
        }
      } finally {
        dispatch({ type: "CLEAR_LOCK" });
      }
    },
    [state.showtimeId, state.lockId, state.seats]
  );

  const value = useMemo<BookingContextValue>(
    () => ({
      ...state,
      setMovie,
      setShowtime,
      setLock,
      clearLock,
      setOrder,
      setBooking,
      reset,
    }),
    [state, setMovie, setShowtime, setLock, clearLock, setOrder, setBooking, reset]
  );

  return <BookingContext.Provider value={value}>{children}</BookingContext.Provider>;
};

export const useBooking = (): BookingContextValue => {
  const ctx = useContext(BookingContext);
  if (!ctx) throw new Error("useBooking must be used within BookingProvider");
  return ctx;
};