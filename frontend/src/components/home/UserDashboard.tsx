// src/components/home/UserDashboard.tsx
import React from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import ContactCard from "./ContactCard";
import useUserProfile from "../../hooks/useUserProfile";

const UserDashboard: React.FC = () => {
  const { user, loading } = useUserProfile();

  return (
    <div className="min-h-screen bg-[#0b0b10] text-gray-100">
      {/* Header */}
      <Header user={user} />

      <div className="flex">
        {/* Sidebar */}
        <Sidebar />

        {/* Main content */}
        <div className="flex-1 p-8">
          <div className="max-w-5xl mx-auto">
            {loading ? (
              <div className="p-8 bg-gray-800 rounded-md">Loading...</div>
            ) : (
              <ContactCard user={user} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserDashboard;
