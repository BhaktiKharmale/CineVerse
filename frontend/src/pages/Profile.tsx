// src/pages/Profile.tsx
import React from "react";
import { Navigate } from "react-router-dom";
import UserDashboard from "../components/home/UserDashboard";
import { useAuth } from "../hooks/useAuth";

const ProfilePage: React.FC = () => {
  const { user, status } = useAuth();

  const isAuthenticated = status === "authenticated" && !!user;

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <UserDashboard />;
};

export default ProfilePage;
