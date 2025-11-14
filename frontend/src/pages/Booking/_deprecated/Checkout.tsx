/**
 * @deprecated Legacy checkout flow. Use Booking/SeatSelection + PaymentSummary instead.
 */
import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import "../../../styles/Checkout.css";
import { BookingContext } from "../../../types/booking";
import { saveBookingContext, generateOwnerUUID } from "../../../utils/bookingContext";

const Checkout: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { movie, selectedShow, selectedDate, selectedSeats, showtime_id } = location.state || {};
  
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

  if (!movie || !selectedShow || !selectedSeats) {
    return (
      <div className="checkout-page">
        <h2 className="title">No Booking Found</h2>
        <p className="message">Please select seats first.</p>
        <button className="back-btn" onClick={() => navigate("/")}>
          Back to Home
        </button>
      </div>
    );
  }

  // Determine total price based on seat types
  const premiumRows = ["A", "B", "C", "D"];
  const getPrice = (seatId: string) =>
    premiumRows.includes(seatId.charAt(0)) ? 250 : 180;

  const totalPrice = selectedSeats.reduce(
    (sum: number, seat: string) => sum + getPrice(seat),
    0
  );

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        {/* Movie Header */}
        <div className="movie-summary">
          <img
            src={movie?.poster || "/logo.jpg"}
            alt={movie?.title || "Movie Poster"}
            className="poster"
          />
          <div className="movie-details">
            <h2 className="movie-title">{movie?.title || "Untitled Movie"}</h2>
            <p className="movie-meta">
              {selectedShow.theatre} • {selectedShow.time} • {selectedDate}
            </p>
          </div>
        </div>

        {/* Booking Summary */}
        <div className="booking-summary">
          <h3 className="section-title">Your Booking</h3>
          <div className="summary-grid">
            <div className="summary-row">
              <span>Seats Selected:</span>
              <span className="highlight">{selectedSeats.join(", ")}</span>
            </div>
            <div className="summary-row">
              <span>Ticket Price:</span>
              <span>₹{getPrice(selectedSeats[0])}</span>
            </div>
            <div className="summary-row total">
              <span>Total Amount:</span>
              <span className="highlight">₹{totalPrice}</span>
            </div>
          </div>
        </div>

        {/* Payment Button */}
        <div className="payment-action">
          <button
            className="proceed-btn"
            onClick={() => {
              // Validate required data
              if (!selectedShow || !showtime_id) {
                alert("Showtime information is missing. Please select a showtime first.");
                return;
              }
              
              // Convert seat strings to numeric IDs
              const seatIds = selectedSeats.map((seat: string) => {
                const row = seat.charAt(0);
                const num = parseInt(seat.slice(1));
                const rowNum = row.charCodeAt(0) - 64;
                return rowNum * 100 + num;
              });
              
              // Create booking context with all required fields
              const bookingContext: BookingContext = {
                movie_id: movie?.id || 0,
                showtime_id: showtime_id || selectedShow.id || 0,
                theatre_id: 0, // Will be fetched from API if available
                showtime_start: new Date().toISOString(),
                pricing: {
                  premium: 350,
                  regular: 250,
                },
                owner: getOwnerUUID(),
                user_email: getUserEmail(),
                seat_ids: seatIds,
                amount: totalPrice,
                movie: movie ? {
                  title: movie.title || "Unknown Movie",
                  poster: movie.poster,
                } : undefined,
                theatre: selectedShow.theatre,
              };
              
              // Save to sessionStorage
              saveBookingContext(bookingContext);
              
              // Navigate to payment
              navigate("/payment-summary", { state: bookingContext });
            }}
          >
            Proceed to Payment
          </button>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
