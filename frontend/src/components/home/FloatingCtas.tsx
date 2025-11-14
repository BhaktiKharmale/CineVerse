import React from "react";
import { useNavigate } from "react-router-dom";

interface FloatingCtasProps {
  className?: string;
}

const buttons = [
  {
    id: "order-fnb",
    label: "Order F&B",
    href: "/offers",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 9h18M5 9l1.5 11h11L19 9M9 9V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V9"
        />
      </svg>
    ),
  },
  {
    id: "curated-shows",
    label: "Curated Shows",
    href: "/booking",
    icon: (
      <svg
        className="h-5 w-5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5V6m0 0L12 9m3-3 3 3M9 13.5V18m0 0 3-3m-3 3-3-3" />
      </svg>
    ),
  },
];

export const FloatingCtas: React.FC<FloatingCtasProps> = ({ className = "" }) => {
  const navigate = useNavigate();

  return (
    <div className={`sticky bottom-8 flex flex-col items-end gap-3 ${className}`}>
      {buttons.map((button) => (
        <button
          key={button.id}
          type="button"
          onClick={() => navigate(button.href)}
          className="inline-flex items-center gap-2 rounded-full bg-[#f6c800] px-4 py-2 text-sm font-semibold uppercase tracking-[0.25em] text-black shadow-[0_20px_60px_-30px_rgba(246,200,0,0.85)] transition hover:-translate-y-1 hover:shadow-[0_25px_70px_-35px_rgba(246,200,0,0.9)] focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#f6c800]"
          aria-label={button.label}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/10 text-black">
            {button.icon}
          </span>
          {button.label}
        </button>
      ))}
    </div>
  );
};

export default FloatingCtas;

