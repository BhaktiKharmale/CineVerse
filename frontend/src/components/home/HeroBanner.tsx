import React, { useEffect, useMemo, useState } from "react";

export interface HeroSlide {
  id: string | number;
  movieId: string | number;
  title: string;
  summary?: string;
  posterUrl: string;
  certification?: string;
  durationLabel?: string;
  releaseDateLabel?: string;
  genres?: string[];
  languages?: string[];
  badge?: string;
}

interface HeroBannerProps {
  slides: HeroSlide[];
  onBook: (movieId: string | number) => void;
}

const SLIDE_INTERVAL_MS = 5000;

export const HeroBanner: React.FC<HeroBannerProps> = ({ slides, onBook }) => {
  const [index, setIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const hasSlides = slides.length > 0;
  const safeIndex = useMemo(() => {
    if (!hasSlides) return 0;
    return index % slides.length;
  }, [hasSlides, index, slides.length]);

  useEffect(() => {
    if (!hasSlides) {
      return;
    }

    if (isPaused) {
      return;
    }

    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, SLIDE_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [hasSlides, isPaused, slides.length]);

  if (!hasSlides) {
    return null;
  }

  const activeSlide = slides[safeIndex];

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-[#1f1f25] bg-[#0b0b0f] text-white shadow-[0_40px_120px_-60px_rgba(246,200,0,0.35)]"
      aria-label="Featured movies hero banner"
    >
      <div
        className="absolute inset-0"
        aria-hidden="true"
        style={{
          backgroundImage: `linear-gradient(90deg, rgba(11,11,15,0.95) 0%, rgba(11,11,15,0.65) 45%, rgba(11,11,15,0.4) 65%, rgba(11,11,15,0.1) 100%), url(${activeSlide.posterUrl})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          filter: "blur(0.5px)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-br from-black/60 via-black/30 to-transparent" aria-hidden="true" />

      <div
        className="relative flex flex-col gap-10 p-8 sm:p-12 lg:flex-row lg:items-center lg:justify-between"
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        <div className="max-w-xl space-y-6">
          <span className="inline-flex items-center rounded-full border border-[#f6c800]/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#f6c800]/90 backdrop-blur-sm">
            {activeSlide.badge || "New Release"}
          </span>

          <h1 className="text-4xl font-black uppercase tracking-wide text-white sm:text-5xl lg:text-6xl">
            {activeSlide.title}
          </h1>

          <div className="flex flex-wrap gap-3 text-sm text-gray-300">
            {activeSlide.certification && (
              <span className="inline-flex items-center rounded-full border border-[#2a2a30] bg-[#15151a] px-3 py-1 font-semibold uppercase text-xs">
                {activeSlide.certification}
              </span>
            )}
            {activeSlide.durationLabel && (
              <span className="inline-flex items-center rounded-full border border-[#2a2a30] bg-[#15151a] px-3 py-1">
                {activeSlide.durationLabel}
              </span>
            )}
            {activeSlide.releaseDateLabel && (
              <span className="inline-flex items-center rounded-full border border-[#2a2a30] bg-[#15151a] px-3 py-1">
                {activeSlide.releaseDateLabel}
              </span>
            )}
            {activeSlide.genres && activeSlide.genres.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-[#2a2a30] bg-[#15151a] px-3 py-1">
                {activeSlide.genres.join(" • ")}
              </span>
            )}
            {activeSlide.languages && activeSlide.languages.length > 0 && (
              <span className="inline-flex items-center rounded-full border border-[#2a2a30] bg-[#15151a] px-3 py-1">
                {activeSlide.languages.join(" • ")}
              </span>
            )}
          </div>

          {activeSlide.summary && (
            <p className="text-base text-gray-300 sm:text-lg">{activeSlide.summary}</p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => onBook(activeSlide.movieId)}
              className="inline-flex items-center justify-center rounded-full bg-[#f6c800] px-6 py-3 text-base font-bold uppercase tracking-[0.3em] text-black shadow-[0_25px_60px_-20px_rgba(246,200,0,0.65)] transition hover:translate-y-[1px] hover:shadow-[0_30px_70px_-25px_rgba(246,200,0,0.8)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#f6c800]"
              aria-label={`Book tickets for ${activeSlide.title}`}
            >
              Book
            </button>

            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#2a2a30] bg-[#15151a]">
                <svg
                  className="h-4 w-4 text-[#f6c800]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 3 14 9-14 9V3Z" />
                </svg>
              </span>
              <span>Watch Trailer</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <img
              src={activeSlide.posterUrl}
              alt={activeSlide.title}
              className="h-[420px] w-[280px] rounded-[30px] border border-[#2a2a30] object-cover shadow-[0_0_70px_rgba(246,200,0,0.35)] transition duration-500 hover:scale-[1.02]"
              loading="lazy"
            />

            <button
              type="button"
              aria-label={`Play trailer for ${activeSlide.title}`}
              className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-[#0b0b0f] shadow-[0_0_40px_rgba(246,200,0,0.4)] transition hover:scale-105"
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="m9.5 7 7 5-7 5V7Z" />
              </svg>
            </button>
          </div>

          <span className="text-sm font-medium text-gray-400">
            {safeIndex + 1} / {slides.length}
          </span>
        </div>
      </div>
    </section>
  );
};

export default HeroBanner;

