window.tailwind = window.tailwind || {};
window.tailwind.config = {
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Monaco", "Consolas", "Liberation Mono", "Courier New"],
      },
      colors: {
        obsidian: "#050505",
        glass: "rgba(255,255,255,0.06)",
        glass2: "rgba(255,255,255,0.09)",
        edge: "rgba(255,255,255,0.10)",
        edge2: "rgba(255,255,255,0.16)",
        zen: {
          50: "#EAF3FF",
          100: "#CDE4FF",
          200: "#9FC8FF",
          300: "#74AEFF",
          400: "#4E91FF",
          500: "#2B73FF",
          600: "#1D55D3",
          700: "#163FA8",
          800: "#122F7D",
          900: "#0E235C",
        },
        plasma: {
          a: "#8B5CF6",
          b: "#22D3EE",
          c: "#60A5FA",
        },
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(255,255,255,0.08), 0 10px 30px rgba(0,0,0,0.65)",
        glow2: "0 0 0 1px rgba(255,255,255,0.10), 0 0 28px rgba(43,115,255,0.22)",
        insetGlow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
      },
      keyframes: {
        zenithIn: {
          "0%": { opacity: 0, transform: "translateY(12px) scale(0.985)", filter: "blur(10px)" },
          "100%": { opacity: 1, transform: "translateY(0) scale(1)", filter: "blur(0px)" },
        },
        floaty: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-6px)" },
        },
        shimmer: {
          "0%": { transform: "translateX(-120%)" },
          "100%": { transform: "translateX(120%)" },
        },
        pulseEdge: {
          "0%,100%": {
            boxShadow: "0 0 0 1px rgba(255,255,255,0.10), 0 0 25px rgba(34,211,238,0.10)",
          },
          "50%": {
            boxShadow: "0 0 0 1px rgba(255,255,255,0.16), 0 0 30px rgba(139,92,246,0.18)",
          },
        },
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: 0 },
          "100%": { transform: "translateY(0)", opacity: 1 },
        },
      },
      animation: {
        zenithIn: "zenithIn 700ms cubic-bezier(.2,.9,.2,1) both",
        floaty: "floaty 8s ease-in-out infinite",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        pulseEdge: "pulseEdge 2.6s ease-in-out infinite",
        slideUp: "slideUp 420ms cubic-bezier(.2,.9,.2,1) both",
      },
    },
  },
};
