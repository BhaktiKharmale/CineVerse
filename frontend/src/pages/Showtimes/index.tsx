// src/pages/Showtimes/index.tsx
import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../../components/layout/Navbar";
import Footer from "../../components/layout/Footer";
import movieService, { ShowtimesResponse, filterAvailableShowtimesGrouped } from "../../services/movieService";
import Loader from "../../components/common/Loader";
import { DateStrip } from "../../components/showtimes/DateStrip";
import { LegendBar } from "../../components/showtimes/LegendBar";
import { ViewToggle } from "../../components/showtimes/ViewToggle";
import { CinemaCard } from "../../components/showtimes/CinemaCard";

interface CinemaShowtime {
  cinemaId: number;
  cinemaName: string;
  cinemaLocation?: string;
  showtimes: Array<{
    showtimeId: number;
    movieId: number;
    movieTitle: string;
    startTime: string;
    language?: string;
    format?: string;
    price?: number;
    availableSeats: number;
    status: string;
  }>;
}

const buildDateOptions = (days = 6) => {
  const today = new Date();
  return Array.from({ length: days }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    const isToday = index === 0;
    const weekday = date.toLocaleDateString("en-IN", { weekday: "short" });
    const monthLabel = date.toLocaleDateString("en-IN", { month: "short" });
    const dayLabel = date.getDate().toString();
    
    return {
      value: date.toISOString().split("T")[0],
      label: isToday ? "Today" : weekday,
      display: `${monthLabel} ${dayLabel}`,
      isToday,
    };
  });
};

export default function ShowtimesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const selectedDate = searchParams.get("date") || dateOptions[0].value;
  const selectedMovieId = searchParams.get("movieId") || "";
  const selectedCity = searchParams.get("city") || "";
  
  const [movies, setMovies] = useState<any[]>([]);
  const [cinemaShowtimes, setCinemaShowtimes] = useState<CinemaShowtime[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // UI State
  const [activeView, setActiveView] = useState<"cinemas" | "movies">("cinemas");
  const [searchQuery, setSearchQuery] = useState("");

  const handleViewChange = (view: "cinemas" | "movies") => {
    if (view === "movies") {
      // Movies view not implemented yet - show a friendly toast
      alert("Movies view coming soon! 🎬");
      return;
    }
    setActiveView(view);
  };

  // Fetch movies on mount
  useEffect(() => {
    const fetchMovies = async () => {
      try {
        const moviesData = await movieService.getMovies();
        setMovies(moviesData);
      } catch (err) {
        console.error("[Showtimes] Failed to fetch movies", err);
      }
    };
    fetchMovies();
  }, []);

  // Fetch showtimes when date/movie changes
  const fetchShowtimes = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const cinemaMap = new Map<number, CinemaShowtime>();
      
      // Determine which movies to fetch
      const moviesToFetch = selectedMovieId
        ? movies.filter((m) => m.id.toString() === selectedMovieId)
        : movies;
      
      if (moviesToFetch.length === 0) {
        setCinemaShowtimes([]);
        setLoading(false);
        return;
      }
      
      // Fetch showtimes for each movie
      await Promise.all(
        moviesToFetch.map(async (movie) => {
          try {
            const params: any = { date: selectedDate };
            if (selectedCity) params.city = selectedCity;
            
            console.log(`🎬 Fetching showtimes for movie ${movie.id} (${movie.title})`);
            
            const response: ShowtimesResponse = await movieService.getShowtimesGrouped(
              movie.id,
              params
            );
            
            if (!response || !response.theatres || !Array.isArray(response.theatres)) {
              return;
            }
            
            const filteredResponse = filterAvailableShowtimesGrouped(response);
            
            // Group by cinema
            filteredResponse.theatres.forEach((theatre) => {
              const cinemaId = theatre.theatre_id;
              
              if (!cinemaMap.has(cinemaId)) {
                cinemaMap.set(cinemaId, {
                  cinemaId,
                  cinemaName: theatre.theatre_name,
                  cinemaLocation: theatre.location,
                  showtimes: [],
                });
              }
              
              const cinema = cinemaMap.get(cinemaId)!;
              
              theatre.times.forEach((time) => {
                cinema.showtimes.push({
                  showtimeId: time.showtime_id,
                  movieId: movie.id,
                  movieTitle: movie.title,
                  startTime: time.start_time,
                  language: time.language,
                  format: time.format,
                  price: time.price,
                  availableSeats: time.available_seats,
                  status: time.status,
                });
              });
            });
          } catch (err) {
            console.error(`[Showtimes] Failed to fetch for movie ${movie.id}`, err);
          }
        })
      );
      
      // Convert to array and sort showtimes within each cinema
      const cinemasArray = Array.from(cinemaMap.values());
      cinemasArray.forEach((cinema) => {
        cinema.showtimes.sort((a, b) => {
          return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
        });
      });
      
      setCinemaShowtimes(cinemasArray);
    } catch (err: any) {
      console.error("[Showtimes] Failed to fetch showtimes", err);
      
      let errorMessage = "Unable to load showtimes. Please try again.";
      if (err?.response?.status === 404) {
        errorMessage = "No showtimes found for the selected date.";
      } else if (err?.response?.status === 500) {
        errorMessage = "Server error. Please try again later.";
      } else if (err?.message?.includes('CORS')) {
        errorMessage = "Connection error. Please check your network.";
      } else if (err?.message) {
        errorMessage = `Error: ${err.message}`;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [selectedDate, selectedMovieId, selectedCity, movies]);
    
  useEffect(() => {
    if (movies.length > 0) {
      fetchShowtimes();
    }
  }, [fetchShowtimes, movies.length]);

  // Apply search filter
  const filteredCinemas = useMemo(() => {
    if (!searchQuery.trim()) return cinemaShowtimes;
    
    const query = searchQuery.toLowerCase();
    return cinemaShowtimes.filter((cinema) =>
      cinema.cinemaName.toLowerCase().includes(query) ||
      cinema.cinemaLocation?.toLowerCase().includes(query)
    );
  }, [cinemaShowtimes, searchQuery]);

  const handleDateChange = (date: string) => {
    const params = new URLSearchParams(searchParams);
    params.set("date", date);
    setSearchParams(params);
  };

  const handleShowtimeClick = (showtimeId: number, movieId: number) => {
    navigate(`/seats?showtimeId=${showtimeId}`, { state: { movieId } });
  };

  const handleResetDate = () => {
    const params = new URLSearchParams(searchParams);
    params.set("date", dateOptions[0].value);
    setSearchParams(params);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white text-gray-900">
      <Navbar />
      
      <main className="flex-1">
        {/* Header Band - Sticky with warm background */}
        <div className="sticky top-0 z-20 bg-gradient-to-b from-[#FFF1D9] to-[#FFECCC] border-b border-gray-200 shadow-sm">
          <div className="max-w-[1400px] mx-auto px-6 py-5">
            {/* Title and Toggle */}
            <div className="flex items-center justify-between mb-5">
              <h1 className="text-4xl font-extrabold text-gray-900" style={{ fontWeight: 800 }}>
                Showtimings
              </h1>
              <ViewToggle activeView={activeView} onChange={handleViewChange} />
            </div>
            
            {/* Date Strip */}
            <div className="mb-5">
              <DateStrip
                dates={dateOptions}
                selected={selectedDate}
                onChange={handleDateChange}
              />
            </div>

            {/* Search and Legend Row */}
            <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 pb-4 border-b border-gray-300">
              {/* Search Box */}
              <div className="relative w-full lg:w-auto lg:min-w-[400px]">
                <svg
                  className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search for cinema"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 bg-white border border-gray-300 rounded-lg text-gray-900 placeholder-gray-500 focus:outline-none focus:border-gray-500 focus:ring-1 focus:ring-gray-500 transition"
                />
              </div>

              {/* Legend */}
              <div className="w-full lg:w-auto">
                <LegendBar />
              </div>
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className="max-w-[1400px] mx-auto px-6 py-8">
          {loading && (
            <div className="flex justify-center items-center min-h-[400px]">
              <Loader />
            </div>
          )}
          
          {!loading && error && (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center py-12 px-4">
              <div className="bg-red-50 border border-red-200 rounded-xl p-6 max-w-md">
                <p className="text-red-700 mb-4 font-medium">{error}</p>
                <button
                  onClick={() => fetchShowtimes()}
                  className="px-6 py-3 bg-[#f6c800] text-black rounded-lg font-semibold hover:bg-[#e5b700] transition shadow-md"
                >
                  Retry
                </button>
              </div>
            </div>
          )}
          
          {!loading && !error && filteredCinemas.length === 0 && (
            <div className="flex flex-col items-center justify-center min-h-[400px] text-center py-12">
              <div className="bg-gray-50 border border-gray-200 rounded-xl p-8 max-w-md">
                <p className="text-gray-600 mb-4 text-lg">
                  {searchQuery.trim() 
                    ? `No cinemas found matching "${searchQuery}"`
                    : `No showtimes for this date in ${selectedCity || 'your city'}`
                  }
                </p>
                {!searchQuery.trim() && (
                  <button
                    onClick={handleResetDate}
                    className="px-6 py-3 bg-[#f6c800] text-black rounded-lg font-semibold hover:bg-[#e5b700] transition shadow-md"
                  >
                    Reset Date
                  </button>
                )}
              </div>
            </div>
          )}
          
          {!loading && !error && filteredCinemas.length > 0 && (
            <div className="space-y-6">
              {filteredCinemas.map((cinema) => (
                <CinemaCard
                  key={cinema.cinemaId}
                  cinemaId={cinema.cinemaId}
                  cinemaName={cinema.cinemaName}
                  cinemaLocation={cinema.cinemaLocation}
                  distance="24.1 km away"
                  showtimes={cinema.showtimes}
                  onShowtimeClick={handleShowtimeClick}
                />
              ))}
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}
