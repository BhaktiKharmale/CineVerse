import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

const DefaultFallback = () => (
  <div className="flex min-h-[200px] items-center justify-center bg-transparent text-sm text-gray-300">
    Checking authentication…
  </div>
);

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, fallback }) => {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "idle" || status === "authenticating") {
    return <>{fallback ?? <DefaultFallback />}</>;
  }

  if (status !== "authenticated") {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

