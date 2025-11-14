import React, { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Movie } from "../../libs/types";
import BookTicketsSection from "./BookTicketsSection";
import "./ShowtimeModal.css";

interface ShowtimeModalProps {
  movie: Movie | null;
  isOpen: boolean;
  onClose: () => void;
}

const modalRoot = typeof document !== "undefined" ? document.body : null;

const ShowtimeModal: React.FC<ShowtimeModalProps> = ({ movie, isOpen, onClose }) => {
  const backdropRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.classList.add("modal-open");
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("modal-open");
    };
  }, [isOpen, onClose]);

  if (!modalRoot || !isOpen || !movie) {
    return null;
  }

  const handleBackdropClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.target === backdropRef.current) {
      onClose();
    }
  };

  return createPortal(
    <div
      ref={backdropRef}
      className="showtime-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Book tickets for ${movie.title}`}
      onMouseDown={handleBackdropClick}
    >
      <div className="showtime-modal-container">
        <header className="showtime-modal-header">
          <div>
            <p className="modal-eyebrow">Plan your visit</p>
            <h3 className="modal-title">Book Tickets for {movie.title}</h3>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close showtime modal"
          >
            ×
          </button>
        </header>

        <div className="showtime-modal-content">
          <BookTicketsSection movie={movie} onBeforeNavigate={onClose} />
        </div>
      </div>
    </div>,
    modalRoot,
  );
};

export default ShowtimeModal;
