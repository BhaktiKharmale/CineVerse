import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import movieService, { MovieSummary } from "../../services/movieService";
import { useShowtimeModal } from "../../context/ShowtimeModalContext";
import Loader from "../../components/common/Loader";
import Navbar from "../../components/layout/Navbar";
import Footer from "../../components/layout/Footer";
import type { Movie } from "../../libs/types";

const makeDateOptions = (days = 7) => {
  const today = new Date();
  return Array.from({ length: days }, (_, idx) => {
    const date = new Date(today);
    date.setDate(today.getDate() + idx);
    return {
      value: date.toISOString().split("T")[0],
      label: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    };
  });
};

const MovieCard: React.FC<{ movie: MovieSummary; onBook: (movie: Movie) => void }> = ({ movie, onBook }) => {
  const poster = movie.poster_url ?? "/images/placeholder_poster.jpg";
  
  // Convert MovieSummary to Movie type for modal
  const movieForModal: Movie = {
    id: typeof movie.id === 'number' ? movie.id : Number(movie.id),
    title: movie.title,
    poster_url: movie.poster_url ?? undefined,
    poster: movie.poster_url ?? undefined,
    genre: movie.genre ?? undefined,
    language: movie.language ?? undefined,
    duration: movie.duration ?? undefined,
    rating: movie.rating ?? undefined,
    synopsis: movie.synopsis ?? undefined,
    description: movie.description ?? undefined,
  };
  
  return (
    <div className="group relative flex flex-col overflow-hidden rounded-3xl border border-[#1f1f25]/60 bg-[#111118] shadow-lg transition hover:-translate-y-1 hover:shadow-[0_24px_80px_-40px_rgba(246,200,0,0.8)]">
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#16161f]">
        <img src={poster} alt={movie.title} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="text-lg font-semibold text-white line-clamp-1">{movie.title}</h3>
          <p className="mt-1 text-sm text-gray-400 line-clamp-2">{movie.synopsis || movie.description || "No synopsis available."}</p>
        </div>
        <div className="mt-auto flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-gray-500">
          {movie.language && <span className="rounded-full border border-[#2a2a3a] px-3 py-1">{movie.language}</span>}
          {movie.genre && (
            <span className="rounded-full border border-[#2a2a3a] px-3 py-1">{movie.genre.split(",")[0]}</span>
          )}
        </div>
        <button
          onClick={() => onBook(movieForModal)}
          className="mt-2 inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#f6c800] to-[#ff9d1b] px-6 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#0b0b0f] transition hover:opacity-90 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
        >
          Book Movie
        </button>
      </div>
    </div>
  );
};

const MoviesPage: React.FC = () => {
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { openModal } = useShowtimeModal();

  const selectedDate = searchParams.get("date") ?? makeDateOptions(1)[0]?.value;

  const fetchMovies = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await movieService.getMovies();
      setMovies(data);
    } catch (err) {
      console.error("[Movies] Failed to load movies", err);
      setError("Failed to load movies. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovies();
  }, []);

  const dateOptions = useMemo(() => makeDateOptions(10), []);

  useEffect(() => {
    if (!selectedDate && dateOptions[0]) {
      setSearchParams({ date: dateOptions[0].value }, { replace: true });
    }
  }, [dateOptions, selectedDate, setSearchParams]);

  const handleBook = (movie: Movie) => {
    // Open ShowtimeModal instead of navigating
    openModal(movie);
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center bg-[#050509]">
        <Loader />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 bg-[#050509] px-4 text-center text-white">
        <h2 className="text-2xl font-semibold">{error}</h2>
        <button
          onClick={() => fetchMovies()}
          className="rounded-full border border-[#f6c800]/70 px-6 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#1a1a1f]"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#050509] text-white">
      <Navbar />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-10">
        <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="text-3xl font-semibold">Now Showing</h1>
            <p className="mt-1 text-gray-400">Discover movies and book your seats instantly.</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="movies-date-filter" className="text-xs uppercase tracking-[0.3em] text-gray-500">
              Date
            </label>
            <select
              id="movies-date-filter"
              value={selectedDate ?? ""}
              onChange={(event) => setSearchParams({ date: event.target.value })}
              className="rounded-full border border-[#2a2a3a] bg-[#111118] px-4 py-2 text-sm text-gray-200 focus:border-[#f6c800] focus:outline-none"
            >
              {dateOptions.map((option) => (
                <option key={option.value} value={option.value} className="bg-[#050509] text-gray-200">
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {movies.map((movie) => (
            <MovieCard key={movie.id} movie={movie} onBook={handleBook} />
          ))}
        </div>
        {movies.length === 0 && (
          <div className="mt-20 text-center text-gray-400">
            <p>No movies found for the selected filters.</p>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
};

export default MoviesPage;
