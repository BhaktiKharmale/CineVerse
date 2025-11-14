import React, { useState } from "react";
import AdminHeader from "../../components/admin/AdminHeader";
import { useAdminLayout } from "./hooks/useAdminLayout";
import { useAdminAuth } from "../../context/AdminAuthContext";
import axiosClient from "../../api/axiosClient";
import toast from "react-hot-toast";

const AdminSettingsPage: React.FC = () => {
  const { openSidebar } = useAdminLayout();
  const { adminEmail, logout } = useAdminAuth();
  const [registerEmail, setRegisterEmail] = useState("");
  const [registerPassword, setRegisterPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [registering, setRegistering] = useState(false);

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setRegistering(true);
    try {
      await axiosClient.post("/admin/register", {
        email: registerEmail,
        password: registerPassword,
        name: registerName,
      });
      toast.success("Admin registration request submitted");
      setRegisterEmail("");
      setRegisterPassword("");
      setRegisterName("");
    } catch (error: any) {
      console.error("[AdminSettings] Register failed", error);
      toast.error(error?.response?.data?.detail || "Unable to register admin");
    } finally {
      setRegistering(false);
    }
  };

  return (
    <div className="flex flex-1 flex-col">
      <AdminHeader title="Settings" subtitle="Manage administrator account" onToggleSidebar={openSidebar} />
      <div className="flex-1 overflow-y-auto bg-[#0d0d14] px-6 py-8 text-gray-200">
        <div className="grid gap-8 lg:grid-cols-2">
          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_90px_-70px_rgba(246,200,0,0.35)]">
            <h2 className="text-lg font-semibold text-white">Profile</h2>
            <p className="mt-2 text-sm text-gray-400">Signed in as</p>
            <p className="text-sm font-medium text-white">{adminEmail || "Admin"}</p>

            <button
              type="button"
              onClick={logout}
              className="mt-6 inline-flex items-center justify-center rounded-full border border-[#f6c800]/60 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#f6c800] transition hover:bg-[#f6c800]/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800]"
            >
              Logout
            </button>
          </section>

          <section className="rounded-3xl border border-[#1f1f25] bg-[#0f0f16] p-6 shadow-[0_30px_90px_-70px_rgba(246,200,0,0.35)]">
            <h2 className="text-lg font-semibold text-white">Invite Another Admin</h2>
            <p className="mt-2 text-sm text-gray-400">
              Submit credentials for another team member. They will receive the default onboarding email or OTP depending on backend configuration.
            </p>
            <form onSubmit={handleRegister} className="mt-4 space-y-4">
              <Field label="Name" value={registerName} onChange={setRegisterName} placeholder="Full name" />
              <Field label="Email" value={registerEmail} onChange={setRegisterEmail} placeholder="email@cineverse.com" required />
              <Field label="Temporary Password" value={registerPassword} onChange={setRegisterPassword} placeholder="Temporary password" required type="password" />
              <button
                type="submit"
                disabled={registering}
                className="inline-flex items-center justify-center rounded-full bg-[#f6c800] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[#ffd836] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] disabled:cursor-not-allowed disabled:bg-gray-500"
              >
                {registering ? "Submitting..." : "Register Admin"}
              </button>
            </form>
            <p className="mt-4 text-xs text-gray-500">
              Optional: If your deployment uses OTP verification, follow up via Support → Verify OTP.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default AdminSettingsPage;

interface FieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}

const Field: React.FC<FieldProps> = ({ label, value, onChange, placeholder, required = false, type = "text" }) => (
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
