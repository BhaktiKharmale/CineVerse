// src/pages/Movie/Details.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import movieService, {
  MovieSummary,
  ShowtimesResponse,
  filterAvailableShowtimesGrouped,
} from "../../services/movieService";
import Loader from "../../components/common/Loader";
import { useBooking } from "../../context/BookingContext";
import toast from "react-hot-toast";
import { getLocalPosterPath, getPlaceholderPath } from "../../utils/posterMapping";
import "../../styles/MovieDetailsNew.css";

const buildDateRange = (days = 10) => {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return {
      value: date.toISOString().split("T")[0],
      label: date.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      }),
    };
  });
};

const formatRuntime = (minutes?: number): string => {
  if (!minutes) return "";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
};

const formatReleaseDate = (dateString?: string): string => {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return dateString;
  }
};

/**
 * Normalize backend poster url/path into frontend /images/<basename>
 * - If getLocalPosterPath returns placeholder, try to derive filename from backendPoster
 * - backendPoster may be an absolute URL, windows path, or bare filename.
 */
function fallbackPosterFromBackend(backendPoster?: string | null): string | null {
  if (!backendPoster) return null;
  try {
    // If backendPoster is a full URL, try to parse and use pathname basename
    // otherwise treat as path and get basename
    const cleaned = String(backendPoster).trim();
    // remove potential query strings
    const withoutQs = cleaned.split("?")[0].split("#")[0];
    // convert backslashes to slashes and split
    const parts = withoutQs.replace(/\\/g, "/").split("/");
    const file = parts[parts.length - 1] || "";
    if (!file) return null;
    return `/images/${encodeURIComponent(file)}`;
  } catch {
    return null;
  }
}

const MovieDetails: React.FC = () => {
  const { movieId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setMovie: setContextMovie, setShowtime } = useBooking();

  const [movie, setMovieData] = useState<MovieSummary | null>(null);
  const [showtimesData, setShowtimesData] = useState<ShowtimesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingShowtimes, setLoadingShowtimes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showtimesError, setShowtimesError] = useState<string | null>(null);
  const [showtimesCache, setShowtimesCache] = useState<Record<string, ShowtimesResponse>>({});

  const dateOptions = useMemo(() => buildDateRange(10), []);
  const selectedDate = searchParams.get("date") ?? dateOptions[0]?.value;
  const selectedCity = searchParams.get("city") ?? undefined;

  /* -------------------------------------------------------- */
  /*                     LOAD MOVIE DETAILS                   */
  /* -------------------------------------------------------- */
  useEffect(() => {
    if (!movieId) return;

    const loadMovie = async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await movieService.getMovie(movieId);
        setMovieData(data);
        setContextMovie((data as any).id ?? data.id);
      } catch (err) {
        console.error("[MovieDetails] Failed to load movie", err);
        setError("Unable to load movie details.");
      } finally {
        setLoading(false);
      }
    };

    loadMovie();
  }, [movieId, setContextMovie]);

  /* -------------------------------------------------------- */
  /*                       LOAD SHOWTIMES                     */
  /* -------------------------------------------------------- */
  useEffect(() => {
    if (!movieId || !selectedDate) return;

    const cacheKey = `${movieId}-${selectedDate}-${selectedCity || "all"}`;
    if (showtimesCache[cacheKey]) {
      setShowtimesData(showtimesCache[cacheKey]);
      setLoadingShowtimes(false);
      setShowtimesError(null);
      return;
    }

    const loadShowtimes = async () => {
      setLoadingShowtimes(true);
      setShowtimesError(null);
      try {
        const params: Record<string, unknown> = { date: selectedDate };
        if (selectedCity) params.city = selectedCity;

        const data = await movieService.getShowtimesGrouped(movieId, params);
        const availableData = filterAvailableShowtimesGrouped(data);

        setShowtimesData(availableData);
        setShowtimesCache((prev) => ({ ...prev, [cacheKey]: availableData }));
      } catch (err) {
        console.error("[MovieDetails] Failed to load showtimes", err);
        setShowtimesError("Showtimes unavailable for the selected date.");
      } finally {
        setLoadingShowtimes(false);
      }
    };

    loadShowtimes();
  }, [movieId, selectedDate, selectedCity, showtimesCache]);

  /* -------------------------------------------------------- */
  /*                   SELECT SHOWTIME ACTION                 */
  /* -------------------------------------------------------- */
  const handleSelectShowtime = (showtimeId: number, startTime: string) => {
    if (!movieId) return;
    setShowtime(showtimeId);
    toast.success(
      `Showtime locked for ${new Date(startTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    );
    navigate(`/show/${showtimeId}/seats`, { state: { movieId } });
  };

  /* -------------------------------------------------------- */
  /*                  LOADING OR ERROR STATES                 */
  /* -------------------------------------------------------- */
  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#050509]">
        <Loader />
      </div>
    );
  }

  if (error || !movie) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-[#050509] px-4 text-center text-white">
        <h2 className="text-2xl font-semibold uppercase tracking-wide">{error ?? "Movie not found"}</h2>
        <div className="flex gap-3">
          <button
            onClick={() => navigate("/movies")}
            className="rounded-full border border-[#f6c800]/70 px-6 py-2 text-sm font-semibold uppercase tracking-wide text-[#f6c800] transition hover:bg-[#1a1a1f]"
          >
            Back to Movies
          </button>
          <button
            onClick={() => window.location.reload()}
            className="rounded-full bg-[#f6c800] px-6 py-2 text-sm font-semibold uppercase tracking-wide text-[#050509] transition hover:opacity-90"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* -------------------------------------------------------- */
  /*          Resolve poster so frontend always uses /images  */
  /* -------------------------------------------------------- */

  // Backend field might be poster_url (snake) or poster (camel). Use either.
  const backendPoster = (movie as any).poster_url ?? (movie as any).poster ?? undefined;

  // First try the local poster path (id/title)
  const localFromMap = getLocalPosterPath((movie as any).id ?? movie.id, (movie as any).title ?? movie.title);

  // If the mapping returned placeholder, try to derive a /images/<basename> from backendPoster
  const posterUrl =
    localFromMap === getPlaceholderPath()
      ? fallbackPosterFromBackend(backendPoster) ?? localFromMap
      : localFromMap;

  // Normalize release date (accept snake or camel)
  const releaseDate: string | undefined = (movie as any).release_date ?? (movie as any).releaseDate ?? undefined;

  const runtime = (movie as any).runtime ?? (movie as any).duration ?? undefined;

  const genres: string[] =
    (movie as any).genre ? String((movie as any).genre).split(",").map((g: string) => g.trim()) : [];

  const languages: string[] =
    (movie as any).language ? String((movie as any).language).split(",").map((l: string) => l.trim()) : [];

  /* -------------------------------------------------------- */
  /*                      PAGE UI START                       */
  /* -------------------------------------------------------- */

  return (
    <div className="movie-details-page">
      <div className="hero-section">
        <div className="hero-background" style={{ backgroundImage: `url(${posterUrl})` }}>
          <div className="hero-overlay" />
        </div>
        <div className="hero-content">
          <div className="container-wrapper">
            <div className="poster-card">
              <img
                src={posterUrl}
                alt={`${(movie as any).title ?? movie.title} poster`}
                className="poster-image"
                onError={(event) => {
                  const img = event.target as HTMLImageElement;
                  const placeholder = getPlaceholderPath();
                  if (!img.src.endsWith(placeholder)) img.src = placeholder;
                }}
              />
            </div>
            <div className="info-panel">
              <h1 className="movie-title-hero font-semibold uppercase tracking-wide">{(movie as any).title ?? movie.title}</h1>

              <div className="metadata-row mb-4">
                <span className="badge badge-certification font-semibold uppercase tracking-wide">UA 13+</span>

                {runtime && (
                  <span className="badge badge-runtime font-semibold uppercase tracking-wide">
                    <span className="badge-icon">⏱</span>
                    {formatRuntime(runtime)}
                  </span>
                )}

                {languages.length > 0 && (
                  <span className="badge badge-language font-semibold uppercase tracking-wide">{languages.join(", ")}</span>
                )}

                {(movie as any).rating && (
                  <span className="badge badge-rating font-semibold uppercase tracking-wide">
                    <span className="badge-icon">⭐</span>
                    {(movie as any).rating}/10
                  </span>
                )}
              </div>

              {genres.length > 0 && (
                <div className="genre-tags mb-4">
                  {genres.map((g: string) => (
                    <span key={g} className="genre-tag font-semibold uppercase tracking-wide">
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {releaseDate && (
                <div className="mb-4">
                  <p className="text-sm text-gray-400">
                    <span className="font-semibold text-[#f6c800]">Release Date:</span>{" "}
                    {formatReleaseDate(releaseDate)}
                  </p>
                </div>
              )}

              <div className="my-5 h-px bg-gradient-to-r from-transparent via-[#2a2a30] to-transparent" />

              <div className="mb-5">
                <h3 className="text-lg font-semibold uppercase tracking-wide text-white mb-2">Synopsis</h3>
                <p className="text-sm leading-relaxed text-gray-300">
                  {(movie as any).synopsis ?? (movie as any).description ?? "Synopsis not available."}
                </p>
              </div>

              <div className="space-y-3 text-sm">
                {(movie as any).director && (
                  <div className="flex gap-2">
                    <span className="font-semibold uppercase tracking-wide text-[#f6c800] min-w-[80px]">Director:</span>
                    <span className="text-gray-300">{(movie as any).director}</span>
                  </div>
                )}

                {(movie as any).cast && (
                  <div className="flex gap-2">
                    <span className="font-semibold uppercase tracking-wide text-[#f6c800] min-w-[80px]">Cast:</span>
                    <span className="text-gray-300">
                      {Array.isArray((movie as any).cast) ? (movie as any).cast.slice(0, 5).join(", ") : (movie as any).cast}
                    </span>
                  </div>
                )}

                <div className="flex flex-wrap gap-2 mt-4">
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#18181c] border border-[#2a2a30] text-xs font-semibold uppercase tracking-wide text-gray-300">2D</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#18181c] border border-[#2a2a30] text-xs font-semibold uppercase tracking-wide text-gray-300">3D</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-full bg-[#18181c] border border-[#2a2a30] text-xs font-semibold uppercase tracking-wide text-gray-300">IMAX</span>
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#18181c] border border-[#2a2a30] text-xs font-semibold uppercase tracking-wide text-gray-300">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
                    </svg>
                    Subtitles
                  </span>
                  <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#18181c] border border-[#2a2a30] text-xs font-semibold uppercase tracking-wide text-gray-300">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Accessible
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="about-section">
        <div className="about-container space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="about-title font-semibold uppercase tracking-wide">Showtimes</h2>
            <div className="flex items-center gap-2">
              <label htmlFor="movie-detail-date" className="text-xs font-semibold uppercase tracking-wide text-gray-500">Date</label>
              <select
                id="movie-detail-date"
                value={selectedDate ?? ""}
                onChange={(event) => setSearchParams({ date: event.target.value })}
                className="rounded-full border border-[#2a2a3a] bg-[#111118] px-4 py-2 text-sm font-semibold uppercase tracking-wide text-gray-200 focus:border-[#f6c800] focus:outline-none"
              >
                {dateOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-[#050509] text-gray-200">{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          {loadingShowtimes && (
            <div className="flex min-h-[12rem] items-center justify-center rounded-2xl border border-[#1f1f25]/60 bg-[#0f0f16]">
              <Loader />
            </div>
          )}

          {showtimesError && !loadingShowtimes && (
            <div className="flex min-h-[12rem] flex-col items-center justify-center gap-3 rounded-2xl border border-[#1f1f25]/60 bg-[#0f0f16] text-center text-gray-300">
              <p className="font-semibold uppercase tracking-wide">{showtimesError}</p>
              <button
                onClick={() => setSearchParams({ date: dateOptions[0]?.value ?? "" })}
                className="rounded-full border border-[#f6c800]/70 px-5 py-2 text-xs font-semibold uppercase tracking-wide text-[#f6c800] transition hover:bg-[#1a1a1f]"
              >
                Reset Date
              </button>
            </div>
          )}

          {!loadingShowtimes && !showtimesError && (
            <div className="space-y-4">
              {(!showtimesData || showtimesData.theatres.length === 0) && (
                <div className="rounded-2xl border border-[#1f1f25]/60 bg-[#0f0f16] p-6 text-gray-400 font-semibold uppercase tracking-wide">
                  No available showtimes for this date.
                </div>
              )}

              {showtimesData?.theatres.map((theatre) => (
                <div key={theatre.theatre_id} className="rounded-2xl border border-[#1f1f25]/60 bg-[#0f0f16] p-6 shadow-lg">
                  <div className="mb-4">
                    <h3 className="text-xl font-semibold uppercase tracking-wide text-white">{theatre.theatre_name}</h3>
                    {theatre.location && <p className="text-sm font-semibold uppercase tracking-wide text-gray-400 mt-1">{theatre.location}</p>}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3">
                    {theatre.times.map((time) => {
                      const isFillingFast = time.status === "filling_fast" || (time.available_seats > 0 && time.available_seats < 20);
                      const isAvailable = time.available_seats > 0;

                      return (
                        <button
                          key={time.showtime_id}
                          onClick={() => handleSelectShowtime(time.showtime_id, time.start_time)}
                          disabled={!isAvailable}
                          className={`flex flex-col items-center justify-center px-6 py-3 rounded-xl border-2 transition-all min-w-[100px] font-semibold uppercase tracking-wide ${
                            isFillingFast ? "bg-amber-500/10 border-amber-500 text-amber-400"
                              : isAvailable ? "bg-green-500/10 border-green-500 text-green-400"
                              : "bg-red-500/10 border-red-500 text-red-400 cursor-not-allowed"
                          }`}
                          title={`${time.available_seats} seats available${time.language ? ` | ${time.language}` : ""}${time.format ? ` | ${time.format}` : ""}`}
                          aria-label={`Select showtime ${new Date(time.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })} at ${theatre.theatre_name}`}
                        >
                          <span className="text-lg font-semibold uppercase tracking-wide">
                            {new Date(time.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true })}
                          </span>

                          {(time.language || time.format) && (
                            <span className="text-xs mt-1 opacity-80 font-semibold uppercase tracking-wide">{[time.language, time.format].filter(Boolean).join(" · ")}</span>
                          )}

                          {time.price && <span className="text-xs mt-1 opacity-80 font-semibold uppercase tracking-wide">₹{time.price}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MovieDetails;
