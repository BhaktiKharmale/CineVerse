import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/layout/Navbar";
import Footer from "../../components/layout/Footer";
import CinemasHeader from "../../components/cinemas/CinemasHeader";
import MovieCard from "../../components/movies/MovieCard";
import type { Movie as MovieType } from "../../libs/types";

type MovieSummary = MovieType & {
  runtime?: number;
  duration?: number;
};

const API_BASE = (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001").replace(/\/$/, "");

const CITY_OPTIONS = [
  { label: "Mumbai", value: "mumbai" },
  { label: "Bengaluru", value: "bengaluru" },
  { label: "Hyderabad", value: "hyderabad" },
  { label: "Delhi", value: "delhi" },
  { label: "Chennai", value: "chennai" },
];

const CinemasPage: React.FC = () => {
  const navigate = useNavigate();

  const [selectedCity, setSelectedCity] = useState<string>(CITY_OPTIONS[0].value);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [movies, setMovies] = useState<MovieSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const fetchMovies = useCallback(async () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/movies`, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      });

      if (!response.ok) {
        throw new Error(`Failed to load movies (${response.status})`);
      }

      const data = (await response.json()) as MovieSummary[];
      const validMovies = data.filter((movie) => movie && movie.id && movie.title);
      setMovies(validMovies);
    } catch (err: any) {
      if (err.name === "AbortError") return;
      console.error("[Cinemas] Failed to fetch movies:", err);
      setError(err.message || "Unable to load movies right now.");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchMovies();
    return () => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, [fetchMovies]);

  const filteredMovies = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return movies
      .filter((movie) => movie.title.toLowerCase().includes(query))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [movies, searchQuery]);

  const handleCardClick = (movieId: MovieSummary["id"]) => {
    navigate(`/movie/${movieId}`);
  };

  const formatMeta = (movie: MovieSummary) => {
    const pieces: string[] = [];

    if (movie.rating) {
      pieces.push(`Rated ${movie.rating}`);
    }

    const runtime = movie.runtime || movie.duration;
    if (runtime) {
      const hours = Math.floor(runtime / 60);
      const minutes = runtime % 60;
      pieces.push(`${hours > 0 ? `${hours}h ` : ""}${minutes}m`.trim());
    }

    if (movie.tags) {
      pieces.push(movie.tags.split(",")[0].trim());
    }

    return pieces.join(" • ");
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0b0f] text-white">
      <Navbar />

      <main className="flex-1 pb-16">
        <div className="mx-auto w-full max-w-7xl px-4 pb-10 pt-8 sm:px-6 lg:px-8">
          <CinemasHeader
            selectedCity={selectedCity}
            cityOptions={CITY_OPTIONS}
            onCityChange={setSelectedCity}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>

        <div className="mx-auto mt-6 w-full max-w-7xl px-4 pb-12 sm:px-6 lg:px-8">
          {loading && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-gray-400">
              <div className="h-10 w-10 animate-spin rounded-full border-2 border-[#1f1f25] border-t-[#f6c800]" />
              Loading movies…
            </div>
          )}

          {error && !loading && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
              <div className="space-y-2">
                <p className="text-lg font-semibold text-red-400">Unable to load movies</p>
                <p className="text-sm text-gray-400">{error}</p>
              </div>
              <button
                type="button"
                onClick={fetchMovies}
                className="rounded-full bg-[#f6c800] px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-black shadow-[0_15px_50px_-30px_rgba(246,200,0,0.8)] transition hover:-translate-y-[1px]"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {filteredMovies.length === 0 ? (
                <div className="col-span-full rounded-3xl border border-[#1f1f25] bg-[#101018] p-12 text-center text-sm text-gray-400">
                  No movies currently running in cinemas. Check back soon!
                </div>
              ) : (
                filteredMovies.map((movie) => (
                  <MovieCard
                    key={movie.id}
                    movie={movie}
                    onCardClick={() => handleCardClick(movie.id)}
                    tagLabel={selectedCity.toUpperCase()}
                    metaText={formatMeta(movie) || "Now in cinemas"}
                    className="h-full"
                  />
                ))
              )}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CinemasPage;

