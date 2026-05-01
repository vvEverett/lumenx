import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: 'class',
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--color-bg-base)",
        foreground: "var(--color-text-primary)",
        surface: "var(--color-bg-surface)",
        elevated: "var(--color-bg-elevated)",
        "input-bg": "var(--color-bg-input)",
        "hover-bg": "var(--color-bg-hover)",
        glass: "var(--color-glass)",
        "glass-border": "var(--color-border-default)",
        "border-subtle": "var(--color-border-subtle)",
        "text-secondary": "var(--color-text-secondary)",
        "text-muted": "var(--color-text-muted)",
        overlay: "var(--color-overlay)",
        "surface-inset": "var(--color-bg-inset)",
        primary: "#646cff",
        secondary: "#535bf2",
        accent: "#ff0080",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        mono: ["var(--font-jetbrains-mono)", "monospace"],
        display: ["var(--font-space-grotesk)", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
