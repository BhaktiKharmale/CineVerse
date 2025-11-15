import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const NotFound: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    console.warn("[NotFound] Unmatched route", location.pathname, location.search);
  }, [location.pathname, location.search]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050509] px-6 text-white">
      <div className="max-w-md text-center">
        <h1 className="text-5xl font-semibold text-[#f6c800]">404</h1>
        <p className="mt-4 text-lg text-gray-300">We couldn’t find the page you were looking for.</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="rounded-full border border-[#2a2a3a] px-6 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-gray-300 transition hover:bg-[#1a1a24]"
          >
            Go Back
          </button>
          <button
            type="button"
            onClick={() => navigate("/home")}
            className="rounded-full bg-gradient-to-r from-[#f6c800] to-[#ff9d1b] px-6 py-2 text-sm font-semibold uppercase tracking-[0.3em] text-[#050509] transition hover:opacity-90"
          >
            Go to Home
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotFound;

