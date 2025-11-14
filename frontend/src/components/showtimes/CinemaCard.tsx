// frontend/src/components/showtimes/CinemaCard.tsx
import React, { useState } from "react";

interface Showtime {
  showtimeId: number;
  movieId: number;
  movieTitle: string;
  startTime: string;
  language?: string;
  format?: string;
  price?: number;
  availableSeats: number;
  status: string;
}

interface CinemaCardProps {
  cinemaId: number;
  cinemaName: string;
  cinemaLocation?: string;
  distance?: string;
  showtimes: Showtime[];
  onShowtimeClick: (showtimeId: number, movieId: number) => void;
}

export const CinemaCard: React.FC<CinemaCardProps> = ({
  cinemaName,
  cinemaLocation,
  distance,
  showtimes,
  onShowtimeClick,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Group showtimes by movie
  const movieGroups = showtimes.reduce((acc, showtime) => {
    if (!acc[showtime.movieId]) {
      acc[showtime.movieId] = {
        movieId: showtime.movieId,
        movieTitle: showtime.movieTitle,
        showtimes: [],
      };
    }
    acc[showtime.movieId].showtimes.push(showtime);
    return acc;
  }, {} as Record<number, { movieId: number; movieTitle: string; showtimes: Showtime[] }>);

  // Group showtimes within each movie by format
  const groupByFormat = (movieShowtimes: Showtime[]) => {
    return movieShowtimes.reduce((acc, showtime) => {
      const language = showtime.language?.toUpperCase() || "";
      const format = showtime.format?.toUpperCase() || "";
      const formatKey = [language, format].filter(Boolean).join("-") || "STANDARD";
      if (!acc[formatKey]) {
        acc[formatKey] = [];
      }
      acc[formatKey].push(showtime);
      return acc;
    }, {} as Record<string, Showtime[]>);
  };

  const formatTime = (isoTime: string) => {
    const date = new Date(isoTime);
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  const getStatusStyle = (status: string, availableSeats: number) => {
    if (status === "SOLD_OUT" || status === "sold_out" || availableSeats === 0) {
      return "bg-red-50 border-2 border-red-500 text-red-600 cursor-not-allowed";
    }
    if (status === "lapsed") {
      return "bg-gray-50 border-2 border-gray-400 text-gray-500 cursor-not-allowed";
    }
    if (status === "filling_fast" || availableSeats < 20) {
      return "bg-amber-50 border-2 border-amber-500 text-amber-600 hover:bg-amber-100 cursor-pointer";
    }
    return "bg-green-50 border-2 border-green-500 text-green-600 hover:bg-green-100 cursor-pointer";
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
      {/* Cinema Header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 mb-1" style={{ fontSize: '20px', fontWeight: 700 }}>
              {cinemaName}
            </h2>
            {cinemaLocation && (
              <p className="text-sm text-gray-600 leading-relaxed">{cinemaLocation}</p>
            )}
          </div>
          <div className="flex items-center gap-3 ml-4">
            {distance && (
              <span className="text-sm text-gray-600 whitespace-nowrap font-medium">{distance}</span>
            )}
            <div className="flex items-center gap-2">
              {/* Directions icon */}
              <button
                className="p-2 hover:bg-gray-100 rounded-lg transition"
                title="Get Directions"
                aria-label="Get directions"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              {/* Favorite icon */}
              <button
                className="p-2 hover:bg-gray-100 rounded-lg transition"
                title="Add to Favorites"
                aria-label="Add to favorites"
              >
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </button>
              {/* Collapse toggle */}
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
                title={isCollapsed ? "Expand" : "Collapse"}
                aria-label={isCollapsed ? "Expand cinema details" : "Collapse cinema details"}
              >
                <svg
                  className={`w-5 h-5 text-gray-600 transition-transform ${isCollapsed ? "rotate-180" : ""}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Horizontal Divider */}
      {!isCollapsed && <div className="border-t border-gray-200"></div>}

      {/* Movies & Showtimes */}
      {!isCollapsed && (
        <div className="p-6 pt-4 space-y-6">
          {Object.values(movieGroups).map((movieGroup) => {
            const formatGroups = groupByFormat(movieGroup.showtimes);

            return (
              <div key={movieGroup.movieId}>
                {/* Movie Title Row */}
                <div className="mb-4">
                  <h3 className="text-base font-bold text-gray-900 uppercase tracking-wide mb-2">
                    {movieGroup.movieTitle} (UA 16+)
                  </h3>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span>1h 48m</span>
                    <span>•</span>
                    <span>English, Tamil</span>
                    <span>•</span>
                    <span>ActionSci-Fi</span>
                  </div>
                </div>

                {/* Format Groups */}
                <div className="space-y-5">
                  {Object.entries(formatGroups).map(([formatKey, formatShowtimes]) => (
                    <div key={formatKey}>
                      {/* Format Header */}
                      <div className="mb-3">
                        <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">
                          {formatKey === "ATMOS" ? "[ATMOS]" : formatKey}
                        </span>
                      </div>

                      {/* Time Pills */}
                      <div className="flex flex-wrap gap-3">
                        {formatShowtimes.map((showtime) => {
                          const isSoldOut = showtime.status === "SOLD_OUT" || showtime.status === "sold_out" || showtime.availableSeats === 0;
                          const isLapsed = showtime.status === "lapsed";
                          const statusStyle = getStatusStyle(showtime.status, showtime.availableSeats);

                          return (
                            <button
                              key={showtime.showtimeId}
                              onClick={() => !(isSoldOut || isLapsed) && onShowtimeClick(showtime.showtimeId, showtime.movieId)}
                              disabled={isSoldOut || isLapsed}
                              className={`flex flex-col items-center justify-center px-6 py-3 rounded-xl transition-all font-semibold ${statusStyle}`}
                              style={{ minWidth: '120px', height: '48px' }}
                              aria-label={`Select showtime ${formatTime(showtime.startTime)} at ${cinemaName}`}
                            >
                              <span className="text-base font-bold leading-none">
                                {formatTime(showtime.startTime)}
                              </span>
                              {showtime.price && (
                                <span className="text-xs mt-1 opacity-80">
                                  ₹{showtime.price}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
