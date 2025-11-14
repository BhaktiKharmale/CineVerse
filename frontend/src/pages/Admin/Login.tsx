import React, { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAdminAuth } from "../../context/AdminAuthContext";

const API_BASE = (import.meta.env.VITE_API_BASE || "http://127.0.0.1:8001").replace(/\/$/, "");

const AdminLoginPage: React.FC = () => {
  const { isAuthenticated, login } = useAdminAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const from = (location.state as { from?: Location })?.from?.pathname ?? "/admin";

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const body = new URLSearchParams();
      body.append("username", email.trim());
      body.append("password", password);

      const response = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!response.ok) {
        const message = await response.text();
        throw new Error(message || `Login failed (${response.status})`);
      }

      const data = await response.json();
      if (!data?.access_token) {
        throw new Error("Missing access token in response");
      }

      login(data.access_token, data.email ?? email);
      toast.success("Admin login successful");
      navigate("/admin", { replace: true });
    } catch (err: any) {
      console.error("[AdminLogin]", err);
      const message = err?.message || "Unable to login. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#050509] px-4 py-16 text-white">
      <div className="w-full max-w-md rounded-3xl border border-[#1f1f25] bg-gradient-to-br from-[#0c0c12] via-[#0a0a10] to-[#13131d] p-10 shadow-[0_40px_120px_-60px_rgba(246,200,0,0.35)]">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-[#f6c800]">Administrator Access</p>
          <h1 className="mt-3 text-2xl font-bold text-white">Sign in to CineVerse Console</h1>
          <p className="mt-2 text-sm text-gray-400">Use your admin credentials to manage movies, screens and showtimes.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="admin-email" className="mb-2 block text-sm font-medium text-gray-300">
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              required
              autoComplete="username"
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
              placeholder="admin@cineverse.com"
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="mb-2 block text-sm font-medium text-gray-300">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              required
              autoComplete="current-password"
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-2xl border border-[#1f1f25] bg-[#0f0f16] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-[#f6c800] focus:outline-none focus:ring-2 focus:ring-[#f6c800]/40"
              placeholder="Enter password"
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center rounded-2xl bg-[#f6c800] px-4 py-3 text-sm font-semibold uppercase tracking-[0.3em] text-black transition hover:bg-[#ffd836] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#f6c800] disabled:cursor-not-allowed disabled:bg-gray-500"
          >
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <div className="mt-8 text-center text-xs text-gray-500">
          <p>
            Need access? Contact the CineVerse platform team or use the request form in <span className="text-[#f6c800]">Settings</span> once logged in.
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminLoginPage;
