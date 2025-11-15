import React, { Suspense } from "react";
import { createBrowserRouter, RouterProvider, RouteObject, Navigate } from "react-router-dom";

import Splash from "../pages/Splash";
import Register from "../pages/Auth/Register";
import Login from "../pages/Auth/Login";
import Home from "../pages/Home";
import MovieDetails from "../pages/Movie/Details";
import ShowtimesPage from "../pages/Showtimes";
import SeatSelection from "../pages/Booking/SeatSelection";
import CheckoutPage from "../pages/Checkout";
import PaymentSuccess from "../pages/Booking/PaymentSuccess";
import UPIStatus from "../pages/Booking/UPIStatus";
import MyBookings from "../pages/MyBookings";
import AdminLoginPage from "../pages/Admin/Login";
import DashboardLayout from "../pages/Admin/DashboardLayout";
import AdminMoviesPage from "../pages/Admin/Movies";
import AdminScreensPage from "../pages/Admin/Screens";
import AdminShowtimesPage from "../pages/Admin/Showtimes";
import AdminSeatToolsPage from "../pages/Admin/SeatTools";
import AdminBookingsPage from "../pages/Admin/Bookings";
import AdminRequestsPage from "../pages/Admin/Requests";
import AdminSettingsPage from "../pages/Admin/Settings";
import Offers from "../pages/Offers";
import Cinemas from "../pages/Cinemas";
import AdminRouteGuard from "../components/admin/AdminRouteGuard";
import ProtectedRoute from "../components/common/ProtectedRoute";
import NotFound from "../pages/NotFound";
import RootLayout from "../components/layout/RootLayout";
import Profile from "../pages/Profile";

// Loading fallback component
const LoadingFallback = () => (
  <div className="flex items-center justify-center h-screen bg-black">
    <div className="text-white">Loading...</div>
  </div>
);

const routes: RouteObject[] = [
  {
    path: "/",
    element: <RootLayout />,
    children: [
      {
        index: true,
        element: <Splash />,
      },
      { path: "home", element: <Home /> },
      // Movies page removed - redirect to home
      { path: "movies", element: <Navigate to="/home" replace /> },
      { path: "showtimes", element: <ShowtimesPage /> },
      { path: "register", element: <Register /> },
      { path: "login", element: <Login /> },
      { path: "movie/:movieId", element: <MovieDetails /> },
      { path: "movie/:movieId/details", element: <Navigate to="/movie/:movieId" replace /> },
      { path: "offers", element: <Offers /> },
      { path: "cinemas", element: <Cinemas /> },
      
      // FIXED: Use URL parameters instead of path changes to prevent remounting
      { 
        path: "seats", 
        element: <SeatSelection /> 
      },
      { 
        path: "checkout", 
        element: <CheckoutPage /> 
      },
      { 
        path: "booking/checkout/:orderId", 
        element: <CheckoutPage /> 
      },
      
      { path: "payment/upi-status", element: <UPIStatus /> },
      { path: "booking/:bookingId/success", element: <PaymentSuccess /> },
      {
        path: "my-bookings",
        element: (
          <ProtectedRoute>
            <MyBookings />
          </ProtectedRoute>
        ),
      },
      {
        path: "profile",
        element: (
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        ),
      },
      { path: "admin/login", element: <AdminLoginPage /> },
      {
        path: "admin",
        element: (
          <AdminRouteGuard>
            <DashboardLayout />
          </AdminRouteGuard>
        ),
        children: [
          { index: true, element: <Navigate to="movies" replace /> },
          { path: "movies", element: <AdminMoviesPage /> },
          { path: "screens", element: <AdminScreensPage /> },
          { path: "showtimes", element: <AdminShowtimesPage /> },
          { path: "seat-tools", element: <AdminSeatToolsPage /> },
          { path: "bookings", element: <AdminBookingsPage /> },
          { path: "requests", element: <AdminRequestsPage /> },
          { path: "settings", element: <AdminSettingsPage /> },
        ],
      },
      // All showtime-related routes redirect to seat booking
      { path: "seat-selection", element: <Navigate to="/home" replace /> },
      { path: "seat-selection/:showtimeId", element: <Navigate to="/seats?showtimeId=:showtimeId" replace /> },
      { path: "showtime/:showtimeId", element: <Navigate to="/seats?showtimeId=:showtimeId" replace /> },
      { path: "showtimes/:showtimeId", element: <Navigate to="/seats?showtimeId=:showtimeId" replace /> },
      { path: "show/:showtimeId/seats", element: <Navigate to="/seats?showtimeId=:showtimeId" replace /> },
      { path: "movie/:movieId/showtimes", element: <Navigate to="/home" replace /> },
      { path: "booking/:bookingId", element: <Navigate to="/booking/:bookingId/success" replace /> },
      { path: "booking", element: <Navigate to="/home" replace /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

const router = createBrowserRouter(routes, {
  future: {
    v7_relativeSplatPath: true,
    v7_fetcherPersist: true,
    v7_normalizeFormMethod: true,
    v7_partialHydration: true,
    v7_skipActionErrorRevalidation: true,
  },
});

export default function Router() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}