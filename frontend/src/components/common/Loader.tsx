import React from "react";

export default function Loader() {
  return (
    <div className="flex h-screen items-center justify-center bg-black">
      <div className="h-16 w-16 animate-spin rounded-full border-4 border-gold border-t-transparent" />
    </div>
  );
}
