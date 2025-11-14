import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Movie } from "../libs/types";
import ShowtimeModal from "../components/showtimes/ShowtimeModal";

interface ShowtimeModalContextValue {
  openModal: (movie: Movie) => void;
  closeModal: () => void;
}

const ShowtimeModalContext = createContext<ShowtimeModalContextValue | undefined>(undefined);

interface ProviderState {
  isOpen: boolean;
  movie: Movie | null;
  renderKey: number;
}

export const ShowtimeModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<ProviderState>({ isOpen: false, movie: null, renderKey: 0 });

  const openModal = useCallback((movie: Movie) => {
    setState({ isOpen: true, movie, renderKey: Date.now() });
  }, []);

  const closeModal = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false, movie: null }));
  }, []);

  const value = useMemo(() => ({ openModal, closeModal }), [openModal, closeModal]);

  return (
    <ShowtimeModalContext.Provider value={value}>
      {children}
      <ShowtimeModal
        key={state.renderKey}
        movie={state.movie}
        isOpen={state.isOpen}
        onClose={closeModal}
      />
    </ShowtimeModalContext.Provider>
  );
};

export const useShowtimeModal = (): ShowtimeModalContextValue => {
  const context = useContext(ShowtimeModalContext);
  if (!context) {
    throw new Error("useShowtimeModal must be used within a ShowtimeModalProvider");
  }
  return context;
};
