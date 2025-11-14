import React from "react";

type QuickBookMode = "movie" | "cinema";

interface QuickBookBarProps {
  mode: QuickBookMode;
  onModeChange: (mode: QuickBookMode) => void;
  movieOptions: { label: string; value: string | number }[];
  cinemaOptions: { label: string; value: string }[];
  dateOptions: { label: string; value: string }[];
  timeOptions: { label: string; value: string }[];
  selectedMovie: string | number | "";
  selectedCinema: string;
  selectedDate: string;
  selectedTime: string;
  onMovieChange: (value: string) => void;
  onCinemaChange: (value: string) => void;
  onDateChange: (value: string) => void;
  onTimeChange: (value: string) => void;
  onSubmit: () => void;
}

export const QuickBookBar: React.FC<QuickBookBarProps> = ({
  mode,
  onModeChange,
  movieOptions,
  cinemaOptions,
  dateOptions,
  timeOptions,
  selectedMovie,
  selectedCinema,
  selectedDate,
  selectedTime,
  onMovieChange,
  onCinemaChange,
  onDateChange,
  onTimeChange,
  onSubmit,
}) => {
  const renderSelect = (
    id: string,
    label: string,
    value: string | number | "",
    onChange: (value: string) => void,
    options: { label: string; value: string | number }[],
  ) => (
    <label className="w-full space-y-2 text-sm font-medium text-gray-300" htmlFor={id}>
      <span className="uppercase tracking-[0.2em] text-xs text-gray-500">{label}</span>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-2xl border border-[#2a2a30] bg-[#24242a] px-4 py-3 text-sm text-white shadow-[inset_0_0_20px_rgba(0,0,0,0.35)] outline-none transition focus:border-[#f6c800] focus:shadow-[0_0_0_1px_rgba(246,200,0,0.25)]"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} className="bg-[#18181c] text-gray-200">
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section
      className="rounded-3xl border border-[#1f1f25] bg-[#1a1a1f]/80 p-6 shadow-[0_50px_120px_-80px_rgba(246,200,0,0.5)] backdrop-blur-xl"
      aria-label="Quick book tickets"
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-base font-semibold uppercase tracking-[0.3em] text-white">Quick Book</span>
          <div className="flex items-center gap-2 rounded-full border border-[#2a2a30] bg-[#15151a] p-1">
            {(["movie", "cinema"] as QuickBookMode[]).map((modeValue) => {
              const isActive = modeValue === mode;
              return (
                <button
                  key={modeValue}
                  type="button"
                  onClick={() => onModeChange(modeValue)}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize transition ${
                    isActive
                      ? "bg-[#f6c800] text-black shadow-[0_8px_24px_rgba(246,200,0,0.35)]"
                      : "text-gray-400 hover:text-white"
                  }`}
                  aria-pressed={isActive}
                  aria-label={`Quick book by ${modeValue}`}
                >
                  {modeValue}
                </button>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={onSubmit}
          className="inline-flex items-center justify-center rounded-full bg-[#f6c800] px-6 py-2.5 text-sm font-semibold uppercase tracking-[0.3em] text-black shadow-[0_15px_40px_-15px_rgba(246,200,0,0.7)] transition hover:-translate-y-[1px] hover:shadow-[0_20px_50px_-20px_rgba(246,200,0,0.85)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
          aria-label="Proceed to book with selected filters"
        >
          Book
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {renderSelect(
          "quick-book-movie",
          mode === "movie" ? "Select Movie" : "Select Experience",
          selectedMovie,
          onMovieChange,
          movieOptions.length > 0 ? movieOptions : [{ label: "Select a movie", value: "" }],
        )}
        {renderSelect("quick-book-date", "Date", selectedDate, onDateChange, dateOptions)}
        {renderSelect(
          "quick-book-cinema",
          "Cinema",
          selectedCinema,
          onCinemaChange,
          cinemaOptions.length > 0 ? cinemaOptions : [{ label: "Select cinema", value: "" }],
        )}
        {renderSelect("quick-book-time", "Timing", selectedTime, onTimeChange, timeOptions)}
      </div>
    </section>
  );
};

export default QuickBookBar;

