import type { Config } from "tailwindcss";

// Ported verbatim from portal-bridge's tailwind.config.ts for an exact visual match
// (same color tokens, fonts, animations). content globs adjusted to this project's layout.
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Inter', 'sans-serif'],
        h5: "var(--h5-font-family)",
        p3: "var(--p3-font-family)",
        "p3-bold": "var(--p3-bold-font-family)",
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        portal: {
          cyan: "hsl(var(--portal-cyan))",
          "cyan-glow": "hsl(var(--portal-cyan-glow))",
          purple: "hsl(var(--portal-purple))",
          pink: "hsl(var(--portal-pink))",
        },
        void: "hsl(var(--void))",
        "COTI-v2-brand-primary-blue": "var(--COTI-v2-brand-primary-blue)",
        "COTI-v2-brand-secondary-green": "var(--COTI-v2-brand-secondary-green)",
        "COTI-v2-brand-secondary-light-green": "var(--COTI-v2-brand-secondary-light-green)",
        "COTI-v2-brand-secondary-light-purple": "var(--COTI-v2-brand-secondary-light-purple)",
        "COTI-v2-brand-secondary-navy": "var(--COTI-v2-brand-secondary-navy)",
        "COTI-v2-brand-secondary-navy-60": "var(--COTI-v2-brand-secondary-navy-60)",
        "COTI-v2-supporting-primary-blue-200": "var(--COTI-v2-supporting-primary-blue-200)",
        "COTI-v2-supporting-white": "var(--COTI-v2-supporting-white)",
      },
      boxShadow: {
        "swap-hover": "var(--swap-hover)",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "portal-spin": {
          from: { transform: "rotate(0deg)" },
          to: { transform: "rotate(360deg)" },
        },
        "portal-pulse": {
          "0%, 100%": { opacity: "0.4", transform: "scale(1)" },
          "50%": { opacity: "0.8", transform: "scale(1.1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "portal-spin": "portal-spin 20s linear infinite",
        "portal-pulse": "portal-pulse 3s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
