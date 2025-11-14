import React from "react";
import { Toaster } from "react-hot-toast";

export default function ToastContainer() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 3000,
        style: {
          background: "#1f1f1f",
          color: "#fff",
          border: "1px solid #FFD700",
        },
        success: {
          iconTheme: {
            primary: "#FFD700",
            secondary: "#000",
          },
        },
      }}
    />
  );
}
