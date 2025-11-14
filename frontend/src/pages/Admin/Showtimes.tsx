import React, { useEffect, useState } from "react";
import { CalendarClock, Loader2, Sparkle } from "lucide-react";
import toast from "react-hot-toast";
import AdminHeader from "../../components/admin/AdminHeader";
import { useAdminLayout } from "./hooks/useAdminLayout";
import axiosClient from "../../api/axiosClient";

interface OptionItem {
  label: string;
  value: number;
}

interface ShowtimeFormState {
  movie_id: string;
  screen_id: string;
  show_date: string;
  show_time: string;
  language: string;
  format: string;
  base_price: string;
}

const defaultState: ShowtimeFormState = {
  movie_id: "",
  screen_id: "",
  show_date: "",
  show_time: "",
  language: "",
  format: "2D",
  base_price: "",
};

const AdminShowtimesPage: React.FC = () => {
  const { openSidebar } = useAdminLayout();
  const [movies, setMovies] = useState<OptionItem[]>([]);
  const [screens, setScreens] = useState<OptionItem[]>([]);
  const [formState, setFormState] = useState(defaultState);
  const [creating, setCreating] = useState(false);
  const [ensureId, setEnsureId] = useState("");
  const [ensuring, setEnsuring] = useState(false);

  useEffect(() => {
    const loadOptions = async () => {
      try {
        const [moviesRes, screensRes] = await Promise.all([
          axiosClient.get<any[]>("/admin/movies"),
          axiosClient.get<any[]>("/admin/screens"),
        ]);
        setMovies(
          (moviesRes.data || []).map((movie) => ({
            label: movie.title,
            value: movie.id,
          })),
        );
        setScreens(
          (screensRes.data || []).map((screen) => ({
            label: screen.name,
            value: screen.id,
          })),
        );
      } catch (error: any) {
        console.error("[AdminShowtimes] Failed to load options", error);
        toast.error(error?.response?.data?.detail || "Unable to load movies and screens");
      }
    };

    loadOptions();
  }, []);

  const handleChange = (key: keyof ShowtimeFormState, value: string) => {
    setFormState((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreateShowtime = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreating(true);

    try {
      const payload = {
        movie_id: Number(formState.movie_id),
        screen_id: Number(formState.screen_id),
        show_date: formState.show_date,
        show_time: formState.show_time,
        language: formState.language,
        format: formState.format,
        base_price: parseFloat(formState.base_price || "0"),
      };

      const response = await axiosClient.post("/admin/showtimes", payload);
      const showtimeId = response.data?.showtime_id || response.data?.id;
      toast.success(
        showtimeId ? `Showtime created (ID: ${showtimeId})` : "Showtime created successfully",
      );
      setFormState(defaultState);
    } catch (error: any) {
      console.error("[AdminShowtimes] Create failed", error);
      toast.error(error?.response?.data?.detail || "Unable to create showtime");
    } finally {
      setCreating(false);
    }
  };

  const handleEnsureSeats = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ensureId) return;
    setEnsuring(true);
    try {
      await axiosClient.post(`/admin/showtimes/${ensureId}/ensure-seats`, {});
      toast.success(`Seat inventory ensured for showtime ${ensureId}`);
      setEnsureId("");
    } catch (error: any) {
      console.error("[AdminShowtimes] Ensure seats failed", error);
      toast.error(error?.response?.data?.detail || "Unable to ensure seats");
    } finally {
      setEnsuring(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader
        title="Showtimes"
        subtitle="Schedule screenings and sync seat inventory"
        onToggleSidebar={openSidebar}
      />

      <div className="flex-1 overflow-y-auto bg-[#0d0d14] px-6 py-8 text-gray-200">
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_80px_-60px_rgba(246,200,0,0.35)]">
            <header className="flex items-center gap-3 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f6c800]/15 text-[#f6c800]">
                <CalendarClock size={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-white">Create Showtimes</h2>
                <p className="text-xs text-gray-400">Pick a movie, auditorium, language and price.</p>
              </div>
            </header>
            <form onSubmit={handleCreateShowtime} className="grid gap-4">
              <SelectField
                label="Movie"
                value={formState.movie_id}
                onChange={(value) => handleChange("movie_id", value)}
                options={movies}
                placeholder="Select movie"
                required
              />
              <SelectField
                label="Screen"
                value={formState.screen_id}
                onChange={(value) => handleChange("screen_id", value)}
                options={screens}
                placeholder="Select screen"
                required
              />
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Date"
                  type="date"
                  value={formState.show_date}
                  onChange={(value) => handleChange("show_date", value)}
                  required
                />
                <Field
                  label="Time"
                  type="time"
                  value={formState.show_time}
                  onChange={(value) => handleChange("show_time", value)}
                  required
                />
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field
                  label="Language"
                  placeholder="English"
                  value={formState.language}
                  onChange={(value) => handleChange("language", value)}
                  required
                />
                <Field
                  label="Format"
                  placeholder="2D"
                  value={formState.format}
                  onChange={(value) => handleChange("format", value)}
                />
              </div>
              <Field
                label="Base Price"
                type="number"
                placeholder="250"
                value={formState.base_price}
                onChange={(value) => handleChange("base_price", value)}
              />
              <button
                type="submit"
                disabled={creating}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#f6c800] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[#ffd836] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] disabled:cursor-not-allowed disabled:bg-gray-500"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Sparkle size={16} />}
                {creating ? "Scheduling..." : "Schedule Showtime"}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_80px_-60px_rgba(246,200,0,0.35)]">
            <header className="pb-4">
              <h2 className="text-lg font-semibold text-white">Ensure Showtime Seats</h2>
              <p className="text-xs text-gray-400">
                Trigger backend seat reconciliation to guarantee the seat map exists for a newly created showtime.
              </p>
            </header>
            <form onSubmit={handleEnsureSeats} className="space-y-4">
              <Field
                label="Showtime ID"
                value={ensureId}
                onChange={setEnsureId}
                placeholder="Enter showtime id"
                required
              />
              <button
                type="submit"
                disabled={ensuring || !ensureId}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#f6c800]/70 px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#f6c800]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {ensuring && <Loader2 size={16} className="animate-spin" />}
                Ensure Seats
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminShowtimesPage;

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, placeholder, type = "text", required = false }) => (
  <label className="flex flex-col gap-2 text-sm text-gray-300">
    <span>{label}</span>
    <input
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
    />
  </label>
);

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: OptionItem[];
  placeholder?: string;
  required?: boolean;
}

const SelectField: React.FC<SelectFieldProps> = ({ label, value, onChange, options, placeholder, required }) => (
  <label className="flex flex-col gap-2 text-sm text-gray-300">
    <span>{label}</span>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
    >
      <option value="" disabled>
        {placeholder || "Select"}
      </option>
      {options.map((option) => (
        <option key={option.value} value={option.value} className="bg-[#0f0f16]">
          {option.label}
        </option>
      ))}
    </select>
  </label>
);
