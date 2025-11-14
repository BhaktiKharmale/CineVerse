export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      // Add project-specific color tokens without replacing Tailwind's default palettes
      colors: {
        'cine-gold': "#FFD700",
        'cine-red': "#E50914",
        'cine-black': "#0A0A0A",
      },
    },
  },
  plugins: [],
};
