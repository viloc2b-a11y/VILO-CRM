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
          50: "#101b2c",
          100: "#13243a",
          200: "#1c2d47",
          300: "#274469",
          400: "#2f6591",
          500: "#38bdf8",
          600: "#38bdf8",
          700: "#7dd3fc",
          800: "#bae6fd",
          900: "#e0f2fe",
        },
        vitalis: {
          50: "#0d1f1d",
          100: "#12312d",
          200: "#1d4c45",
          300: "#247066",
          400: "#2dd4bf",
          500: "#34d399",
          600: "#34d399",
          700: "#6ee7b7",
          800: "#a7f3d0",
          900: "#d1fae5",
        },
        clinical: {
          paper: "#080c14",
          surface: "#0e1623",
          ink: "#e2e8f0",
          muted: "#94a3b8",
          line: "#1c2d47",
          alert: "#ef4444",
          warn: "#f59e0b",
          success: "#22c55e",
          info: "#38bdf8",
        },
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
      boxShadow: {
        card: "0 14px 40px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(56, 189, 248, 0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
