import React from "react";

const Footer: React.FC = () => {
  return (
    <footer className="mt-12 bg-[#0b0b0b] py-8 text-gray-400">
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 md:grid-cols-4">
        <div>
          <h4 className="mb-2 text-white font-semibold">Movies</h4>
          <ul className="space-y-1 text-sm">
            <li>Popular</li>
            <li>Upcoming</li>
            <li>Near me</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-2 text-white font-semibold">Stream</h4>
          <ul className="space-y-1 text-sm">
            <li>New Releases</li>
            <li>Trending</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-2 text-white font-semibold">Support</h4>
          <ul className="space-y-1 text-sm">
            <li>Help Center</li>
            <li>Contact</li>
          </ul>
        </div>
        <div>
          <h4 className="mb-2 text-white font-semibold">Company</h4>
          <ul className="space-y-1 text-sm">
            <li>About</li>
            <li>Careers</li>
          </ul>
        </div>
      </div>

      <div className="mt-8 text-center text-xs text-gray-500">
        © {new Date().getFullYear()} CineVerse. All rights reserved.
      </div>
    </footer>
  );
};

export default Footer;
