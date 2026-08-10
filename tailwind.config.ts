import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef6ff",
          100: "#d9ebff",
          200: "#bcdcff",
          300: "#8ec6ff",
          400: "#59a7ff",
          500: "#3186fd",
          600: "#1a67f2",
          700: "#1652de",
          800: "#1943b3",
          900: "#1a3c8c",
          950: "#152559",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      boxShadow: {
        glass: "0 8px 32px 0 rgba(15, 23, 42, 0.12)",
      },
    },
  },
  plugins: [],
};

export default config;
