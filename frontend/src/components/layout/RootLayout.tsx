import React from "react";
import { Outlet } from "react-router-dom";
import { ShowtimeModalProvider } from "../../context/ShowtimeModalContext";

/**
 * RootLayout wraps all routes and provides the ShowtimeModalProvider
 * This ensures the modal has access to Router context (useNavigate, etc.)
 */
export default function RootLayout() {
  return (
    <ShowtimeModalProvider>
      <Outlet />
    </ShowtimeModalProvider>
  );
}
