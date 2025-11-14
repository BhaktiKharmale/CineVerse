import React, { useState } from "react";
import { Loader2, TicketCheck } from "lucide-react";
import toast from "react-hot-toast";
import AdminHeader from "../../components/admin/AdminHeader";
import { useAdminLayout } from "./hooks/useAdminLayout";
import axiosClient from "../../api/axiosClient";

interface BookingResponse {
  booking_id?: string | number;
  seats?: string[];
  message?: string;
  [key: string]: unknown;
}

const AdminBookingsPage: React.FC = () => {
  const { openSidebar } = useAdminLayout();
  const [showtimeId, setShowtimeId] = useState("");
  const [seats, setSeats] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [remarks, setRemarks] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BookingResponse | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setResult(null);

    const payload = {
      showtime_id: Number(showtimeId),
      seats: seats.split(",").map((seat) => seat.trim()).filter(Boolean),
      customer_name: customerName,
      customer_phone: customerPhone,
      remarks,
    };

    try {
      const response = await axiosClient.post<BookingResponse>("/admin/admin/book-offline", payload);
      setResult(response.data);
      toast.success("Offline booking created");
      setShowtimeId("");
      setSeats("");
      setCustomerName("");
      setCustomerPhone("");
      setRemarks("");
    } catch (error: any) {
      console.error("[AdminBookings] Offline booking failed", error);
      toast.error(error?.response?.data?.detail || "Unable to create booking");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader
        title="Book Offline"
        subtitle="Reserve seats for customers from the counter"
        onToggleSidebar={openSidebar}
      />

      <div className="flex-1 overflow-y-auto bg-[#0d0d14] px-6 py-8 text-gray-200">
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_80px_-60px_rgba(246,200,0,0.35)]">
            <header className="flex items-center gap-3 pb-4">
              <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f6c800]/15 text-[#f6c800]">
                <TicketCheck size={18} />
              </span>
              <div>
                <h2 className="text-lg font-semibold text-white">Create Offline Booking</h2>
                <p className="text-xs text-gray-400">Seats should match the CineVerse seat code (e.g., A5,B5).</p>
              </div>
            </header>
            <form onSubmit={handleSubmit} className="grid gap-4">
              <Field
                label="Showtime ID"
                value={showtimeId}
                onChange={setShowtimeId}
                placeholder="Enter showtime id"
                required
              />
              <Field
                label="Seats"
                value={seats}
                onChange={setSeats}
                placeholder="A5, A6, A7"
                required
              />
              <Field
                label="Customer Name"
                value={customerName}
                onChange={setCustomerName}
                placeholder="Full name"
                required
              />
              <Field
                label="Customer Phone"
                value={customerPhone}
                onChange={setCustomerPhone}
                placeholder="Phone number"
                required
              />
              <label className="flex flex-col gap-2 text-sm text-gray-300">
                <span>Remarks</span>
                <textarea
                  rows={3}
                  value={remarks}
                  onChange={(event) => setRemarks(event.target.value)}
                  placeholder="Any notes or payment references"
                  className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
                />
              </label>
              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-[#f6c800] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[#ffd836] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] disabled:cursor-not-allowed disabled:bg-gray-500"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <TicketCheck size={16} />} {loading ? "Booking..." : "Book Seats"}
              </button>
            </form>
          </section>

          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_80px_-60px_rgba(246,200,0,0.35)]">
            <header className="pb-4">
              <h2 className="text-lg font-semibold text-white">Booking Result</h2>
              <p className="text-xs text-gray-400">Details from the most recent offline booking will appear here.</p>
            </header>
            {result ? (
              <div className="space-y-3 text-sm text-gray-300">
                {result.booking_id && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Booking ID</p>
                    <p className="text-base font-semibold text-white">{result.booking_id}</p>
                  </div>
                )}
                {result.seats && result.seats.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-gray-500">Seats</p>
                    <p className="font-medium">{result.seats.join(", ")}</p>
                  </div>
                )}
                {result.message && (
                  <p className="rounded-2xl border border-[#1f1f25] bg-[#13131d] p-3 text-sm text-gray-200">{result.message}</p>
                )}
                <pre className="overflow-x-auto rounded-2xl border border-[#1f1f25] bg-[#13131d] p-4 text-xs text-gray-400">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-[#1f1f25] bg-[#12121a] p-6 text-sm text-gray-500">
                Submit a booking to see the response payload.
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminBookingsPage;

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
