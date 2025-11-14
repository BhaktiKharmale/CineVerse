import React from "react";
import type { Movie } from "../../libs/types";

export interface MovieCardAction {
  label: string;
  ariaLabel?: string;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
}

export interface MovieCardProps {
  movie: Movie;
  badgeLabel?: string;
  tagLabel?: string;
  metaText?: string;
  description?: string;
  action?: MovieCardAction;
  footerContent?: React.ReactNode;
  onCardClick?: () => void;
  ariaLabel?: string;
  className?: string;
}

function joinClasses(...classes: Array<string | undefined | null | false>) {
  return classes.filter(Boolean).join(" ");
}

const defaultPlaceholder = "/images/placeholder_poster.svg";

const MovieCard: React.FC<MovieCardProps> = React.memo(({
  movie,
  badgeLabel,
  tagLabel,
  metaText,
  description,
  action,
  footerContent,
  onCardClick,
  ariaLabel,
  className,
}) => {
  // 🔍 DIAGNOSTIC: Track render count
  console.count(`🔄 MovieCard render (${movie?.title || movie?.id})`);
  console.log(`🎬 MovieCard (${movie?.title}) poster:`, (movie.poster_url || movie.poster || defaultPlaceholder));
  
  const posterSrc = (movie.poster_url || movie.poster || defaultPlaceholder) as string;
  const handleCardClick = () => {
    if (onCardClick) {
      onCardClick();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!onCardClick) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onCardClick();
    }
  };

  const cardProps = onCardClick
    ? {
        role: "button" as const,
        tabIndex: 0,
        onKeyDown: handleKeyDown,
        "aria-label": ariaLabel || `View details for ${movie.title}`,
      }
    : {};

  return (
    <article
      {...cardProps}
      className={joinClasses(
        "group relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-[#2a2a30] bg-[#18181c] text-left shadow-[0_30px_80px_-60px_rgba(246,200,0,0.35)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_40px_90px_-60px_rgba(246,200,0,0.6)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]",
        className,
      )}
      onClick={handleCardClick}
    >
      <div className="relative block w-full overflow-hidden" aria-hidden={!onCardClick}>
        <img
          src={posterSrc}
          alt={movie.title}
          loading="lazy"
          className="aspect-[2/3] w-full object-cover transition duration-700 group-hover:scale-105"
          onError={(event) => {
            const img = event.target as HTMLImageElement;
            // Prevent infinite loop: only set placeholder if not already set
            if (img.src !== defaultPlaceholder && !img.src.endsWith(defaultPlaceholder)) {
              img.src = defaultPlaceholder;
            }
          }}
        />
        {badgeLabel && (
          <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-[#f6c800]/18 px-2 py-[0.35rem] text-[0.65rem] font-semibold uppercase tracking-[0.25em] text-[#f6c800] backdrop-blur">
            {badgeLabel}
          </span>
        )}
        <span className="pointer-events-none absolute inset-0 rounded-t-3xl border border-transparent transition group-hover:border-[#f6c800]/30" />
      </div>

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-white line-clamp-2">{movie.title}</h3>
          {tagLabel && (
            <p className="text-xs uppercase tracking-[0.28em] text-gray-500">{tagLabel}</p>
          )}
          {metaText && <p className="text-sm text-gray-400 line-clamp-2">{metaText}</p>}
          {description && <p className="text-sm text-gray-500 line-clamp-3">{description}</p>}
        </div>

        {footerContent ? (
          <div className="mt-auto text-sm text-[#f6c800]">{footerContent}</div>
        ) : action ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              action.onClick(event);
            }}
            className="mt-auto inline-flex items-center justify-center rounded-full border border-[#f6c800]/70 px-4 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#f6c800]/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
            aria-label={action.ariaLabel || action.label}
          >
            {action.label}
          </button>
        ) : null}
      </div>
    </article>
  );
});

MovieCard.displayName = "MovieCard";

export default MovieCard;
