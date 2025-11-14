import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { fetchShowtimeContext } from "../../utils/showtimeContext";
import { saveShowtimeContext } from "../../utils/bookingContext";
import LoadingSpinner from "../common/Loader";

interface MovieSummary {
  id: number;
  title: string;
  rating?: string | null;
  runtime?: number | null;
  duration?: number | null;
  language?: string | null;
  languages?: string[] | null;
  tags?: string | null;
  genre?: string | null;
}

interface ShowtimePayload {
  id: number;
  showtime_id?: number;
  showtimeId?: number;
  movie_id: number;
  theatre_id?: number;
  theatre?: {
    id?: number;
    name?: string;
    location?: string | null;
  } | null;
  theatre_name?: string;
  theatre_location?: string | null;
  start_time: string;
  end_time?: string;
  language?: string | null;
  format?: string | null;
  status?: "available" | "filling-fast" | "sold-out" | "lapsed" | string | null;
  available_seats?: number | null;
  total_seats?: number | null;
  is_accessible?: boolean;
  has_subtitle?: boolean;
  label?: string | null;
}

type ShowtimeStatus = "available" | "filling-fast" | "sold-out" | "lapsed";

const STATUS_THRESHOLDS = {
  danger: 0,
  warning: 0.3,
};

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";

const DAY_COUNT = 7;

interface ShowtimesSectionProps {
  cachedMovies?: MovieSummary[];
}

interface DateOption {
  label: string;
  value: string;
  display: string;
  isToday: boolean;
}

interface TheatreShowtimes {
  theatreId: number;
  theatreName: string;
  theatreLocation?: string | null;
  distanceLabel?: string | null;
  showtimes: Array<{
    showtimeId: number;
    startTimeIso: string;
    timeLabel: string;
    languageLabel?: string | null;
    formatLabel?: string | null;
    status: ShowtimeStatus;
    isAccessible?: boolean;
    hasSubtitle?: boolean;
  }>;
  movies: MovieSummary[];
}

interface FetchState {
  loading: boolean;
  error: string | null;
}

const buildDateOptions = (): DateOption[] => {
  const today = new Date();
  const formatter = new Intl.DateTimeFormat("en-IN", { weekday: "short" });
  const monthFormatter = new Intl.DateTimeFormat("en-IN", { month: "short" });
  return Array.from({ length: DAY_COUNT }, (_, index) => {
    const current = new Date(today);
    current.setDate(today.getDate() + index);
    const value = current.toISOString().split("T")[0];
    const isToday = index === 0;
    const dayLabel = current.getDate().toString().padStart(2, "0");
    const monthLabel = monthFormatter.format(current);
    const weekday = formatter.format(current);
    const title = `${monthLabel} ${dayLabel}`;
    const suffix = isToday ? "Today" : index === 1 ? "Tomorrow" : weekday;
    return {
      label: `${dayLabel} ${suffix}`,
      value,
      display: index === 0 ? `${monthLabel} ${dayLabel} Today` : `${monthLabel} ${dayLabel} ${weekday}`,
      isToday,
    };
  });
};

const determineStatus = (payload: ShowtimePayload): ShowtimeStatus => {
  if (payload.status) {
    switch (payload.status.toLowerCase()) {
      case "filling_fast":
      case "filling-fast":
        return "filling-fast";
      case "sold_out":
      case "sold-out":
        return "sold-out";
      case "lapsed":
      case "inactive":
        return "lapsed";
      default:
        break;
    }
  }

  if (payload.available_seats != null && payload.total_seats) {
    const availability = payload.available_seats / payload.total_seats;
    if (availability <= STATUS_THRESHOLDS.danger) return "sold-out";
    if (availability <= STATUS_THRESHOLDS.warning) return "filling-fast";
  }

  const startTime = new Date(payload.start_time);
  if (startTime.getTime() < Date.now()) {
    return "lapsed";
  }

  return "available";
};

const STATUS_LABELS: Record<ShowtimeStatus, string> = {
  available: "Available",
  "filling-fast": "Filling Fast",
  "sold-out": "Sold Out",
  lapsed: "Lapsed",
};

const ShowtimesSection: React.FC<ShowtimesSectionProps> = ({ cachedMovies }) => {
  const navigate = useNavigate();
  const tokens = {
    success: { surface: "rgba(34,197,94,0.12)", border: "#22c55e", text: "#34d399" },
    warning: { surface: "rgba(250,204,21,0.12)", border: "#facc15", text: "#fbbf24" },
    danger: { surface: "rgba(248,113,113,0.12)", border: "#f87171", text: "#f87171" },
    muted: { surface: "rgba(148,163,184,0.12)", border: "#94a3b8", text: "#cbd5f5" },
  };

  const dateOptions = useMemo(buildDateOptions, []);
  const [activeView, setActiveView] = useState<"cinemas" | "movies">("cinemas");
  const [selectedDate, setSelectedDate] = useState<string>(dateOptions[0].value);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [fetchState, setFetchState] = useState<FetchState>({ loading: true, error: null });
  const [movies, setMovies] = useState<MovieSummary[]>(cachedMovies ?? []);
  const [groupedShowtimes, setGroupedShowtimes] = useState<TheatreShowtimes[]>([]);
  const [cachedResponses, setCachedResponses] = useState<Record<string, TheatreShowtimes[]>>({});

  useEffect(() => {
    let isMounted = true;
    const loadMovies = async () => {
      if (movies.length > 0) return;
      try {
        const res = await fetch(`${API_BASE}/api/user/movies`);
        if (!res.ok) throw new Error(`Failed to load movies (${res.status})`);
        const data: MovieSummary[] = await res.json();
        if (isMounted) setMovies(data);
      } catch (error) {
        console.warn("[ShowtimesSection] Failed to load user movies, falling back", error);
        try {
          const res = await fetch(`${API_BASE}/api/movies`);
          if (!res.ok) throw new Error(`Failed to load public movies (${res.status})`);
          const data: MovieSummary[] = await res.json();
          if (isMounted) setMovies(data);
        } catch (fallbackError) {
          console.error("[ShowtimesSection] Unable to load movies", fallbackError);
        }
      }
    };
    loadMovies();
    return () => {
      isMounted = false;
    };
  }, [movies.length]);

  useEffect(() => {
    if (cachedResponses[selectedDate]) {
      setGroupedShowtimes(cachedResponses[selectedDate]);
      setFetchState({ loading: false, error: null });
      return;
    }

    const loadShowtimes = async () => {
      setFetchState({ loading: true, error: null });
      try {
        const res = await fetch(`${API_BASE}/api/user/movies`);
        let payload: MovieSummary[] = [];
        if (res.ok) {
          payload = await res.json();
        } else {
          const fallbackRes = await fetch(`${API_BASE}/api/movies`);
          if (!fallbackRes.ok) throw new Error(`Failed to load movies (status ${fallbackRes.status})`);
          payload = await fallbackRes.json();
        }

        const grouped: TheatreShowtimes[] = [];
        for (const movie of payload) {
          try {
            const showtimeRes = await fetch(`${API_BASE}/api/user/movies/${movie.id}/showtimes?date=${selectedDate}`);
            let showtimes: ShowtimePayload[] = [];
            if (showtimeRes.ok) {
              showtimes = await showtimeRes.json();
            } else {
              const fallbackShowtimeRes = await fetch(
                `${API_BASE}/api/movies/${movie.id}/showtimes?date=${selectedDate}`,
              );
              if (!fallbackShowtimeRes.ok) continue;
              showtimes = await fallbackShowtimeRes.json();
            }

            showtimes.forEach((entry) => {
              const theatreId = entry.theatre?.id ?? entry.theatre_id ?? -1;
              if (theatreId < 0) return;

              const status = determineStatus(entry);
              const showtimeId = entry.showtime_id ?? entry.showtimeId ?? entry.id;

              if (!showtimeId) return;

              // Filter: Only show available showtimes (not sold-out or lapsed)
              if (status === "sold-out" || status === "lapsed") return;

              const theatreRecord =
                grouped.find((item) => item.theatreId === theatreId) ??
                grouped[grouped.push({
                  theatreId,
                  theatreName:
                    entry.theatre?.name ?? entry.theatre_name ?? `Theatre ${theatreId}`,
                  theatreLocation: entry.theatre?.location ?? entry.theatre_location ?? null,
                  showtimes: [],
                  movies: [],
                }) - 1];

              const showtime = {
                showtimeId,
                startTimeIso: entry.start_time,
                timeLabel: new Intl.DateTimeFormat("en-IN", {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }).format(new Date(entry.start_time)),
                languageLabel: entry.language,
                formatLabel: entry.format,
                status,
                isAccessible: entry.is_accessible,
                hasSubtitle: entry.has_subtitle,
              };

              theatreRecord.showtimes.push(showtime);

              if (!theatreRecord.movies.some((item) => item.id === movie.id)) {
                theatreRecord.movies.push(movie);
              }
            });
          } catch (innerError) {
            console.warn("[ShowtimesSection] Failed to load showtimes for movie", movie.id, innerError);
          }
        }

        grouped.forEach((group) => {
          group.showtimes.sort((a, b) => new Date(a.startTimeIso).getTime() - new Date(b.startTimeIso).getTime());
        });

        setGroupedShowtimes(grouped);
        setCachedResponses((prev) => ({ ...prev, [selectedDate]: grouped }));
        setFetchState({ loading: false, error: null });
      } catch (error) {
        console.error("[ShowtimesSection] Failed to load showtimes", error);
        setFetchState({
          loading: false,
          error: "Unable to load showtimes. Please try again.",
        });
      }
    };

    loadShowtimes();
  }, [selectedDate, cachedResponses]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery.trim()) return groupedShowtimes;
    const needle = searchQuery.trim().toLowerCase();
    return groupedShowtimes.filter((theatre) => theatre.theatreName.toLowerCase().includes(needle));
  }, [groupedShowtimes, searchQuery]);

  const handleShowtimeClick = async (showtimeId: number) => {
    try {
      const context = await fetchShowtimeContext(showtimeId);
      if (!context) {
        toast.error("Unable to load seat map. Please try another showtime.");
        return;
      }
      saveShowtimeContext(context);
      navigate(`/show/${showtimeId}/seats`, { state: context });
    } catch (error) {
      console.error("[ShowtimesSection] Failed to navigate to seats", error);
      toast.error("Unable to open seats for this showtime.");
    }
  };

  const renderStatusBadge = (label: string, status: ShowtimeStatus) => {
    const tone =
      status === "available"
        ? tokens.success
        : status === "filling-fast"
        ? tokens.warning
        : status === "sold-out"
        ? tokens.danger
        : tokens.muted;
    return (
      <span
        key={status}
        className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
        style={{
          backgroundColor: tone.surface,
          color: tone.text,
        }}
      >
        <span
          aria-hidden="true"
          className="inline-block h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: tone.border }}
        />
        {label}
      </span>
    );
  };

  const renderStatusLegend = () => (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
      {renderStatusBadge("Available", "available")}
      {renderStatusBadge("Filling Fast", "filling-fast")}
      {renderStatusBadge("Sold Out", "sold-out")}
      {renderStatusBadge("Lapsed", "lapsed")}
      <span className="ms-2 inline-flex items-center gap-1 text-xs text-gray-400">
        <span className="inline-flex h-1.5 w-1.5 items-center justify-center rounded-full border" />
        Subtitle
      </span>
      <span className="inline-flex items-center gap-1 text-xs text-gray-400">
        <span className="inline-flex h-1.5 w-1.5 items-center justify-center rounded-full border-dashed border" />
        Accessibility
      </span>
    </div>
  );

  const activeDate = dateOptions.find((option) => option.value === selectedDate);

  return (
    <section className="relative border-t border-[#1f1f25]/60 bg-[#0b0b0f]" aria-labelledby="showtimings-heading">
      <div className="sticky top-16 z-30 border-b border-[#1f1f25]/60 bg-[#0b0b0f]/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <h2 id="showtimings-heading" className="text-3xl font-semibold text-white">
              Showtimings
            </h2>
          </div>
          <div className="flex items-center rounded-full border border-[#2a2a30] bg-[#121217] p-1">
            {(["cinemas", "movies"] as const).map((option) => {
              const isActive = activeView === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setActiveView(option)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    isActive ? "bg-[#f6c800] text-black" : "text-gray-400 hover:text-white"
                  }`}
                >
                  {option === "cinemas" ? "Cinemas" : "Movies"}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mx-auto hidden w-full max-w-7xl justify-between gap-2 overflow-x-auto px-4 pb-4 sm:flex sm:px-6 lg:px-8">
          {dateOptions.map((option) => {
            const isActive = option.value === selectedDate;
            const isPast = new Date(option.value).setHours(0, 0, 0, 0) < new Date().setHours(0, 0, 0, 0);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedDate(option.value)}
                disabled={isPast && !option.isToday}
                className={`min-w-[110px] rounded-full border px-4 py-2 text-sm font-semibold transition ${
                  isActive
                    ? "border-[#f6c800] bg-[#f6c800]/20 text-white"
                    : "border-transparent bg-[#15151a] text-gray-300 hover:border-[#f6c800]/40 hover:text-white"
                } ${isPast && !option.isToday ? "cursor-not-allowed opacity-50" : ""}`}
              >
                <div className="text-xs uppercase tracking-[0.3em] text-[#f6c800]">{option.isToday ? "Today" : option.display.split(" ")[2]}</div>
                <div className="text-base font-semibold">{option.display.split(" ")[1]}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <input
              type="search"
              placeholder="Search for cinema"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="w-full rounded-full border border-[#2a2a30] bg-[#15151a] px-5 py-3 text-sm text-gray-200 placeholder:text-gray-500 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
              aria-label="Search for cinema"
            />
          </div>
          {renderStatusLegend()}
        </div>

        {fetchState.loading && (
          <div className="space-y-4">
            {[...Array(3)].map((_, index) => (
              <div key={index} className="animate-pulse rounded-3xl border border-[#1f1f25]/60 bg-[#111118] p-6">
                <div className="h-4 w-1/3 rounded-full bg-[#1f1f25]" />
                <div className="mt-4 h-3 w-full rounded-full bg-[#1f1f25]" />
                <div className="mt-2 h-3 w-2/3 rounded-full bg-[#1f1f25]" />
                <div className="mt-6 grid gap-3 sm:grid-cols-3">
                  {[...Array(3)].map((chip) => (
                    <div key={chip} className="h-10 rounded-full bg-[#1f1f25]" />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {!fetchState.loading && fetchState.error && (
          <div className="rounded-3xl border border-[#2a2a30] bg-[#111118] p-6 text-center text-sm text-gray-400">
            <p>{fetchState.error}</p>
            <button
              type="button"
              onClick={() => {
                setCachedResponses((prev) => {
                  const next = { ...prev };
                  delete next[selectedDate];
                  return next;
                });
              }}
              className="mt-4 rounded-full border border-[#f6c800]/70 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#f6c800]/15"
            >
              Retry
            </button>
          </div>
        )}

        {!fetchState.loading && !fetchState.error && filteredGroups.length === 0 && (
          <div className="rounded-3xl border border-[#2a2a30] bg-[#111118] p-6 text-center text-sm text-gray-400">
            <h3 className="text-lg font-semibold text-white">No showtimes available</h3>
            <p className="mt-2">Try selecting another date or clearing the search.</p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="mt-4 rounded-full border border-[#f6c800]/70 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#f6c800]/15"
            >
              Clear search
            </button>
          </div>
        )}

        {!fetchState.loading &&
          !fetchState.error &&
          filteredGroups.map((group) => (
            <article
              key={group.theatreId}
              className="rounded-3xl border border-[#1f1f25]/60 bg-[#111118] p-6 shadow-[0_40px_120px_-80px_rgba(246,200,0,0.45)]"
            >
              <header className="flex flex-col gap-3 border-b border-[#1f1f25]/60 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">{group.theatreName}</h3>
                  {group.theatreLocation && (
                    <p className="mt-1 text-sm text-gray-400">{group.theatreLocation}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  {group.distanceLabel && <span>{group.distanceLabel}</span>}
                  <button
                    type="button"
                    aria-label="Toggle favourite"
                    className="rounded-full border border-[#2a2a30] p-2 text-gray-400 hover:border-[#f6c800]/50 hover:text-[#f6c800]"
                  >
                    ♥
                  </button>
                </div>
              </header>

              <div className="mt-6 space-y-6">
                {group.movies.map((movie) => (
                  <div key={`${group.theatreId}-${movie.id}`} className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-sm text-gray-300">
                      <span className="text-white">
                        {movie.title}
                        {movie.rating ? ` (${movie.rating})` : ""}
                      </span>
                      {movie.runtime || movie.duration ? (
                        <span className="text-gray-500">
                          • {movie.runtime ?? movie.duration} mins
                        </span>
                      ) : null}
                      {movie.languages && movie.languages.length > 0 && (
                        <span className="text-gray-500">• {movie.languages.join(", ")}</span>
                      )}
                      {movie.tags || movie.genre ? (
                        <span className="text-gray-500">• {(movie.tags || movie.genre)?.split(",").map((tag) => tag.trim()).join(", ")}</span>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-3">
                      {group.showtimes.map((showtime) => {
                          const tone =
                            showtime.status === "available"
                              ? tokens.success
                              : showtime.status === "filling-fast"
                              ? tokens.warning
                              : tokens.muted;
                          const ariaLabel = `${showtime.timeLabel}, ${showtime.languageLabel ?? ""} ${
                            showtime.formatLabel ?? ""
                          }, ${STATUS_LABELS[showtime.status]}, ${group.theatreName}`.trim();
                          return (
                            <button
                              key={showtime.showtimeId}
                              type="button"
                              onClick={() => handleShowtimeClick(showtime.showtimeId)}
                              aria-label={ariaLabel}
                              className={`rounded-full border px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#111118] hover:translate-y-[-1px]`}
                              style={{
                                backgroundColor: tone.surface,
                                borderColor: tone.border,
                                color: tone.text,
                              }}
                            >
                              <div className="flex items-center gap-2">
                                <span>{showtime.timeLabel}</span>
                                {(showtime.languageLabel || showtime.formatLabel) && (
                                  <span className="text-xs text-gray-400">
                                    {showtime.languageLabel}
                                    {showtime.languageLabel && showtime.formatLabel ? " • " : ""}
                                    {showtime.formatLabel}
                                  </span>
                                )}
                              </div>
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
      </div>
    </section>
  );
};

export default ShowtimesSection;

