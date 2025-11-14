/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", // Include all React files
    "./public/index.html"         // Include HTML entry point
  ],
  theme: {
    extend: {
      colors: {
        cineverseRed: "#D61F1F",     // Crimson red
        cineverseOrange: "#FF7A00",  // Vibrant orange
        gold: "#FFD700",             // Legacy gold tone
        darkBg: "#0d0d0d",           // Deep background tone
        accentGray: "#1f1f1f",       // Accent for panels/cards
      },
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui"], // Sleek modern font
      },
      boxShadow: {
        cineverse: "0 4px 20px rgba(214, 31, 31, 0.4)",  // Red glow
      },
      backgroundImage: {
        "cineverse-gradient": "linear-gradient(to right, #D61F1F, #FF7A00)",
      },
    },
  },
  plugins: [],
};
