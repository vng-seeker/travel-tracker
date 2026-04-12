/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        vietnam: {
          red: "#DA251D",
          gold: "#FFCD00",
        },
      },
      fontFamily: {
        album: ['"Cormorant Garamond"', "Georgia", '"Times New Roman"', "serif"],
      },
    },
  },
  plugins: [],
};
