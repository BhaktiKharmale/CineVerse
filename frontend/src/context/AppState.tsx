// src/context/AppState.tsx
import React, { createContext, useContext, useReducer, ReactNode } from "react";
import { Movie } from "../libs/types";

// ------------------------------
// TYPES
// ------------------------------
export interface Booking {
  movie?: Movie;          // Selected movie
  seats?: string[];       // Selected seats
  totalPrice?: number;    // Computed total
  date?: string;          // Show date
  time?: string;          // Show time
  location?: string;      // Location/theater
  pricePerSeat?: number;  // Price per seat
}

interface State {
  selectedMovie?: Movie;  // Optional for easier null-safety
  booking: Booking;       // Always defined
}

type Action =
  | { type: "SET_SELECTED_MOVIE"; payload: Movie | null }
  | { type: "SET_BOOKING"; payload: Partial<Booking> }
  | { type: "RESET_BOOKING" };

// ------------------------------
// INITIAL STATE
// ------------------------------
const initialState: State = {
  selectedMovie: undefined,
  booking: {},
};

// ------------------------------
// REDUCER
// ------------------------------
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_SELECTED_MOVIE":
      return { ...state, selectedMovie: action.payload ?? undefined };

    case "SET_BOOKING": {
      // Merge partial updates safely
      const mergedBooking: Booking = {
        ...state.booking,
        ...action.payload,
      };

      // Compute total price automatically if possible
      if (mergedBooking.pricePerSeat && mergedBooking.seats) {
        mergedBooking.totalPrice =
          mergedBooking.pricePerSeat * mergedBooking.seats.length;
      }

      return { ...state, booking: mergedBooking };
    }

    case "RESET_BOOKING":
      return { ...state, booking: {}, selectedMovie: undefined };

    default:
      return state;
  }
}

// ------------------------------
// CONTEXT
// ------------------------------
const AppContext = createContext<{
  state: State;
  dispatch: React.Dispatch<Action>;
}>({
  state: initialState,
  dispatch: () => null,
});

// ------------------------------
// PROVIDER
// ------------------------------
export const AppStateProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(reducer, initialState);
  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

// ------------------------------
// HOOK
// ------------------------------
export const useAppState = () => {
  const context = useContext(AppContext);
  if (!context)
    throw new Error("useAppState must be used within AppStateProvider");
  return context;
};
