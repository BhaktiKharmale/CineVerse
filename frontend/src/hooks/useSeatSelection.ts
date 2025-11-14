import { useState } from "react";
import toast from "react-hot-toast";

export const useSeatSelection = () => {
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);

  const toggleSeat = (seatId: string) => {
    setSelectedSeats((prev) => {
      if (prev.includes(seatId)) {
        return prev.filter((id) => id !== seatId);
      } else {
        return [...prev, seatId];
      }
    });
  };

  const totalPrice = selectedSeats.length * 180;

  const clearSeats = () => {
    setSelectedSeats([]);
    toast("Seat selection cleared");
  };

  return { selectedSeats, toggleSeat, totalPrice, clearSeats };
};
