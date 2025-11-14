import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useShowtimeModal } from "../../context/ShowtimeModalContext";
import MovieCard from "../movies/MovieCard";

export interface CarouselMovie {
  id: number;
  title: string;
  poster_url?: string;
  poster?: string;
  promoted?: boolean;
  language?: string;
}

interface NowShowingCarouselProps {
  movies: CarouselMovie[];
  emptyMessage?: string;
}

export const NowShowingCarousel: React.FC<NowShowingCarouselProps> = React.memo(({ movies, emptyMessage }) => {
  // 🔍 DIAGNOSTIC: Track render count
  console.count("🔄 NowShowingCarousel render");
  console.log("📽️ NowShowingCarousel movies count:", movies.length);
  
  const navigate = useNavigate();
  const { openModal } = useShowtimeModal();

  const handleOpenDetails = useCallback(
    (movieId: number) => {
      navigate(`/movie/${movieId}`);
    },
    [navigate],
  );

  if (!movies || movies.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-[#2a2a30] bg-[#15151a] p-10 text-center text-sm text-gray-400">
        {emptyMessage || "No titles are available right now. Please check back soon."}
      </div>
    );
  }

  const renderCard = (movie: CarouselMovie) => (
    <MovieCard
      key={movie.id}
      movie={movie}
      badgeLabel={movie.promoted ? "New Release" : undefined}
      metaText={movie.language}
      onCardClick={() => handleOpenDetails(movie.id)}
      action={{
        label: "Book",
        ariaLabel: `Book showtimes for ${movie.title}`,
        onClick: (event) => {
          event.preventDefault();
          openModal(movie as any);
        },
      }}
    />
  );

  return (
    <div className="relative">
      <div className="hidden gap-6 md:grid md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {movies.map(renderCard)}
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4 md:hidden" aria-label="Movie carousel">
        {movies.map((movie) => (
          <div key={`mobile-${movie.id}`} className="min-w-[190px] flex-1 basis-1/2">
            {renderCard(movie)}
          </div>
        ))}
      </div>
    </div>
  );
});

NowShowingCarousel.displayName = "NowShowingCarousel";

export default NowShowingCarousel;

