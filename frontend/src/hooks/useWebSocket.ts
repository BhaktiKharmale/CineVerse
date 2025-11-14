import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";

export type WebSocketSeat = {
  id: string;
  number: string;
  row: string;
  isBooked: boolean;
};

export const useWebSocket = (showtimeId: string) => {
  const [seats, setSeats] = useState<WebSocketSeat[]>([]);
  const ws = useRef<WebSocket | null>(null);

  useEffect(() => {
    // Prefer explicit WS base; fall back to converting HTTP API base to ws://
    const wsBaseRaw = (import.meta.env.VITE_WS_BASE as string) || (import.meta.env.VITE_API_BASE as string) || "http://127.0.0.1:8000";
    const wsBase = wsBaseRaw.replace(/^http/, "ws").replace(/\/$/, "");
    ws.current = new WebSocket(`${wsBase}/ws/${showtimeId}`);

    ws.current.onopen = () => console.log("✅ Connected to WebSocket");
    ws.current.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setSeats(data.seats);
    };
    ws.current.onerror = () => toast.error("WebSocket connection failed.");
    ws.current.onclose = () => console.log("❌ WebSocket closed");

    return () => {
      ws.current?.close();
    };
  }, [showtimeId]);

  const bookSeat = (seatId: string) => {
    if (!ws.current || ws.current.readyState !== WebSocket.OPEN) return;
    ws.current.send(JSON.stringify({ action: "book", seatId }));
  };

  return { seats, bookSeat };
};
