import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/layout/Navbar";
import Footer from "../../components/layout/Footer";
import HeroBanner, { HeroSlide } from "../../components/home/HeroBanner";
import QuickBookBar from "../../components/home/QuickBookBar";
import TabbedMenu, { TabItem } from "../../components/home/TabbedMenu";
import NowShowingCarousel from "../../components/home/NowShowingCarousel";
import FloatingCtas from "../../components/home/FloatingCtas";
import { useShowtimeModal } from "../../context/ShowtimeModalContext";
import type { Movie } from "../../libs/types";

const API_BASE = import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001";

const TAB_ITEMS: TabItem[] = [
  { id: "now-showing", label: "Now Showing" },
  { id: "coming-soon", label: "Coming Soon" },
  { id: "experiences", label: "Experiences" },
  { id: "trailers", label: "Trailers" },
  { id: "offers", label: "Offers" },
];

const QUICK_BOOK_CINEMAS = [
  { label: "CineVerse Plaza - Mumbai", value: "cineverse-plaza" },
  { label: "Galaxy Grand - Bengaluru", value: "galaxy-grand" },
  { label: "Prime Square - Hyderabad", value: "prime-square" },
  { label: "Aurora Mall - Delhi", value: "aurora-mall" },
];

const QUICK_BOOK_TIMES = [
  { label: "10:00 AM", value: "10:00" },
  { label: "01:30 PM", value: "13:30" },
  { label: "04:45 PM", value: "16:45" },
  { label: "08:00 PM", value: "20:00" },
];

function getReadableDuration(minutes?: number, runtime?: number) {
  const totalMinutes = minutes || runtime;
  if (!totalMinutes) return undefined;
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  return `${hrs}h ${mins}m`;
}

function toTitleCase(value?: string) {
  if (!value) return undefined;
  return value
    .split(" ")
    .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
    .join(" ");
}

function generateDateOptions(length = 5) {
  const formatter = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

  return Array.from({ length }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return {
      value: date.toISOString().split("T")[0],
      label: formatter.format(date),
    };
  });
}

const EXPERIENCES = [
  {
    id: "immersive",
    title: "4DX Immersive",
    description: "Feel the action with motion seats, scent, and weather synced to every scene.",
  },
  {
    id: "imax",
    title: "IMAX Laser",
    description: "Ultra-bright visuals and DTS sound for the most epic blockbusters.",
  },
  {
    id: "lux",
    title: "CineVerse Lux",
    description: "Recliners, butler service, and curated menus for an indulgent night out.",
  },
];

const OFFERS = [
  {
    id: "fnb",
    title: "Weekend Feast",
    description: "Buy a popcorn combo and get a gourmet dessert on the house.",
    tag: "Limited",
  },
  {
    id: "passport",
    title: "CineVerse Passport",
    description: "Unlock premium screenings, lounge access, and member-only premieres.",
    tag: "Members",
  },
];

export default function Home() {
  // 🔍 DIAGNOSTIC: Track render count
  console.count("🔄 Home render");
  console.log("⏰ Home render timestamp:", Date.now());
  
  const navigate = useNavigate();
  const [newReleases, setNewReleases] = useState<Movie[]>([]);
  const [popular, setPopular] = useState<Movie[]>([]);
  const [trending, setTrending] = useState<Movie[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>(TAB_ITEMS[0].id);
  const [quickBookMode, setQuickBookMode] = useState<"movie" | "cinema">("movie");
  const [selectedMovie, setSelectedMovie] = useState<string>("");
  const [selectedCinema, setSelectedCinema] = useState<string>(QUICK_BOOK_CINEMAS[0].value);
  const [selectedDate, setSelectedDate] = useState<string>(generateDateOptions(1)[0].value);
  const [selectedTime, setSelectedTime] = useState<string>(QUICK_BOOK_TIMES[0].value);
  const abortControllerRef = useRef<AbortController | null>(null);
  const hasFetchedRef = useRef(false);
  const { openModal } = useShowtimeModal();

  const dateOptions = useMemo(() => generateDateOptions(7), []);

  const fetchMovies = useCallback(async () => {
    // 🔍 DIAGNOSTIC: Track fetch calls
    console.count("🚀 fetchMovies called");
    console.log("📊 Fetch called at:", Date.now());
    console.trace("📍 Fetch call stack");
    
    if (abortControllerRef.current && !abortControllerRef.current.signal.aborted) {
      console.log("[Home] ⏸️ Fetch already in progress, skipping");
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const requestUrl = `${API_BASE}/api/movies`;
    console.log("[Home] 🚀 Starting fetch:", requestUrl);

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(requestUrl, {
        signal: abortController.signal,
        headers: {
          Accept: "application/json",
        },
      });

      console.log("[Home] 📡 Response status:", res.status, res.statusText);

      if (!res.ok) {
        const errorText = await res.text();
        console.error("[Home] ❌ Response error:", {
          status: res.status,
          statusText: res.statusText,
          body: errorText,
        });
        throw new Error(`Failed to fetch movies: ${res.status} ${res.statusText}`);
      }

      const data: Movie[] = await res.json();

      if (!Array.isArray(data)) {
        console.error("[Home] ❌ Invalid response format - expected array, got:", typeof data);
        throw new Error("Invalid response format: expected array");
      }

      if (data.length === 0) {
        console.warn("[Home] ⚠️ Empty movies array");
        setError("No movies available at the moment.");
        setLoading(false);
        return;
      }

      const validMovies = data.filter((movie) => {
        if (!movie || typeof movie.id !== "number" || !movie.title) {
          console.warn("[Home] ⚠️ Invalid movie entry:", movie);
          return false;
        }
        return true;
      });

      if (validMovies.length === 0) {
        setError("No valid movies found in the response.");
        setLoading(false);
        return;
      }

      const shuffled = [...validMovies].sort(() => Math.random() - 0.5);
      const chunkSize = Math.ceil(shuffled.length / 3);

      setNewReleases(shuffled.slice(0, chunkSize));
      setPopular(shuffled.slice(chunkSize, chunkSize * 2));
      setTrending(shuffled.slice(chunkSize * 2));

      console.log("[Home] ✅ State updated");
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log("[Home] ⏹️ Request aborted");
        return;
      }

      console.error("[Home] ❌ Error loading movie data:", err);
      setError(err.message || "Failed to load movies. Please check your connection and try again.");
    } finally {
      if (!abortController.signal.aborted) {
        setLoading(false);
        console.log("[Home] ✅ Loading complete");
      }
    }
  }, []);

  useEffect(() => {
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      fetchMovies();
    }

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      hasFetchedRef.current = false;
    };
  }, [fetchMovies]);

  const heroSlides: HeroSlide[] = useMemo(() => {
    const source = [...newReleases, ...popular].slice(0, 3);
    if (source.length === 0) {
      return [
        {
          id: "kgf-placeholder",
          movieId: "kgf-placeholder",
          title: "Experience CineVerse",
          summary:
            "Discover premium formats, curated dining, and special screenings—crafted for movie lovers.",
          posterUrl: "/images/placeholder_poster.jpg",
          durationLabel: "Book your escape",
          badge: "CineVerse Spotlight",
        },
      ];
    }

    return source.map((movie) => {
      const durationMinutes = normalizeDuration(movie.duration);
      const runtimeMinutes = normalizeDuration(movie.runtime);

      return {
        id: movie.id,
        movieId: movie.id,
        title: movie.title,
        summary: movie.description,
        posterUrl: movie.poster_url || movie.poster || "/images/placeholder_poster.jpg",
        certification: movie.rating != null ? String(movie.rating) : undefined,
        durationLabel: getReadableDuration(durationMinutes, runtimeMinutes),
        releaseDateLabel:
          movie.release_date || movie.releaseDate
            ? `In cinemas ${toTitleCase(movie.release_date || movie.releaseDate)}`
            : undefined,
        genres: movie.genre ? movie.genre.split(",").map((g) => g.trim()) : undefined,
        languages:
          movie.languages && movie.languages.length > 0
            ? movie.languages
            : movie.language
            ? [movie.language]
            : undefined,
        badge: movie.promoted ? "New Release" : "Featured",
      } satisfies HeroSlide;
    });
  }, [newReleases, popular]);

  function normalizeDuration(value?: string | number | null): number | undefined {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = parseInt(value, 10);
      return Number.isNaN(parsed) ? undefined : parsed;
    }
    return undefined;
  }

  const allMovies = useMemo(() => {
    const map = new Map<number, Movie>();
    [...newReleases, ...popular, ...trending].forEach((movie) => {
      map.set(movie.id, movie);
    });
    return Array.from(map.values());
  }, [newReleases, popular, trending]);

  const movieOptions = useMemo(
    () =>
      allMovies.map((movie) => ({
        label: movie.title,
        value: movie.id.toString(),
      })),
    [allMovies],
  );

  useEffect(() => {
    if (!selectedMovie && movieOptions.length > 0) {
      setSelectedMovie(movieOptions[0].value.toString());
    }
  }, [movieOptions, selectedMovie]);

  const handleRetry = useCallback(() => {
    fetchMovies();
  }, [fetchMovies]);

  const handleBookNavigate = useCallback((movieId: string | number) => {
    if (!movieId || movieId === "kgf-placeholder") {
      navigate("/booking");
      return;
    }

    const selected = allMovies.find((movie) => movie.id?.toString() === movieId.toString());
    if (selected) {
      openModal(selected);
    } else {
      navigate(`/movie/${movieId}`);
    }
  }, [allMovies, navigate, openModal]);

  const handleQuickBookSubmit = useCallback(() => {
    if (!selectedMovie || !selectedCinema || !selectedDate || !selectedTime) {
      alert("Please select a movie, date, cinema, and timing to continue.");
      return;
    }

    const params = new URLSearchParams({
      movieId: selectedMovie.toString(),
      cinema: selectedCinema,
      date: selectedDate,
      time: selectedTime,
      mode: quickBookMode,
    });

    navigate(`/booking?${params.toString()}`);
  }, [selectedMovie, selectedCinema, selectedDate, selectedTime, quickBookMode, navigate]);

  const renderActiveTabContent = () => {
    if (activeTab === "now-showing") {
      return <NowShowingCarousel movies={newReleases} emptyMessage="No films are showing right now. Check back soon!" />;
    }

    if (activeTab === "coming-soon") {
      return <NowShowingCarousel movies={popular} emptyMessage="Upcoming titles will be unveiled shortly." />;
    }

    if (activeTab === "experiences") {
      return (
        <div className="grid gap-6 md:grid-cols-3">
          {EXPERIENCES.map((experience) => (
            <div
              key={experience.id}
              className="rounded-3xl border border-[#2a2a30] bg-gradient-to-br from-[#18181c] via-[#121217] to-[#1f1f25] p-6 shadow-[0_30px_90px_-70px_rgba(246,200,0,0.65)]"
            >
              <span className="mb-3 inline-flex items-center rounded-full border border-[#f6c800]/50 bg-[#f6c800]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#f6c800]">
                Premium
              </span>
              <h3 className="text-xl font-semibold text-white">{experience.title}</h3>
              <p className="mt-3 text-sm text-gray-400">{experience.description}</p>
            </div>
          ))}
        </div>
      );
    }

    if (activeTab === "trailers") {
      return (
        <div className="grid gap-6 md:grid-cols-2">
          {trending.slice(0, 4).map((movie) => (
            <div
              key={movie.id}
              className="group flex items-center gap-4 rounded-3xl border border-[#2a2a30] bg-[#15151a] p-4 transition hover:border-[#f6c800]/40 hover:bg-[#18181c]"
            >
              <img
                src={movie.poster_url || movie.poster || "/images/placeholder_poster.svg"}
                alt={movie.title}
                loading="lazy"
                className="h-24 w-16 flex-shrink-0 rounded-2xl object-cover shadow-[0_0_40px_rgba(246,200,0,0.4)]"
                onError={(event) => {
                  const img = event.target as HTMLImageElement;
                  const placeholder = "/images/placeholder_poster.svg";
                  // Prevent infinite loop: only set placeholder if not already set
                  if (!img.src.endsWith(placeholder)) {
                    img.src = placeholder;
                  }
                }}
              />
              <div className="flex-1 space-y-2">
                <h3 className="text-lg font-semibold text-white">{movie.title}</h3>
                <p className="text-sm text-gray-400 line-clamp-2">{movie.description || "Exclusive trailer dropping soon on CineVerse."}</p>
                <button
                  type="button"
                  onClick={() => navigate(`/movie/${movie.id}`)}
                  className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.25em] text-[#f6c800] transition hover:text-[#ffe15b]"
                  aria-label={`Watch trailer for ${movie.title}`}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m9.5 7 7 5-7 5V7Z" />
                  </svg>
                  Watch trailer
                </button>
              </div>
            </div>
          ))}
          {trending.length === 0 && (
            <div className="rounded-3xl border border-dashed border-[#2a2a30] bg-[#15151a] p-8 text-center text-sm text-gray-400">
              Trailers arrive closer to launch. Stay tuned!
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="grid gap-6 md:grid-cols-2">
        {OFFERS.map((offer) => (
          <div
            key={offer.id}
            className="rounded-3xl border border-[#2a2a30] bg-gradient-to-r from-[#18181c] via-[#121217] to-[#18181c] p-6 shadow-[0_25px_80px_-70px_rgba(246,200,0,0.6)]"
          >
            <span className="inline-flex items-center rounded-full border border-[#f6c800]/50 bg-[#f6c800]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#f6c800]">
              {offer.tag}
            </span>
            <h3 className="mt-3 text-xl font-semibold text-white">{offer.title}</h3>
            <p className="mt-2 text-sm text-gray-400">{offer.description}</p>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#0b0b0f] text-white">
      <Navbar />

      <main className="flex-1 bg-[#0b0b0f]">
        <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-10 sm:px-6 lg:px-8">
          {loading && (
            <div className="flex min-h-[40vh] items-center justify-center text-gray-400">Loading movies...</div>
          )}

          {error && !loading && (
            <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
              <div className="space-y-2">
                <p className="text-lg font-semibold text-red-400">Unable to load listings</p>
                <p className="text-sm text-gray-400">{error}</p>
              </div>
              <button
                type="button"
                onClick={handleRetry}
                className="rounded-full bg-[#f6c800] px-6 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-black shadow-[0_15px_50px_-30px_rgba(246,200,0,0.8)] transition hover:-translate-y-[1px]"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              <HeroBanner slides={heroSlides} onBook={handleBookNavigate} />

              <QuickBookBar
                mode={quickBookMode}
                onModeChange={setQuickBookMode}
                movieOptions={movieOptions}
                cinemaOptions={QUICK_BOOK_CINEMAS}
                dateOptions={dateOptions}
                timeOptions={QUICK_BOOK_TIMES}
                selectedMovie={selectedMovie}
                selectedCinema={selectedCinema}
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                onMovieChange={setSelectedMovie}
                onCinemaChange={setSelectedCinema}
                onDateChange={setSelectedDate}
                onTimeChange={setSelectedTime}
                onSubmit={handleQuickBookSubmit}
              />

              <TabbedMenu tabs={TAB_ITEMS} activeTabId={activeTab} onTabChange={setActiveTab} />

              <section className="space-y-6" aria-label={`${TAB_ITEMS.find((tab) => tab.id === activeTab)?.label} section`}>
                <h2 className="text-2xl font-semibold uppercase tracking-[0.3em] text-white">
                  {TAB_ITEMS.find((tab) => tab.id === activeTab)?.label}
                </h2>
                {renderActiveTabContent()}
              </section>
            </>
          )}
        </div>
      </main>

      <div className="pointer-events-none relative -mt-14 flex justify-end px-4 sm:px-6 lg:px-8">
        <div className="pointer-events-auto">
          <FloatingCtas />
        </div>
      </div>

      <Footer />
    </div>
  );
}
