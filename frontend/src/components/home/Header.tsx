// src/components/home/Header.tsx
import React from "react";
import { User } from "../../hooks/useUserProfile";

type Props = {
  user: User | null;
};

const Header: React.FC<Props> = ({ user }) => {
  return (
    <header className="p-6 bg-[#0f1115] border-b border-gray-800">
      <div className="max-w-6xl mx-auto flex items-center gap-6">
        <div className="w-20 h-20 rounded-full bg-yellow-400 overflow-hidden flex items-center justify-center text-[#0b0b10] font-semibold text-xl">
          {user?.name ? user.name[0].toUpperCase() : "U"}
        </div>

        <div>
          <h1 className="text-2xl font-semibold tracking-wider">{user?.name ?? "User"}</h1>
          <p className="text-sm text-gray-400">{user?.email}</p>
          {user?.phone && <p className="text-sm text-gray-500">{user.phone}</p>}
        </div>
      </div>
    </header>
  );
};

export default Header;
