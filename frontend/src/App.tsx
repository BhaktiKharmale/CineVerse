import React from "react";
import Router from "./router/Router";
import ToastContainer from "./components/common/ToastContainer";
import AssistantWidget from "./components/assistant/AssistantWidget";
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
            <AssistantWidget />
          </BookingProvider>
        </AdminAuthProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
};

export default App;
