import React, { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";

const logo = "/logo.jpg";

const Splash: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    console.log("✨ Splash mounted:", { pathname: location.pathname });
    // Only show splash on root path "/"
    if (location.pathname !== "/") {
      return;
    }

    const timer = setTimeout(() => {
      setFadeOut(true);

      setTimeout(() => {
        // Navigate to Home page after splash
        navigate("/home", { replace: true });
      }, 800);
    }, 2000); // 2 seconds splash duration

    return () => {
      clearTimeout(timer);
      console.log("✨ Splash unmounted");
    };
  }, [navigate, location.pathname]);

  // Don't render splash if not on root path
  if (location.pathname !== "/") {
    return null;
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "black",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        zIndex: 9999,
        opacity: fadeOut ? 0 : 1,
        transition: "opacity 0.4s ease",
        pointerEvents: fadeOut ? "none" : "auto", // Allow clicks after fade
      }}
    >
      <img
        src={logo}
        alt="App Logo"
        style={{
          width: "150px",
          height: "150px",
          maxWidth: "30vw",
          maxHeight: "30vw",
          objectFit: "contain",
          borderRadius: "50%",
          boxShadow: "0 0 15px 3px rgba(255, 215, 0, 0.7)",
          animation: "bounce-slow 2s ease-in-out infinite",
        }}
      />
      <style>{`
        @keyframes bounce-slow {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </div>
  );
};

export default Splash;
