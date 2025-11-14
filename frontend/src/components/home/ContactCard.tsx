// src/components/home/ContactCard.tsx
import React from "react";
import { User } from "../../hooks/useUserProfile";

type Props = { user: User | null };

const ContactCard: React.FC<Props> = ({ user }) => {
  return (
    <div className="bg-[#0f1115] border border-gray-800 rounded-lg p-6">
      <div className="flex justify-between items-start mb-6">
        <h2 className="text-xl font-semibold">Contact Information</h2>
        <button className="text-sm text-blue-400">Edit Details</button>
      </div>

      <div className="grid grid-cols-2 gap-y-4 gap-x-8 text-sm">
        <div>
          <p className="text-gray-400">Full Name</p>
          <p className="font-medium">{user?.name ?? "-"}</p>
        </div>

        <div>
          <p className="text-gray-400">Email</p>
          <p className="font-medium">{user?.email ?? "-"}</p>
        </div>

        <div>
          <p className="text-gray-400">Phone</p>
          <p className="font-medium">{user?.phone ?? "-"}</p>
        </div>

        <div>
          <p className="text-gray-400">Gender</p>
          <p className="font-medium">{user?.gender ?? "-"}</p>
        </div>

        <div>
          <p className="text-gray-400">Marital Status</p>
          <p className="font-medium">{user?.marital_status ?? "-"}</p>
        </div>

        <div>
          <p className="text-gray-400">Date of Birth</p>
          <p className="font-medium">{user?.dob ? new Date(user.dob).toLocaleDateString() : "-"}</p>
        </div>
      </div>
    </div>
  );
};

export default ContactCard;
