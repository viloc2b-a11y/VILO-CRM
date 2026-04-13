import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        vilo: {
          50: "#f4f7f9",
          100: "#e2e9ef",
          200: "#c9d5e0",
          300: "#a3b6c9",
          400: "#7690ab",
          500: "#5a7390",
          600: "#475d75",
          700: "#3b4d61",
          800: "#334252",
          900: "#2d3845",
        },
        vitalis: {
          50: "#f0faf8",
          100: "#d9f2ec",
          200: "#b6e4da",
          300: "#85cfc0",
          400: "#52b4a4",
          500: "#36988a",
          600: "#2a7a6f",
          700: "#24625a",
          800: "#204f49",
          900: "#1e423e",
        },
        clinical: {
          paper: "#fafbfc",
          ink: "#1a2332",
          muted: "#5c6b7d",
          line: "#e4e9ef",
          alert: "#c43d3d",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(26, 35, 50, 0.06), 0 0 0 1px rgba(26, 35, 50, 0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
