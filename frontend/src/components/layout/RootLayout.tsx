import React from "react";
import { Outlet } from "react-router-dom";
import { ShowtimeModalProvider } from "../../context/ShowtimeModalContext";
import BookingBreadcrumb from "../booking/BookingBreadcrumb";

/**
 * RootLayout wraps all routes and provides the ShowtimeModalProvider
 * This ensures the modal has access to Router context (useNavigate, etc.)
 */
export default function RootLayout() {
  return (
    <ShowtimeModalProvider>
      <BookingBreadcrumb />
      <Outlet />
    </ShowtimeModalProvider>
  );
}
