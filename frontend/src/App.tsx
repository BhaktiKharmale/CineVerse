import React from "react";
import Router from "./router/Router";
import AIChatWidget from "./components/chat/AIChatWidget";
import ToastContainer from "./components/common/ToastContainer";
import { ShowtimeModalProvider } from "./context/ShowtimeModalContext";
import { AdminAuthProvider } from "./context/AdminAuthContext";
import { AuthProvider } from "./context/AuthProvider";
import { BookingProvider } from "./context/BookingContext";
import AppErrorBoundary from "./components/common/AppErrorBoundary";

const App: React.FC = () => {
  return (
    <AppErrorBoundary>
      <AuthProvider>
        <AdminAuthProvider>
          <BookingProvider>
            <Router />
            <ToastContainer />
            <AIChatWidget />
          </BookingProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
};

export default App;
