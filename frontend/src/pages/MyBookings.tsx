// src/pages/MyBookings.tsx
import React, { useEffect, useState } from "react";
import { Movie } from "../libs/types";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";

interface Booking {
  id: number;
  movie: Movie;
  seats: number[];
  time: string;
  ticketPrice: number;
  paymentMethod: string;
}

const MyBookings: React.FC = () => {
  const [bookings, setBookings] = useState<Booking[]>([]);

  // For demo purposes, load from localStorage or initialize empty
  useEffect(() => {
    const storedBookings = localStorage.getItem("bookings");
    if (storedBookings) {
      setBookings(JSON.parse(storedBookings));
    }
  }, []);

  const cancelBooking = (id: number) => {
    if (window.confirm("Are you sure you want to cancel this booking?")) {
      const updatedBookings = bookings.filter((b) => b.id !== id);
      setBookings(updatedBookings);
      localStorage.setItem("bookings", JSON.stringify(updatedBookings));
      toast.success("Booking cancelled successfully");
    }
  };

  if (bookings.length === 0) {
    return (
      <div className="bg-black min-h-screen flex flex-col items-center justify-center text-white p-4">
        <h2 className="text-3xl font-bold text-yellow-400 mb-4">My Bookings</h2>
        <p className="mb-4">You have no bookings yet.</p>
        <Link
          to="/"
          className="bg-red-600 py-2 px-4 rounded hover:bg-red-700 transition-colors font-bold"
        >
          Book Now
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-black min-h-screen text-white p-4">
      <h2 className="text-3xl font-bold text-yellow-400 mb-6">My Bookings</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {bookings.map((booking) => {
          const totalPay = booking.seats.length * booking.ticketPrice;
          return (
            <div
              key={booking.id}
              className="bg-gray-900 border border-yellow-500 rounded-lg shadow-lg overflow-hidden"
            >
              <img
                src={booking.movie.poster}
                alt={booking.movie.title}
                className="w-full h-56 object-cover"
              />
              <div className="p-4">
                <h3 className="text-lg font-bold text-yellow-400">
                  {booking.movie.title}
                </h3>
                <p className="text-gray-300 mb-2">Time: {booking.time}</p>
                <p className="text-gray-300 mb-2">
                  Seats: {booking.seats.join(", ")}
                </p>
                <p className="text-gray-300 mb-2">
                  Ticket Price: ₹{booking.ticketPrice}
                </p>
                <p className="text-yellow-400 font-bold mb-2">Total: ₹{totalPay}</p>
                <p className="text-gray-300 mb-4">
                  Payment: {booking.paymentMethod}
                </p>
                <button
                  onClick={() => cancelBooking(booking.id)}
                  className="w-full bg-red-600 py-2 rounded hover:bg-red-700 transition-colors font-bold"
                >
                  Cancel Booking
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MyBookings;
