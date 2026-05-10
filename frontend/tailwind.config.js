/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      colors: {
        brand: {
          50:  "var(--brand-50)",
          100: "var(--brand-100)",
          500: "var(--brand-500)",
          600: "var(--brand-600)",
          700: "var(--brand-700)",
        },
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,.06), 0 4px 16px rgba(0,0,0,.04)",
        "card-hover": "0 4px 12px rgba(0,0,0,.08), 0 12px 32px rgba(0,0,0,.06)",
        modal: "0 20px 60px rgba(0,0,0,.12)",
      },
      borderRadius: {
        DEFAULT: "var(--radius)",
        sm: "var(--radius-sm)",
        lg: "var(--radius-lg)",
      },
      animation: {
        "fade-up":  "fadeUp .4s ease forwards",
        "fade-in":  "fadeIn .3s ease forwards",
        "slide-in": "slideIn .3s ease forwards",
        "pulse-slow":"pulse 3s cubic-bezier(.4,0,.6,1) infinite",
      },
      keyframes: {
        fadeUp:  { from:{ opacity:0, transform:"translateY(16px)" }, to:{ opacity:1, transform:"translateY(0)" } },
        fadeIn:  { from:{ opacity:0 }, to:{ opacity:1 } },
        slideIn: { from:{ opacity:0, transform:"translateX(-16px)" }, to:{ opacity:1, transform:"translateX(0)" } },
      },
    },
  },
  plugins: [],
};
