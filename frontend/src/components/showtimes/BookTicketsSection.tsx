import React, { useState, useEffect, useMemo } from "react";
import "./BookTicketsSection.css";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { ShowtimeContext } from "../../types/booking";
import { saveShowtimeContext } from "../../utils/bookingContext";
import { fetchShowtimeContext } from "../../utils/showtimeContext";
import type { Movie } from "../../libs/types";
import movieService, { filterAvailableShowtimesGrouped, ShowtimesResponse } from "../../services/movieService";

interface BookTicketsSectionProps {
  movie: Movie;
  onSelectShowtime?: (theatre: string, time: string) => void;
  onBeforeNavigate?: () => void;
  city?: string;
}



const DEFAULT_DAYS = 7;

const BookTicketsSection: React.FC<BookTicketsSectionProps> = ({ movie, onSelectShowtime, onBeforeNavigate, city }) => {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [showtimesData, setShowtimesData] = useState<ShowtimesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [navigatingShowtimeId, setNavigatingShowtimeId] = useState<number | null>(null);

  const dateOptions = useMemo(() => generateDateOptions(DEFAULT_DAYS), []);

  useEffect(() => {
    if (!selectedDate && dateOptions.length > 0) {
      setSelectedDate(dateOptions[0].value);
    }
  }, [selectedDate, dateOptions]);

  useEffect(() => {
    const fetchShowtimes = async () => {
      if (!movie?.id) {
        setError("Movie ID is required.");
        setLoading(false);
        return;
      }
      if (!selectedDate) return;

      setLoading(true);
      setError(null);

      try {
        const params: Record<string, unknown> = { date: selectedDate };
        if (city) {
          params.city = city;
        }

        // Fetch using the service layer with user/fallback pattern
        const data = await movieService.getShowtimesGrouped(movie.id, params);
        
        // Filter to show only available showtimes
        const filteredData = filterAvailableShowtimesGrouped(data);

        if (!filteredData.theatres || filteredData.theatres.length === 0) {
          setShowtimesData(null);
          setError(`No available showtimes for ${formatDateLabel(selectedDate)}.`);
        } else {
          setShowtimesData(filteredData);
        }
      } catch (requestError: any) {
        console.error("[BookTickets] Failed to load showtimes", requestError);
        const message =
          requestError?.response?.status === 404
            ? "No showtimes found for this movie."
            : "Unable to load showtimes. Please try again.";
        setError(message);
        setShowtimesData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchShowtimes();
  }, [movie?.id, selectedDate, city]);

  const handleShowtimeClick = async (theatreName: string, showtimeId: number, startTimeIso: string) => {
    setNavigatingShowtimeId(showtimeId);

    try {
      const context = await fetchShowtimeContext(showtimeId, movie?.id);
      if (!context) {
        toast.error("Unable to open seat selection for this showtime.");
        return;
      }

      const decoratedContext: ShowtimeContext = {
        ...context,
        movie: {
          title: movie?.title || context.movie?.title || "Movie",
          poster: movie?.poster_url || movie?.poster || context.movie?.poster,
        },
        theatre: context.theatre || theatreName,
        showtime_start: startTimeIso || context.showtime_start,
      };

      saveShowtimeContext(decoratedContext);

      if (onSelectShowtime) {
        onSelectShowtime(theatreName, formatTimeLabel(startTimeIso));
      }

      onBeforeNavigate?.();

      navigate(`/seats?showtimeId=${showtimeId}`, {
        state: decoratedContext,
      });
    } catch (err) {
      console.error("[BookTickets] Failed to prepare showtime context", err);
      toast.error("Unable to continue to seat selection. Please try again.");
    } finally {
      setNavigatingShowtimeId(null);
    }
  };

  return (
    <div className="book-tickets-section">
      <h2 className="text-2xl font-bold mb-4 text-center">
        Book Tickets for <span style={{ color: "#ff7a00" }}>{movie?.title || "Selected Movie"}</span>
      </h2>

      <div className="date-row">
        {dateOptions.map((option) => (
          <button
            key={option.value}
            className={`date-btn ${selectedDate === option.value ? "active" : ""}`}
            onClick={() => setSelectedDate(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="modal-loading">Loading showtimes…</div>
      )}

      {!loading && error && <div className="modal-error">{error}</div>}

      {!loading && !error && (
        <div className="theatre-list">
          {!showtimesData || showtimesData.theatres.length === 0 ? (
            <div className="modal-empty">No available showtimes for this date.</div>
          ) : (
            showtimesData.theatres.map((theatre) => (
              <div className="theatre-card" key={theatre.theatre_id}>
                <div className="theatre-header">
                  <div>
                    <h3>{theatre.theatre_name}</h3>
                    {theatre.location && <p className="theatre-location">{theatre.location}</p>}
                  </div>
                </div>

                <div className="showtime-grid">
                  {theatre.times.map((time) => {
                    const isFillingFast = time.status === "filling_fast";
                    return (
                      <button
                        key={time.showtime_id}
                        className={`showtime-btn ${navigatingShowtimeId === time.showtime_id ? "loading" : ""} ${isFillingFast ? "filling-fast" : ""}`}
                        onClick={() => handleShowtimeClick(theatre.theatre_name, time.showtime_id, time.start_time)}
                        disabled={navigatingShowtimeId !== null && navigatingShowtimeId !== time.showtime_id}
                        aria-label={`Select showtime ${new Date(time.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}${time.language ? ` - ${time.language}` : ""}${time.format ? ` - ${time.format}` : ""}`}
                        title={`${time.available_seats} seats available`}
                      >
                        <div className="showtime-time">
                          {new Date(time.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </div>
                        {(time.language || time.format) && (
                          <div className="showtime-meta">
                            {[time.language, time.format].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default BookTicketsSection;

function generateDateOptions(days: number) {
  const options: Array<{ label: string; value: string; date: Date }> = [];
  const today = new Date();

  for (let i = 0; i < days; i += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() + i);
    const label = date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
    });
    options.push({ label, value: date.toISOString().split("T")[0], date });
  }

  return options;
}

function formatTimeLabel(iso?: string | null): string {
  if (!iso) return "TBA";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return "TBA";
  return parsed.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateLabel(date: string): string {
  try {
    return new Date(date).toLocaleDateString("en-IN", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return date;
  }
}
