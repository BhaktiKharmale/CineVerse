import React, { useEffect, useMemo, useState } from "react";
import { Eye, Pencil, Plus, Trash } from "lucide-react";
import toast from "react-hot-toast";
import AdminHeader from "../../components/admin/AdminHeader";
import { useAdminLayout } from "./hooks/useAdminLayout";
import DataTable, { DataTableColumn } from "../../components/admin/DataTable";
import FormDialog from "../../components/admin/FormDialog";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import SeatMatrixViewer, { SeatMatrixSeat } from "../../components/admin/SeatMatrixViewer";
import axiosClient from "../../api/axiosClient";

interface AdminScreen {
  id: number;
  name: string;
  location?: string | null;
  capacity?: number | null;
  rows?: number | null;
  columns?: number | null;
  screen_type?: string | null;
}

interface ScreenFormState {
  name: string;
  location: string;
  capacity: string;
  rows: string;
  columns: string;
  screen_type: string;
}

const EMPTY_FORM: ScreenFormState = {
  name: "",
  location: "",
  capacity: "",
  rows: "",
  columns: "",
  screen_type: "",
};

const AdminScreensPage: React.FC = () => {
  const { openSidebar } = useAdminLayout();
  const [screens, setScreens] = useState<AdminScreen[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [activeScreen, setActiveScreen] = useState<AdminScreen | null>(null);
  const [formState, setFormState] = useState<ScreenFormState>(EMPTY_FORM);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminScreen | null>(null);
  const [seatModal, setSeatModal] = useState<{ screen: AdminScreen; seats: SeatMatrixSeat[]; loading: boolean } | null>(null);

  const fetchScreens = async () => {
    setLoading(true);
    try {
      const response = await axiosClient.get<AdminScreen[]>("/admin/screens");
      setScreens(response.data || []);
    } catch (error: any) {
      console.error("[AdminScreens] Load failed", error);
      toast.error(error?.response?.data?.detail || "Unable to load screens");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScreens();
  }, []);

  const filteredScreens = useMemo(() => {
    if (!searchQuery) return screens;
    const query = searchQuery.toLowerCase();
    return screens.filter((screen) => screen.name?.toLowerCase().includes(query));
  }, [screens, searchQuery]);

  const columns: DataTableColumn<AdminScreen>[] = [
    {
      key: "name",
      header: "Screen",
      accessor: (screen) => (
        <div>
          <p className="font-semibold text-white">{screen.name}</p>
          {screen.screen_type && <p className="text-xs text-gray-500">{screen.screen_type}</p>}
        </div>
      ),
    },
    {
      key: "location",
      header: "Location",
      accessor: (screen) => screen.location || "—",
    },
    {
      key: "capacity",
      header: "Capacity",
      accessor: (screen) => screen.capacity ?? "—",
    },
    {
      key: "dimensions",
      header: "Layout",
      accessor: (screen) => {
        if (screen.rows && screen.columns) {
          return `${screen.rows} x ${screen.columns}`;
        }
        return "—";
      },
    },
    {
      key: "actions",
      header: "",
      accessor: (screen) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => handleViewSeats(screen)}
            className="flex items-center gap-2 rounded-full border border-[#1f1f25] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gray-300 transition hover:border-[#f6c800]/60 hover:text-white"
            aria-label={`View seats for ${screen.name}`}
          >
            <Eye size={14} /> Seats
          </button>
          <button
            type="button"
            onClick={() => handleEdit(screen)}
            className="flex items-center gap-2 rounded-full border border-[#1f1f25] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gray-300 transition hover:border-[#f6c800]/60 hover:text-white"
            aria-label={`Edit ${screen.name}`}
          >
            <Pencil size={14} /> Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(screen)}
            className="flex items-center gap-2 rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-red-400 transition hover:border-red-500 hover:text-red-200"
            aria-label={`Delete ${screen.name}`}
          >
            <Trash size={14} /> Delete
          </button>
        </div>
      ),
      className: "w-48 text-right",
    },
  ];

  const handleCreate = () => {
    setDialogMode("create");
    setActiveScreen(null);
    setFormState(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const handleEdit = (screen: AdminScreen) => {
    setDialogMode("edit");
    setActiveScreen(screen);
    setFormState({
      name: screen.name || "",
      location: screen.location || "",
      capacity: screen.capacity?.toString() || "",
      rows: screen.rows?.toString() || "",
      columns: screen.columns?.toString() || "",
      screen_type: screen.screen_type || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    const payload = buildScreenPayload(formState, activeScreen?.id);

    try {
      if (dialogMode === "create") {
        await axiosClient.post("/admin/screens", payload);
        toast.success("Screen created");
      } else if (activeScreen) {
        await axiosClient.put("/admin/screens/update", payload);
        toast.success("Screen updated");
      }
      setIsDialogOpen(false);
      setActiveScreen(null);
      setFormState(EMPTY_FORM);
      fetchScreens();
    } catch (error: any) {
      console.error("[AdminScreens] Persist failed", error);
      toast.error(error?.response?.data?.detail || "Unable to save screen");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setIsSubmitting(true);
    try {
      await axiosClient.delete(`/admin/screens/${confirmDelete.id}`);
      toast.success("Screen deleted");
      setConfirmDelete(null);
      fetchScreens();
    } catch (error: any) {
      console.error("[AdminScreens] Delete failed", error);
      toast.error(error?.response?.data?.detail || "Unable to delete screen");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleViewSeats = async (screen: AdminScreen) => {
    setSeatModal({ screen, seats: [], loading: true });
    try {
      const response = await axiosClient.get<{ seats: SeatMatrixSeat[] } | SeatMatrixSeat[]>(`/admin/screens/${screen.id}/seats`);
      const seats = Array.isArray(response.data)
        ? response.data
        : Array.isArray((response.data as any)?.seats)
        ? (response.data as any).seats
        : [];
      setSeatModal({ screen, seats, loading: false });
    } catch (error: any) {
      console.error("[AdminScreens] Seat fetch failed", error);
      toast.error(error?.response?.data?.detail || "Unable to load seats");
      setSeatModal(null);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader
        title="Screens"
        subtitle="Configure auditoriums and their capacity"
        onToggleSidebar={openSidebar}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by name"
        actions={
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-2 rounded-full bg-[#f6c800] px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[#ffd836]"
          >
            <Plus size={16} /> Add Screen
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto bg-[#0d0d14] px-6 py-8 text-gray-200">
        <DataTable
          data={filteredScreens}
          columns={columns}
          getRowId={(screen) => screen.id}
          isLoading={loading}
          emptyState={<p>No screens configured yet. Create one to begin scheduling showtimes.</p>}
        />
      </div>

      <FormDialog
        title={dialogMode === "create" ? "Create Screen" : `Edit ${activeScreen?.name}`}
        description="Provide seating details to keep seat availability accurate."
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setActiveScreen(null);
          setFormState(EMPTY_FORM);
        }}
        onSubmit={handleSubmit}
        isSubmitting={isSubmitting}
        submitLabel={dialogMode === "create" ? "Create" : "Update"}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name" value={formState.name} onChange={(value) => setFormState((prev) => ({ ...prev, name: value }))} required />
          <Field label="Location" value={formState.location} onChange={(value) => setFormState((prev) => ({ ...prev, location: value }))} />
          <Field label="Capacity" value={formState.capacity} onChange={(value) => setFormState((prev) => ({ ...prev, capacity: value }))} />
          <Field label="Rows" value={formState.rows} onChange={(value) => setFormState((prev) => ({ ...prev, rows: value }))} />
          <Field label="Columns" value={formState.columns} onChange={(value) => setFormState((prev) => ({ ...prev, columns: value }))} />
          <Field label="Screen Type" value={formState.screen_type} onChange={(value) => setFormState((prev) => ({ ...prev, screen_type: value }))} />
        </div>
      </FormDialog>

      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        title="Delete screen"
        message={`Are you sure you want to remove \"${confirmDelete?.name}\"? Any scheduled showtimes may be affected.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        confirmLabel="Delete"
        loading={isSubmitting}
      />

      {seatModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur">
          <div className="w-full max-w-3xl rounded-3xl border border-[#1f1f25] bg-[#09090f] p-6 text-white shadow-[0_40px_120px_-60px_rgba(246,200,0,0.35)]">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-semibold text-white">{seatModal.screen.name} Seats</h2>
                <p className="text-sm text-gray-400">Visualise the current seat map as exposed to booking flows.</p>
              </div>
              <button
                type="button"
                onClick={() => setSeatModal(null)}
                className="rounded-full border border-[#1f1f25] px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-gray-300 hover:bg-[#11111a]"
              >
                Close
              </button>
            </div>
            <div className="mt-6">
              <SeatMatrixViewer seats={seatModal.seats} loading={seatModal.loading} emptyLabel="No seats found for this screen." />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminScreensPage;

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, required = false }) => (
  <label className="flex flex-col gap-2 text-sm text-gray-300">
    <span>{label}</span>
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
      className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
    />
  </label>
);

function buildScreenPayload(form: ScreenFormState, screenId?: number | null) {
  const payload: Record<string, unknown> = {
    name: form.name,
    location: form.location,
    capacity: safeNumber(form.capacity),
    rows: safeNumber(form.rows),
    columns: safeNumber(form.columns),
    screen_type: form.screen_type,
  };
  if (screenId) {
    payload.screen_id = screenId;
  }
  return payload;
}

function safeNumber(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}
