import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        paper: {
          50: "#FFFcf7",
          100: "#FBF6EC",
          200: "#F3EDE3",
          300: "#E8DCC8",
          400: "#D4C4A8",
        },
        ink: {
          50: "#F4EFE8",
          100: "#E4D8C8",
          200: "#C4B09A",
          300: "#8A7560",
          400: "#5C4B3C",
          500: "#3A2C22",
          600: "#2A1F18",
          700: "#1C1410",
          800: "#120D0A",
        },
        gold: {
          50: "#FBF6E8",
          100: "#F0E2B8",
          200: "#E0C56E",
          300: "#C9A227",
          400: "#A7841C",
          500: "#7A6110",
        },
        burgundy: {
          400: "#A34B58",
          500: "#7A2E3A",
          600: "#5C212B",
        },
        forest: {
          400: "#4A7A64",
          500: "#2C4A3E",
          600: "#1D332B",
        },
        verified: "#2C6E49",
        review: "#B45309",
        unsupported: "#9B2335",
      },
      fontFamily: {
        serif: ["var(--font-serif)", "Source Serif 4", "Georgia", "serif"],
        sans: ["var(--font-sans)", "Figtree", "system-ui", "sans-serif"],
        devanagari: ["var(--font-devanagari)", "Noto Sans Devanagari", "serif"],
        display: ["var(--font-display)", "Fraunces", "Georgia", "serif"],
      },
      boxShadow: {
        book: "0 25px 50px -12px rgba(28, 20, 16, 0.25), 0 0 0 1px rgba(28,20,16,0.06)",
        soft: "0 8px 30px rgba(28, 20, 16, 0.08)",
        stamp: "0 2px 0 rgba(28,20,16,0.15)",
      },
      backgroundImage: {
        grain:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E\")",
      },
    },
  },
  plugins: [],
};

export default config;
