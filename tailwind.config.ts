import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#050506",
        foreground: "#f4f4f5",
        card: {
          DEFAULT: "rgba(10, 10, 12, 0.7)",
          foreground: "#f4f4f5",
        },
        border: "rgba(255, 255, 255, 0.08)",
        primary: {
          DEFAULT: "#6366f1", // Indigo
          hover: "#4f46e5",
          glow: "rgba(99, 102, 241, 0.15)",
        },
        accent: {
          emerald: "#10b981", // Emerald Green for positive changes
          rose: "#f43f5e",    // Rose for alerts/losses
          amber: "#f59e0b",   // Amber for low stock
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "glass-gradient":
          "linear-gradient(135deg, rgba(255, 255, 255, 0.05) 0%, rgba(255, 255, 255, 0.01) 100%)",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;
