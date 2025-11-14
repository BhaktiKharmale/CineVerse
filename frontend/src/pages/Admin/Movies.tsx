import React, { useEffect, useMemo, useState } from "react";
import { Pencil, Plus, Trash } from "lucide-react";
import toast from "react-hot-toast";
import AdminHeader from "../../components/admin/AdminHeader";
import { useAdminLayout } from "./hooks/useAdminLayout";
import DataTable, { DataTableColumn } from "../../components/admin/DataTable";
import FormDialog from "../../components/admin/FormDialog";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import axiosClient from "../../api/axiosClient";

interface AdminMovie {
  id: number;
  title: string;
  languages?: string[] | string | null;
  duration?: string | number | null;
  rating?: string | number | null;
  genres?: string[] | string | null;
  poster_url?: string | null;
  poster_filename?: string | null;
  status?: string | null;
  description?: string | null;
  release_date?: string | null;
}

interface MovieFormState {
  title: string;
  languages: string;
  duration: string;
  rating: string;
  genres: string;
  poster_url: string;
  status: string;
  description: string;
  release_date: string;
}

const EMPTY_FORM: MovieFormState = {
  title: "",
  languages: "",
  duration: "",
  rating: "",
  genres: "",
  poster_url: "",
  status: "Active",
  description: "",
  release_date: "",
};

const AdminMoviesPage: React.FC = () => {
  const { openSidebar } = useAdminLayout();
  const [movies, setMovies] = useState<AdminMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [activeMovie, setActiveMovie] = useState<AdminMovie | null>(null);
  const [formState, setFormState] = useState<MovieFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminMovie | null>(null);

  const fetchMovies = async () => {
    setLoading(true);
    try {
      const response = await axiosClient.get<AdminMovie[]>("/admin/movies");
      setMovies(response.data || []);
    } catch (error: any) {
      console.error("[AdminMovies] Failed to load movies", error);
      toast.error(error?.response?.data?.detail || "Unable to load movies.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMovies();
  }, []);

  const filteredMovies = useMemo(() => {
    if (!searchQuery) return movies;
    const query = searchQuery.toLowerCase();
    return movies.filter((movie) => movie.title?.toLowerCase().includes(query));
  }, [movies, searchQuery]);

  const columns: DataTableColumn<AdminMovie>[] = [
    {
      key: "title",
      header: "Title",
      accessor: (movie) => (
        <div>
          <p className="font-semibold text-white">{movie.title}</p>
          {movie.description && <p className="text-xs text-gray-500 line-clamp-1">{movie.description}</p>}
        </div>
      ),
      className: "w-1/4",
    },
    {
      key: "languages",
      header: "Languages",
      accessor: (movie) => formatList(movie.languages),
    },
    {
      key: "duration",
      header: "Duration",
      accessor: (movie) => movie.duration || "—",
    },
    {
      key: "rating",
      header: "Rating",
      accessor: (movie) => movie.rating || "—",
    },
    {
      key: "genres",
      header: "Genres",
      accessor: (movie) => formatList(movie.genres),
      className: "hidden md:table-cell",
    },
    {
      key: "status",
      header: "Status",
      accessor: (movie) => (
        <span className="inline-flex items-center rounded-full bg-[#f6c800]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-[#f6c800]">
          {(movie.status || "active").toString()}
        </span>
      ),
    },
    {
      key: "actions",
      header: "",
      accessor: (movie) => (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => handleEdit(movie)}
            className="flex items-center gap-2 rounded-full border border-[#1f1f25] px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-gray-300 transition hover:border-[#f6c800]/60 hover:text-white"
            aria-label={`Edit movie ${movie.title}`}
          >
            <Pencil size={14} /> Edit
          </button>
          <button
            type="button"
            onClick={() => setConfirmDelete(movie)}
            className="flex items-center gap-2 rounded-full border border-red-500/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-red-400 transition hover:border-red-500 hover:text-red-200"
            aria-label={`Delete movie ${movie.title}`}
          >
            <Trash size={14} /> Delete
          </button>
        </div>
      ),
      className: "w-40 text-right",
    },
  ];

  const handleCreate = () => {
    setDialogMode("create");
    setActiveMovie(null);
    setFormState(EMPTY_FORM);
    setIsDialogOpen(true);
  };

  const handleEdit = (movie: AdminMovie) => {
    setDialogMode("edit");
    setActiveMovie(movie);
    setFormState({
      title: movie.title || "",
      languages: revertList(movie.languages),
      duration: movie.duration?.toString() || "",
      rating: movie.rating?.toString() || "",
      genres: revertList(movie.genres),
      poster_url: movie.poster_url || movie.poster_filename || "",
      status: movie.status?.toString() || "Active",
      description: movie.description || "",
      release_date: movie.release_date || "",
    });
    setIsDialogOpen(true);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const payload = buildPayload(formState);
      if (dialogMode === "create") {
        await axiosClient.post("/admin/movies", payload);
        toast.success("Movie created successfully");
      } else if (activeMovie) {
        await axiosClient.put(`/admin/movies/${activeMovie.id}`, payload);
        toast.success("Movie updated successfully");
      }
      setIsDialogOpen(false);
      setActiveMovie(null);
      setFormState(EMPTY_FORM);
      fetchMovies();
    } catch (error: any) {
      console.error("[AdminMovies] Failed to persist movie", error);
      toast.error(error?.response?.data?.detail || "Could not save movie");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setSubmitting(true);
    try {
      await axiosClient.delete(`/admin/movies/${confirmDelete.id}`);
      toast.success("Movie deleted");
      setConfirmDelete(null);
      fetchMovies();
    } catch (error: any) {
      console.error("[AdminMovies] Failed to delete", error);
      toast.error(error?.response?.data?.detail || "Unable to delete movie");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader
        title="Movies"
        subtitle="Manage catalogue metadata exposed to the CineVerse audience"
        onToggleSidebar={openSidebar}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by title"
        actions={
          <button
            type="button"
            onClick={handleCreate}
            className="inline-flex items-center gap-2 rounded-full bg-[#f6c800] px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[#ffd836] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
          >
            <Plus size={16} /> Add Movie
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto bg-[#0d0d14] px-6 py-8 text-gray-200">
        <DataTable
          data={filteredMovies}
          columns={columns}
          getRowId={(movie) => movie.id}
          isLoading={loading}
          emptyState={
            <div className="space-y-4">
              <p>No movies found. Add a title to get started.</p>
              <button
                type="button"
                onClick={handleCreate}
                className="inline-flex items-center gap-2 rounded-full border border-[#f6c800]/70 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#f6c800] hover:bg-[#f6c800]/15"
              >
                <Plus size={14} /> Create Movie
              </button>
            </div>
          }
        />
      </div>

      <FormDialog
        title={dialogMode === "create" ? "Create Movie" : `Edit ${activeMovie?.title}`}
        description="Provide details exactly as they should appear in the CineVerse catalogue."
        isOpen={isDialogOpen}
        onClose={() => {
          setIsDialogOpen(false);
          setActiveMovie(null);
          setFormState(EMPTY_FORM);
        }}
        onSubmit={handleSubmit}
        submitLabel={dialogMode === "create" ? "Create" : "Update"}
        isSubmitting={submitting}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field
            label="Title"
            value={formState.title}
            onChange={(value) => setFormState((prev) => ({ ...prev, title: value }))}
            required
          />
          <Field
            label="Languages"
            placeholder="English, Hindi"
            value={formState.languages}
            onChange={(value) => setFormState((prev) => ({ ...prev, languages: value }))}
          />
          <Field
            label="Duration"
            placeholder="120"
            value={formState.duration}
            onChange={(value) => setFormState((prev) => ({ ...prev, duration: value }))}
          />
          <Field
            label="Rating"
            placeholder="PG-13"
            value={formState.rating}
            onChange={(value) => setFormState((prev) => ({ ...prev, rating: value }))}
          />
          <Field
            label="Genres"
            placeholder="Action, Thriller"
            value={formState.genres}
            onChange={(value) => setFormState((prev) => ({ ...prev, genres: value }))}
          />
          <Field
            label="Poster URL"
            placeholder="https://..."
            value={formState.poster_url}
            onChange={(value) => setFormState((prev) => ({ ...prev, poster_url: value }))}
          />
          <Field
            label="Status"
            placeholder="Active"
            value={formState.status}
            onChange={(value) => setFormState((prev) => ({ ...prev, status: value }))}
          />
          <Field
            label="Release Date"
            placeholder="2025-12-01"
            value={formState.release_date}
            onChange={(value) => setFormState((prev) => ({ ...prev, release_date: value }))}
          />
        </div>
        <div className="mt-4">
          <Field
            label="Synopsis"
            as="textarea"
            placeholder="Short description for internal reference"
            value={formState.description}
            onChange={(value) => setFormState((prev) => ({ ...prev, description: value }))}
          />
        </div>
      </FormDialog>

      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        title="Delete movie"
        message={`Are you sure you want to delete \"${confirmDelete?.title}\"? This action cannot be undone.`}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        loading={submitting}
        confirmLabel="Delete"
      />
    </div>
  );
};

export default AdminMoviesPage;

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  as?: "input" | "textarea";
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, placeholder, required = false, as = "input" }) => {
  const commonProps = {
    value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => onChange(event.target.value),
    placeholder,
    required,
    className:
      "w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40",
  };

  return (
    <label className="flex flex-col gap-2 text-sm text-gray-300">
      <span>{label}</span>
      {as === "textarea" ? <textarea rows={4} {...commonProps} /> : <input type="text" {...commonProps} />}
    </label>
  );
};

function formatList(value: AdminMovie["languages" | "genres"]): React.ReactNode {
  if (!value) return "—";
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "—";
  }
  return value;
}

function revertList(value: AdminMovie["languages" | "genres"]): string {
  if (!value) return "";
  if (Array.isArray(value)) {
    return value.join(", ");
  }
  return value;
}

function buildPayload(form: MovieFormState) {
  const languagesArray = splitList(form.languages);
  const genresArray = splitList(form.genres);

  return {
    title: form.title,
    languages: languagesArray,
    duration: form.duration,
    rating: form.rating,
    genres: genresArray,
    poster_url: form.poster_url,
    poster_filename: form.poster_url,
    status: form.status,
    description: form.description,
    release_date: form.release_date,
  };
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
