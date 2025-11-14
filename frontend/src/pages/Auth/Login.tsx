// src/pages/Auth/Login.tsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Navbar from "../../components/layout/Navbar";
import Footer from "../../components/layout/Footer";
import axiosClient, { setAuthToken } from "../../api/axiosClient";
import { useAuth } from "../../hooks/useAuth";

type LoginResponse = {
  access_token: string;
  token_type: string;
};

const parseJwt = (token: string): any => {
  try {
    const base64 = token.split(".")[1];
    const json = atob(base64.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decodeURIComponent(escape(json)));
  } catch {
    return {};
  }
};

export default function Login() {
  const navigate = useNavigate();
  const auth = useAuth(); // should have setUser / setStatus from AuthProvider

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setSubmitting(true);
    setError(null);
    (auth as any)?.setStatus?.("authenticating");

    try {
      // FastAPI OAuth2PasswordRequestForm requires x-www-form-urlencoded
      const form = new URLSearchParams();
      form.append("username", email);
      form.append("password", password);

      const { data } = await axiosClient.post<LoginResponse>("/user/login", form, {
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      });

      if (!data?.access_token) {
        setError("Invalid credentials.");
        (auth as any)?.setStatus?.("unauthenticated");
        return;
      }

      // Persist token and update axios
      setAuthToken(data.access_token);

      // Immediately update context so Navbar re-renders user initials
      const payload = parseJwt(data.access_token);
      const userFromToken = {
        email: payload?.sub ?? email,
        name: payload?.name ?? "",
        role: payload?.role ?? "user",
        avatar: null as string | null,
      };
      (auth as any)?.setUser?.(userFromToken);
      (auth as any)?.setStatus?.("authenticated");

      // Smooth client-side navigation (no hard refresh)
      navigate("/home");
    } catch (err: any) {
      (auth as any)?.setStatus?.("unauthenticated");
      setError(err?.response?.data?.detail || "Login failed. Check your email and password.");
      console.error("Login error:", err);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0d0d0d] text-white">
      <Navbar />

      <main className="flex-1 flex items-center justify-center px-4">
        <section
          className="w-full max-w-md p-8 rounded-2xl bg-black/60 backdrop-blur-lg shadow-lg border border-[#FF7A00]/20 animate-homeFadeIn"
          aria-labelledby="login-heading"
        >
          <h2
            id="login-heading"
            className="text-3xl font-bold text-center bg-gradient-to-r from-[#D61F1F] to-[#FF7A00] bg-clip-text text-transparent mb-8"
          >
            Welcome Back to CineVerse
          </h2>

          <form onSubmit={handleSubmit} className="flex flex-col space-y-6">
            <label className="flex flex-col text-sm font-medium" htmlFor="email">
              Email Address
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 p-3 rounded-md bg-[#1a1a1a] border border-gray-700 focus:border-[#FF7A00] outline-none"
                required
                autoComplete="username"
              />
            </label>

            <label className="flex flex-col text-sm font-medium" htmlFor="password">
              Password
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 p-3 rounded-md bg-[#1a1a1a] border border-gray-700 focus:border-[#FF7A00] outline-none"
                required
                autoComplete="current-password"
              />
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-md bg-gradient-to-r from-[#D61F1F] to-[#FF7A00] text-black font-semibold hover:scale-105 transition-transform disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Logging in..." : "Log In"}
            </button>

            <p className="text-center text-gray-400 text-sm">
              Don’t have an account?{" "}
              <button
                type="button"
                onClick={() => navigate("/register")}
                className="text-[#FF7A00] hover:underline"
              >
                Register
              </button>
            </p>
          </form>
        </section>
      </main>

      <Footer />
    </div>
  );
}
