import React from "react";

interface CinemasHeaderProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

const CinemasHeader: React.FC<CinemasHeaderProps> = ({
  searchQuery,
  onSearchChange,
}) => {
  return (
    <section className="space-y-6 rounded-3xl border border-[#1f1f25] bg-gradient-to-br from-[#101018] via-[#0d0d12] to-[#151521] p-6 shadow-[0_35px_90px_-60px_rgba(246,200,0,0.55)]">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.35em] text-white md:text-4xl">
            Cinemas
          </h1>
          <p className="max-w-2xl text-sm text-gray-400">
            Browse the latest films lighting up CineVerse screens near you. Search by title and jump straight into the movie details you want to explore.
          </p>
        </div>
      </header>

      <div className="flex w-full items-center gap-3 rounded-full border border-[#1f1f25] bg-[#111118] px-4 py-2">
        <svg
          className="h-5 w-5 text-gray-500"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35m0 0a7.5 7.5 0 1 0-10.607-10.607 7.5 7.5 0 0 0 10.607 10.607Z" />
        </svg>
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search movie title"
          className="w-full bg-transparent text-sm text-gray-100 placeholder:text-gray-500 focus:outline-none"
          aria-label="Search movies"
        />
      </div>
    </section>
  );
};

export default CinemasHeader;