import React from "react";
import { useLocation } from "react-router-dom";

interface BreadcrumbStep {
  label: string;
  path: string;
  isActive: boolean;
  isCompleted: boolean;
}

const BookingBreadcrumb: React.FC = () => {
  const location = useLocation();

  const steps: BreadcrumbStep[] = [
    {
      label: "Seat Selection",
      path: "/seats",
      isActive: location.pathname === "/seats",
      isCompleted: location.pathname !== "/seats" && (location.pathname === "/checkout" || location.pathname.startsWith("/booking/")),
    },
    {
      label: "Payment Summary",
      path: "/checkout",
      isActive: location.pathname === "/checkout" || location.pathname.startsWith("/booking/checkout/"),
      isCompleted: location.pathname.startsWith("/booking/") && location.pathname.includes("/success"),
    },
    {
      label: "Confirmation",
      path: "/booking",
      isActive: location.pathname.startsWith("/booking/") && location.pathname.includes("/success"),
      isCompleted: false,
    },
  ];

  // Only show breadcrumb on booking-related pages
  const isBookingPage = steps.some((step) => location.pathname.startsWith(step.path.split("?")[0]));
  if (!isBookingPage) return null;

  return (
    <div className="sticky top-0 z-40 bg-[#0b0b0f]/95 backdrop-blur-md border-b border-[#1f1f25]/60">
      <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6">
        <nav className="flex items-center justify-center gap-2 sm:gap-4" aria-label="Booking progress">
          {steps.map((step, index) => (
            <React.Fragment key={step.path}>
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold transition ${
                    step.isCompleted
                      ? "bg-[#f6c800] text-[#0b0b0f]"
                      : step.isActive
                      ? "bg-[#f6c800] text-[#0b0b0f] ring-2 ring-[#f6c800]/50"
                      : "bg-[#1a1a24] text-gray-400"
                  }`}
                >
                  {step.isCompleted ? (
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`hidden text-sm font-medium sm:inline ${
                    step.isActive ? "text-[#f6c800]" : step.isCompleted ? "text-gray-300" : "text-gray-500"
                  }`}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 && (
                <div
                  className={`h-0.5 w-8 sm:w-12 transition ${
                    step.isCompleted ? "bg-[#f6c800]" : "bg-[#2a2a3a]"
                  }`}
                />
              )}
            </React.Fragment>
          ))}
        </nav>
      </div>
    </div>
  );
};

export default BookingBreadcrumb;

