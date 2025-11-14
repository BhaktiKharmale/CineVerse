import React, { useEffect, useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import toast from "react-hot-toast";
import AdminHeader from "../../components/admin/AdminHeader";
import { useAdminLayout } from "./hooks/useAdminLayout";
import axiosClient from "../../api/axiosClient";
import SeatMatrixViewer, { SeatMatrixSeat } from "../../components/admin/SeatMatrixViewer";

interface ScreenOption {
  label: string;
  value: number;
}

const AdminSeatToolsPage: React.FC = () => {
  const { openSidebar } = useAdminLayout();
  const [screens, setScreens] = useState<ScreenOption[]>([]);
  const [selectedScreen, setSelectedScreen] = useState("");
  const [seats, setSeats] = useState<SeatMatrixSeat[]>([]);
  const [loadingSeats, setLoadingSeats] = useState(false);
  const [ensureId, setEnsureId] = useState("");
  const [ensuring, setEnsuring] = useState(false);

  useEffect(() => {
    const loadScreens = async () => {
      try {
        const response = await axiosClient.get<any[]>("/admin/screens");
        setScreens((response.data || []).map((screen) => ({ label: screen.name, value: screen.id })));
      } catch (error: any) {
        console.error("[SeatTools] Failed to load screens", error);
        toast.error(error?.response?.data?.detail || "Unable to load screens");
      }
    };

    loadScreens();
  }, []);

  const handleLoadSeats = async () => {
    if (!selectedScreen) return;
    setLoadingSeats(true);
    try {
      const response = await axiosClient.get<{ seats: SeatMatrixSeat[] } | SeatMatrixSeat[]>(`/admin/screens/${selectedScreen}/seats`);
      const raw = response.data;
      const resolvedSeats = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.seats) ? (raw as any).seats : [];
      setSeats(resolvedSeats);
      if (!resolvedSeats.length) {
        toast("No seats returned for this screen.");
      }
    } catch (error: any) {
      console.error("[SeatTools] Seat fetch failed", error);
      toast.error(error?.response?.data?.detail || "Unable to load seats");
      setSeats([]);
    } finally {
      setLoadingSeats(false);
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
      console.error("[SeatTools] Ensure seats failed", error);
      toast.error(error?.response?.data?.detail || "Unable to ensure seats");
    } finally {
      setEnsuring(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader
        title="Seat Tools"
        subtitle="Inspect seat layouts and synchronise showtime availability"
        onToggleSidebar={openSidebar}
      />

      <div className="flex-1 overflow-y-auto bg-[#0d0d14] px-6 py-8 text-gray-200">
        <div className="grid gap-8 xl:grid-cols-2">
          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_80px_-60px_rgba(246,200,0,0.35)]">
            <header className="flex items-center gap-3 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f6c800]/15 text-[#f6c800]">
                <LayoutGrid size={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-white">Get Screen Seats</h2>
                <p className="text-xs text-gray-400">Visualise the seat matrix currently stored for a screen.</p>
              </div>
            </header>
            <div className="space-y-4">
              <label className="flex flex-col gap-2 text-sm text-gray-300">
                <span>Screen</span>
                <select
                  value={selectedScreen}
                  onChange={(event) => setSelectedScreen(event.target.value)}
                  className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
                >
                  <option value="" disabled>
                    Select screen
                  </option>
                  {screens.map((screen) => (
                    <option key={screen.value} value={screen.value} className="bg-[#0f0f16]">
                      {screen.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={handleLoadSeats}
                disabled={!selectedScreen || loadingSeats}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-[#f6c800]/70 px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#f6c800]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingSeats && <Rows3 size={16} className="animate-spin" />}
                Load Seats
              </button>
              <SeatMatrixViewer seats={seats} loading={loadingSeats} emptyLabel="Select a screen to view its seats." />
            </div>
          </section>

          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_80px_-60px_rgba(246,200,0,0.35)]">
            <header className="pb-4">
              <h2 className="text-lg font-semibold text-white">Ensure Showtime Seats</h2>
              <p className="text-xs text-gray-400">Recreate seat rows for a showtime if they are missing or out-of-sync.</p>
            </header>
            <form onSubmit={handleEnsureSeats} className="space-y-4">
              <label className="flex flex-col gap-2 text-sm text-gray-300">
                <span>Showtime ID</span>
                <input
                  type="text"
                  value={ensureId}
                  onChange={(event) => setEnsureId(event.target.value)}
                  placeholder="Enter showtime id"
                  required
                  className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
                />
              </label>
              <button
                type="submit"
                disabled={ensuring || !ensureId}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f6c800] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[#ffd836] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] disabled:cursor-not-allowed disabled:bg-gray-500"
              >
                {ensuring ? "Ensuring..." : "Ensure Seats"}
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminSeatToolsPage;
