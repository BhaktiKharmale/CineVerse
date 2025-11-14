import React, { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import toast from "react-hot-toast";
import AdminHeader from "../../components/admin/AdminHeader";
import { useAdminLayout } from "./hooks/useAdminLayout";
import axiosClient from "../../api/axiosClient";

const AdminRequestsPage: React.FC = () => {
  const { openSidebar } = useAdminLayout();
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    setResult(null);

    try {
      const payload = {
        title,
        language,
        notes,
      };

      const response = await axiosClient.post("/admin/request_movie", payload);
      setResult(response.data);
      toast.success("Request submitted");
      setTitle("");
      setLanguage("");
      setNotes("");
    } catch (error: any) {
      console.error("[AdminRequests] Submit failed", error);
      toast.error(error?.response?.data?.detail || "Unable to submit request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader
        title="Requests"
        subtitle="Request new titles or special experiences from distribution"
        onToggleSidebar={openSidebar}
      />

      <div className="flex-1 overflow-y-auto bg-[#0d0d14] px-6 py-8 text-gray-200">
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_80px_-60px_rgba(246,200,0,0.35)]">
            <header className="flex items-center gap-3 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f6c800]/15 text-[#f6c800]">
                <MessageSquarePlus size={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-white">Request Movie</h2>
                <p className="text-xs text-gray-400">Share details with the content programming team.</p>
              </div>
            </header>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <Field label="Movie Title" value={title} onChange={setTitle} placeholder="Movie name" required />
              <Field label="Language" value={language} onChange={setLanguage} placeholder="Language" required />
              <label className="flex flex-col gap-2 text-sm text-gray-300">
                <span>Notes</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Preferred release window, format expectations, audience insights"
                  className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
                />
              </label>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#f6c800] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[#ffd836] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] disabled:cursor-not-allowed disabled:bg-gray-500"
              >
                {submitting ? "Submitting..." : "Send Request"}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_80px_-60px_rgba(246,200,0,0.35)]">
            <header className="pb-4">
              <h2 className="text-lg font-semibold text-white">Response</h2>
              <p className="text-xs text-gray-400">Server acknowledgement from the latest request.</p>
            </header>
            {result ? (
              <pre className="overflow-x-auto rounded-2xl border border-[#1f1f25] bg-[#13131d] p-4 text-xs text-gray-400">{JSON.stringify(result, null, 2)}</pre>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#1f1f25] bg-[#12121a] p-6 text-sm text-gray-500">
                Submit a request to see the response payload.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminRequestsPage;

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, placeholder, required }) => (
  <label className="flex flex-col gap-2 text-sm text-gray-300">
    <span>{label}</span>
    <input
      type="text"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
    />
  </label>
);
