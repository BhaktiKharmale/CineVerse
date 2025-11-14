// src/components/chat/ChatPanel.tsx
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { X, Send, Loader2 } from "lucide-react";
import { createMessageId } from "../../utils/messageId";
import AgentCostMeter from "./AgentCostMeter";
import SeatMap from "../seating/SeatMap";
import PriceSummary from "../payment/PriceSummary";
import TicketPreview from "../payment/TicketPreview";
import {
  searchMovies,
  getShowtimes,
  getSeatmap,
  lockSeats,
  quotePrice,
  createBooking,
  resetStaticState,
  SeatMapResponse,
  PriceQuote,
  BookingDetails,
} from "../../services/staticAgentTools";
import {
  STATIC_MOVIE,
  STATIC_THEATER,
  STATIC_SHOWTIMES,
  BOOKING_DATE_LABEL,
} from "../../constants/staticBookingData";

type AgentState =
  | "IDLE"
  | "SHOW_MOVIES"
  | "SHOW_SEATMAP"
  | "QUOTE_PRICE"
  | "COLLECT_DETAILS"
  | "CONFIRM_BOOKING"
  | "BOOKED";

type ChatRole = "user" | "assistant" | "system";

interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: number;
}

interface ChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SUGGESTED_PROMPTS = ["Today's movies", "Today showtimes", "Reset booking"];

const FLOW_TRIGGER_PATTERNS = ["today", "todays", "today's", "kgf"];

const USER_TEMPLATE = { name: "", upiId: "" };

export default function ChatPanel({ isOpen, onClose }: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [agentState, setAgentState] = useState<AgentState>("IDLE");
  const [inFlightAction, setInFlightAction] = useState<string | null>(null);
  const [seatMap, setSeatMap] = useState<SeatMapResponse | null>(null);
  const [selectedShowtimeId, setSelectedShowtimeId] = useState<string | null>(null);
  const [selectedSeats, setSelectedSeats] = useState<string[]>([]);
  const [lockInfo, setLockInfo] = useState<{ seats: string[]; lockedUntil: number } | null>(null);
  const [priceQuote, setPriceQuote] = useState<PriceQuote | null>(null);
  const [userDetails, setUserDetails] = useState(USER_TEMPLATE);
  const [userErrors, setUserErrors] = useState<{ name?: string; upiId?: string }>({});
  const [bookingDetails, setBookingDetails] = useState<BookingDetails | null>(null);
  const [showTicketPreview, setShowTicketPreview] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [agentCost, setAgentCost] = useState({ steps: 0, tokens: 0 });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryLabel, setRetryLabel] = useState<string | null>(null);
  const [seatmapRefreshKey, setSeatmapRefreshKey] = useState<string>(createMessageId());

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const flowIdRef = useRef<string | null>(null);
  const seatHoldTimerRef = useRef<NodeJS.Timeout | null>(null);
  const retryActionRef = useRef<(() => void) | null>(null);
  const messageIdsRef = useRef<Set<string>>(new Set());

  const isActionInFlight = inFlightAction !== null;

  const selectedSeatSet = useMemo(() => new Set(selectedSeats), [selectedSeats]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, agentState, toastMessage]);

  useEffect(() => {
    if (!lockInfo?.lockedUntil) {
      return;
    }

    if (seatHoldTimerRef.current) {
      clearTimeout(seatHoldTimerRef.current);
    }

    const remaining = lockInfo.lockedUntil - Date.now();
    if (remaining <= 0) {
      handleSeatHoldExpired();
      return;
    }

    seatHoldTimerRef.current = setTimeout(() => {
      handleSeatHoldExpired();
    }, remaining);

    return () => {
      if (seatHoldTimerRef.current) {
        clearTimeout(seatHoldTimerRef.current);
      }
    };
  }, [lockInfo?.lockedUntil]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose]);

  const addMessage = useCallback((role: ChatRole, content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return;

    const messageId = createMessageId();
    if (messageIdsRef.current.has(messageId)) {
      return;
    }
    messageIdsRef.current.add(messageId);

    const message: ChatMessage = {
      id: messageId,
      role,
      content: trimmed,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, message]);
    setAgentCost((prev) => ({
      steps: prev.steps,
      tokens: prev.tokens + (role === "assistant" ? 8 : 5),
    }));
  }, []);

  const transitionTo = useCallback((next: AgentState) => {
    setAgentState((prev) => {
      if (prev !== next) {
        console.log(`[AgentFlow] state ${prev} -> ${next}`);
      }
      return next;
    });
  }, []);

  const bumpToolCost = useCallback((toolName: string) => {
    console.log(`[AgentFlow][Tool] ${toolName}`);
    setAgentCost((prev) => ({ ...prev, steps: prev.steps + 1 }));
  }, []);

  const resetAgentFlowState = useCallback(() => {
    setSelectedShowtimeId(null);
    setSeatMap(null);
    setSelectedSeats([]);
    setLockInfo(null);
    setPriceQuote(null);
    setUserDetails(USER_TEMPLATE);
    setUserErrors({});
    setBookingDetails(null);
    setErrorMessage(null);
    retryActionRef.current = null;
    setRetryLabel(null);
    if (seatHoldTimerRef.current) {
      clearTimeout(seatHoldTimerRef.current);
      seatHoldTimerRef.current = null;
    }
  }, []);

  const handleSeatHoldExpired = useCallback(async () => {
    if (!selectedShowtimeId) {
      return;
    }
    setToastMessage("Seat hold expired. Refreshing availability…");
    setSelectedSeats([]);
    setLockInfo(null);
    setPriceQuote(null);
    setUserDetails(USER_TEMPLATE);
    setUserErrors({});
    try {
      bumpToolCost("getSeatmap");
      const updatedSeatmap = await getSeatmap(selectedShowtimeId);
      setSeatMap(updatedSeatmap);
      setSeatmapRefreshKey(createMessageId());
      transitionTo("SHOW_SEATMAP");
    } catch (error) {
      console.error("[AgentFlow] Seatmap refresh failed", error);
      setErrorMessage("Failed to refresh seats. Please try selecting the showtime again.");
    } finally {
      setTimeout(() => setToastMessage(null), 3000);
    }
  }, [selectedShowtimeId, bumpToolCost, transitionTo]);

  const handleFlowReset = useCallback(() => {
    console.log("[AgentFlow] Reset triggered by user");
    setAgentCost({ steps: 0, tokens: 0 });
    resetStaticState();
    resetAgentFlowState();
    flowIdRef.current = null;
    transitionTo("IDLE");
    addMessage("assistant", "Booking flow reset. Ask for today's movies to begin again.");
  }, [resetAgentFlowState, transitionTo, addMessage]);

  const startTodayFlow = useCallback(
    async (query: string) => {
      const flowId = createMessageId();
      flowIdRef.current = flowId;
      resetAgentFlowState();
      setAgentCost({ steps: 0, tokens: 0 });
      transitionTo("SHOW_MOVIES");
      setInFlightAction("searchMovies");
      setErrorMessage(null);
      setRetryLabel(null);
      retryActionRef.current = null;

      try {
        bumpToolCost("searchMovies");
        const results = await searchMovies(query);
        if (flowIdRef.current !== flowId) {
          return;
        }

        if (!results.length) {
          addMessage("assistant", "I could not find movies for today. Try asking again shortly.");
          transitionTo("IDLE");
          return;
        }

        addMessage(
          "assistant",
          `Today's movies in your area:\n• ${STATIC_MOVIE.title} (${STATIC_MOVIE.languages.join(", ")})\nTap a showtime below to continue.`
        );
        setSeatMap(null);
        setSeatmapRefreshKey(createMessageId());
      } catch (error: any) {
        console.error("[AgentFlow] searchMovies failed", error);
        setErrorMessage(error?.message || "Unable to fetch today's movies.");
        setRetryLabel("Retry search");
        retryActionRef.current = () => startTodayFlow(query);
        transitionTo("IDLE");
      } finally {
        setInFlightAction(null);
      }
    },
    [addMessage, bumpToolCost, resetAgentFlowState, transitionTo]
  );

  const handleSelectShowtime = useCallback(
    async (showtimeId: string) => {
      if (isActionInFlight) return;
      setSelectedShowtimeId(showtimeId);
      setSelectedSeats([]);
      setInFlightAction("loadSeatmap");
      setErrorMessage(null);
      setRetryLabel(null);
      retryActionRef.current = null;
      transitionTo("SHOW_SEATMAP");

      try {
        bumpToolCost("getSeatmap");
        const seatmapResponse = await getSeatmap(showtimeId);
        setSeatMap(seatmapResponse);
        setSeatmapRefreshKey(createMessageId());
        addMessage(
          "assistant",
          `Here is the seat map for ${STATIC_MOVIE.title} (${showtimeId.split("-").pop()}) at ${STATIC_THEATER.name}.`
        );
      } catch (error: any) {
        console.error("[AgentFlow] getSeatmap failed", error);
        setErrorMessage(error?.message || "Unable to load seat map.");
        setRetryLabel("Retry seat map");
        retryActionRef.current = () => handleSelectShowtime(showtimeId);
      } finally {
        setInFlightAction(null);
      }
    },
    [isActionInFlight, addMessage, bumpToolCost, transitionTo]
  );

  const toggleSeat = useCallback(
    (seatId: string) => {
      setSelectedSeats((prev) => {
        if (prev.includes(seatId)) {
          return prev.filter((id) => id !== seatId);
        }
        return [...prev, seatId];
      });
    },
    []
  );

  const handleConfirmSeats = useCallback(async () => {
    if (!selectedShowtimeId || selectedSeats.length === 0 || isActionInFlight) {
      return;
    }

    setInFlightAction("lockSeats");
    setErrorMessage(null);
    setRetryLabel(null);
    retryActionRef.current = null;

    try {
      bumpToolCost("lockSeats");
      const lockResponse = await lockSeats(selectedShowtimeId, selectedSeats);
      setLockInfo(lockResponse);
      bumpToolCost("quotePrice");
      const quote = await quotePrice(selectedShowtimeId, selectedSeats);
      setPriceQuote(quote);
      transitionTo("QUOTE_PRICE");
      addMessage(
        "assistant",
        `Great choice! I locked ${selectedSeats.length} seat${selectedSeats.length > 1 ? "s" : ""}. Here is the price summary.`
      );
    } catch (error: any) {
      console.error("[AgentFlow] lockSeats/quotePrice failed", error);
      setErrorMessage(error?.message || "Unable to lock seats. Try a different set.");
      setRetryLabel("Retry seat lock");
      retryActionRef.current = handleConfirmSeats;
    } finally {
      setInFlightAction(null);
    }
  }, [selectedShowtimeId, selectedSeats, isActionInFlight, addMessage, bumpToolCost, transitionTo]);

  const handleProceedToDetails = useCallback(() => {
    transitionTo("COLLECT_DETAILS");
    addMessage("assistant", "Almost done! Please share the name and UPI ID for the booking.");
  }, [transitionTo, addMessage]);

  const handleModifySeats = useCallback(async () => {
    if (!selectedShowtimeId || isActionInFlight) {
      return;
    }
    setInFlightAction("loadSeatmap");
    setErrorMessage(null);
    setRetryLabel(null);
    retryActionRef.current = null;
    try {
      bumpToolCost("getSeatmap");
      const seatmapResponse = await getSeatmap(selectedShowtimeId);
      setSeatMap(seatmapResponse);
      setSeatmapRefreshKey(createMessageId());
      transitionTo("SHOW_SEATMAP");
    } catch (error: any) {
      console.error("[AgentFlow] Seatmap refresh failed", error);
      setErrorMessage(error?.message || "Unable to refresh seats. Try again.");
      setRetryLabel("Retry seat map");
      retryActionRef.current = () => handleModifySeats();
    } finally {
      setInFlightAction(null);
    }
  }, [selectedShowtimeId, isActionInFlight, bumpToolCost, transitionTo]);

  const validateUserDetails = useCallback(() => {
    const errors: { name?: string; upiId?: string } = {};
    if (!userDetails.name.trim()) {
      errors.name = "Name is required";
    }
    if (!userDetails.upiId.trim()) {
      errors.upiId = "UPI ID is required";
    }
    setUserErrors(errors);
    return Object.keys(errors).length === 0;
  }, [userDetails]);

  const handleSubmitDetails = useCallback(async () => {
    if (!selectedShowtimeId || !lockInfo || !priceQuote || isActionInFlight) {
      return;
    }

    if (!validateUserDetails()) {
      return;
    }

    transitionTo("CONFIRM_BOOKING");
    setInFlightAction("createBooking");
    setErrorMessage(null);
    setRetryLabel(null);
    retryActionRef.current = null;

    try {
      bumpToolCost("createBooking");
      const booking = await createBooking(selectedShowtimeId, lockInfo.seats, userDetails);
      setBookingDetails(booking);
      transitionTo("BOOKED");
      addMessage(
        "assistant",
        `Booking confirmed! Your confirmation number is ${booking.confirmationNumber}. Tap "View Ticket" to see the details.`
      );
      setShowTicketPreview(true);
    } catch (error: any) {
      console.error("[AgentFlow] createBooking failed", error);
      setErrorMessage(error?.message || "Booking failed. Please retry.");
      setRetryLabel("Retry booking");
      retryActionRef.current = handleSubmitDetails;
      transitionTo("QUOTE_PRICE");
    } finally {
      setInFlightAction(null);
    }
  }, [selectedShowtimeId, lockInfo, priceQuote, userDetails, validateUserDetails, isActionInFlight, addMessage, bumpToolCost, transitionTo]);

  const handleSend = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      console.warn("[ChatPanel] Ignoring send - empty message");
      return;
    }
    if (isActionInFlight) {
      console.warn("[ChatPanel] Ignoring send - action in flight");
      return;
    }

    addMessage("user", trimmed);
    setInputValue("");

    const normalized = trimmed.toLowerCase();
    if (normalized.includes("reset")) {
      handleFlowReset();
      return;
    }

    const shouldTriggerFlow = FLOW_TRIGGER_PATTERNS.some((token) => normalized.includes(token));
    if (shouldTriggerFlow) {
      startTodayFlow(trimmed);
    } else {
      addMessage("assistant", "I'm focused on helping with today's booking. Try asking for today's movies.");
    }
  }, [inputValue, isActionInFlight, addMessage, handleFlowReset, startTodayFlow]);

  const handleSuggestedPrompt = useCallback(
    (prompt: string) => {
      if (isActionInFlight) return;
      setInputValue(prompt);
      requestAnimationFrame(() => {
        setInputValue("");
        addMessage("user", prompt);
        if (prompt.toLowerCase().includes("reset")) {
          handleFlowReset();
        } else {
          startTodayFlow(prompt);
        }
      });
    },
    [isActionInFlight, addMessage, handleFlowReset, startTodayFlow]
  );

  const handleRetryAction = useCallback(() => {
    if (retryActionRef.current) {
      retryActionRef.current();
    }
  }, []);

  const currentShowtime = useMemo(() => {
    if (!selectedShowtimeId) return null;
    return STATIC_SHOWTIMES.find((show) => show.id === selectedShowtimeId) || null;
  }, [selectedShowtimeId]);

  const isSendDisabled = isActionInFlight || !inputValue.trim();

  if (!isOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed bottom-24 right-6 z-[9999] flex h-[620px] max-h-[calc(100vh-6rem)] w-[420px] max-w-[calc(100vw-3rem)] flex-col rounded-lg border border-[#333] bg-[#1a1a1a] shadow-2xl"
      role="dialog"
      aria-label="CineVerse Assistant Chat"
      aria-modal="true"
    >
      <div className="flex items-center justify-between rounded-t-lg border-b border-[#333] bg-[#222] p-4">
        <div>
          <h2 className="text-lg font-semibold text-white">CineVerse Assistant</h2>
          <AgentCostMeter steps={agentCost.steps} tokens={agentCost.tokens} />
        </div>
        <button onClick={onClose} className="text-gray-400 transition-colors hover:text-white" aria-label="Close chat">
          <X size={20} />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3 py-8 text-center text-gray-400">
            <p className="text-sm">Ask me for today's movies to start booking tickets instantly.</p>
            <button
              type="button"
              onClick={() => handleSuggestedPrompt("Today's movies")}
              className="rounded-lg bg-[#FF7A00] px-4 py-2 text-sm text-white hover:bg-[#e66a00]"
            >
              Today's movies
            </button>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-4 py-2 text-sm ${
                msg.role === "user" ? "bg-[#FF7A00] text-white" : "bg-[#2a2a2a] text-gray-100"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}

        {agentState === "SHOW_MOVIES" && (
          <div className="space-y-3 rounded-lg border border-[#333] bg-[#111] p-4 text-sm text-gray-300">
            <div className="flex gap-3">
              <img
                src={STATIC_MOVIE.posterUrl}
                alt={STATIC_MOVIE.title}
                className="h-24 w-16 rounded-lg border border-[#444] object-cover"
              />
              <div className="space-y-1">
                <h3 className="text-lg font-semibold text-white">{STATIC_MOVIE.title}</h3>
                <p className="text-xs uppercase tracking-widest text-gray-500">{STATIC_THEATER.city}</p>
                <p className="text-xs text-gray-400">{STATIC_MOVIE.languages.join(" • ")}</p>
                <p className="text-xs text-gray-500">
                  Duration: {STATIC_MOVIE.durationMinutes} mins • {STATIC_MOVIE.certification}
                </p>
                <p className="mt-2 text-xs text-gray-400">
                  Rocky rises from the streets to control the underworld empire of Kolar Gold Fields.
                </p>
              </div>
            </div>
            <div>
              <p className="mb-2 text-xs text-gray-500">Pick a showtime for {BOOKING_DATE_LABEL}</p>
              <div className="flex flex-wrap gap-2">
                {STATIC_SHOWTIMES.map((show) => (
                  <button
                    key={`showtime-${show.id}`}
                    type="button"
                    onClick={() => handleSelectShowtime(show.id)}
                    disabled={isActionInFlight}
                    className={`rounded-lg border px-3 py-2 text-sm transition ${
                      selectedShowtimeId === show.id
                        ? "border-[#FF7A00] bg-[#FF7A00] text-white"
                        : "border-[#333] bg-[#1f1f1f] text-gray-200 hover:bg-[#292929]"
                    } ${isActionInFlight ? "cursor-not-allowed opacity-60" : ""}`}
                  >
                    {show.startTime} • {show.screen}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {agentState === "SHOW_SEATMAP" && seatMap && (
          <div className="space-y-4">
            <SeatMap
              rows={seatMap.rows}
              selectedSeatIds={selectedSeatSet}
              onToggleSeat={(seat) => toggleSeat(seat.id)}
              lockedUntil={lockInfo?.lockedUntil}
              lastUpdatedKey={seatmapRefreshKey}
            />
            <div className="flex items-center justify-between text-sm text-gray-300">
              <div>
                <p className="font-semibold text-white">Selected seats</p>
                <p className="text-xs text-gray-400">
                  {selectedSeats.length > 0 ? selectedSeats.join(", ") : "Tap seats to select"}
                </p>
              </div>
              <button
                type="button"
                onClick={handleConfirmSeats}
                disabled={selectedSeats.length === 0 || isActionInFlight}
                className="rounded-lg bg-[#FF7A00] px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:bg-gray-600"
              >
                {isActionInFlight ? "Locking…" : "Continue"}
              </button>
            </div>
          </div>
        )}

        {agentState === "QUOTE_PRICE" && priceQuote && (
          <div className="space-y-4">
            <PriceSummary quote={priceQuote} />
            <div className="flex items-center justify-between">
              <button
                type="button"
                className="rounded-lg border border-[#333] px-3 py-2 text-sm text-gray-300 transition hover:bg-[#222] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleModifySeats}
                disabled={isActionInFlight}
              >
                Modify seats
              </button>
              <button
                type="button"
                className="rounded-lg bg-[#FF7A00] px-3 py-2 text-sm text-white"
                onClick={handleProceedToDetails}
              >
                Enter details
              </button>
            </div>
          </div>
        )}

        {agentState === "COLLECT_DETAILS" && (
          <div className="space-y-3 rounded-lg border border-[#333] bg-[#111] p-4">
            <h3 className="text-sm font-semibold text-white">Traveller & payment details</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-gray-500">Full name</label>
                <input
                  type="text"
                  value={userDetails.name}
                  onChange={(event) => setUserDetails((prev) => ({ ...prev, name: event.target.value }))}
                  className="w-full rounded-lg border border-[#333] bg-[#1f1f1f] px-3 py-2 text-sm text-gray-200 focus:border-[#FF7A00] focus:outline-none"
                />
                {userErrors.name && <p className="text-xs text-red-400">{userErrors.name}</p>}
              </div>
              <div className="space-y-1">
                <label className="text-xs uppercase tracking-widest text-gray-500">UPI ID</label>
                <input
                  type="text"
                  value={userDetails.upiId}
                  onChange={(event) => setUserDetails((prev) => ({ ...prev, upiId: event.target.value }))}
                  className="w-full rounded-lg border border-[#333] bg-[#1f1f1f] px-3 py-2 text-sm text-gray-200 focus:border-[#FF7A00] focus:outline-none"
                />
                {userErrors.upiId && <p className="text-xs text-red-400">{userErrors.upiId}</p>}
              </div>
            </div>
            <button
              type="button"
              className="w-full rounded-lg bg-[#FF7A00] px-3 py-2 text-sm text-white"
              onClick={handleSubmitDetails}
              disabled={isActionInFlight}
            >
              {isActionInFlight ? "Confirming…" : "Confirm booking"}
            </button>
          </div>
        )}

        {agentState === "BOOKED" && bookingDetails && (
          <div className="space-y-3 rounded-lg border border-emerald-700 bg-emerald-900/30 p-4 text-sm text-emerald-100">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-emerald-200">Booking confirmed!</p>
              <span className="text-xs">{new Date(bookingDetails.bookedAt).toLocaleTimeString()}</span>
            </div>
            <p>
              Confirmation number: <span className="font-mono text-white">{bookingDetails.confirmationNumber}</span>
            </p>
            <p>
              Seats: <span className="text-white">{bookingDetails.seats.join(", ")}</span> • Amount paid: ₹
              {bookingDetails.totalAmount}
            </p>
            <button
              type="button"
              onClick={() => setShowTicketPreview(true)}
              className="rounded-lg bg-white px-3 py-2 text-sm font-semibold text-[#1a1a1a]"
            >
              View Ticket
            </button>
          </div>
        )}

        {errorMessage && (
          <div className="space-y-2 rounded-lg border border-red-700 bg-red-900/20 p-4 text-sm text-red-300">
            <p>{errorMessage}</p>
            {retryLabel && (
              <button
                type="button"
                onClick={handleRetryAction}
                className="rounded-md border border-red-500 bg-red-700/20 px-3 py-1 text-xs"
              >
                {retryLabel}
              </button>
            )}
          </div>
        )}

        {toastMessage && (
          <div className="rounded-lg border border-amber-600 bg-amber-900/30 px-3 py-2 text-xs text-amber-200">
            {toastMessage}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-[#333] bg-[#111] px-4 py-2">
        {SUGGESTED_PROMPTS.map((prompt) => (
          <button
            key={`quick-${prompt}`}
            type="button"
            onClick={() => handleSuggestedPrompt(prompt)}
            className="rounded-full border border-[#333] bg-[#1f1f1f] px-3 py-1 text-xs text-gray-300 hover:bg-[#2a2a2a]"
            disabled={isActionInFlight}
          >
            {prompt}
          </button>
        ))}
      </div>

      <div className="rounded-b-lg border-t border-[#333] bg-[#222] p-4">
        <div className="flex gap-2">
          <textarea
            value={inputValue}
            onChange={(event) => setInputValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                handleSend();
              }
            }}
            placeholder="Ask for today's movies or type reset"
            className="flex-1 resize-none rounded-lg border border-[#333] bg-[#1a1a1a] px-3 py-2 text-sm text-white focus:border-[#FF7A00] focus:outline-none"
            rows={1}
            disabled={isActionInFlight}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={isSendDisabled}
            className="flex items-center justify-center rounded-lg bg-[#FF7A00] px-4 py-2 text-white transition-colors hover:bg-[#e66a00] disabled:cursor-not-allowed disabled:bg-gray-600"
            aria-label="Send message"
          >
            {isActionInFlight ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
          </button>
        </div>
      </div>

      {showTicketPreview && bookingDetails && (
        <TicketPreview booking={bookingDetails} onClose={() => setShowTicketPreview(false)} />
      )}
    </div>
  );
}
