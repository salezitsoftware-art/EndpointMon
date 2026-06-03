/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#101418",
        mist: "#eef5f2",
        ember: "#f97316",
        pine: "#0f766e",
      },
      boxShadow: {
        panel: "0 18px 35px rgba(16, 20, 24, 0.12)",
      },
    },
  },
  plugins: [],
};
