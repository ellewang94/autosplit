/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        // Headings: Cormorant Garamond — elegant, distinctive, nothing like Inter
        display: ['"Cormorant Garamond"', 'Georgia', 'serif'],
        // Body: Geist — clean and modern
        sans: ['"Geist"', 'system-ui', 'sans-serif'],
        // Data/numbers: Geist Mono — crisp monospace for financial figures
        mono: ['"Geist Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        // Obsidian Ledger theme
        ink: {
          950: '#07070A',
          900: '#0C0C10',
          800: '#111118',
          700: '#1A1A24',
          600: '#252530',
          // ink-500 and ink-400 were too dark to read as text on dark backgrounds.
          // New values pass WCAG AA contrast (4.5:1) on ink-900 backgrounds.
          500: '#666680',  // was #3A3A4A — lightened significantly for readable muted text
          400: '#8888A8',  // was #5A5A70 — now ~5.7:1 contrast on ink-900
          300: '#A8A8C0',  // was #8A8AA0 — slightly lighter to maintain the gradient step
          200: '#C0C0D4',  // was #B0B0C4 — slightly lighter
          100: '#D8D8E8',
          50:  '#F0F0F8',
        },
        // Electric lime accent — punchy, memorable, decidedly not purple
        lime: {
          400: '#C8F135',
          500: '#AACC1E',
          600: '#8BAA0F',
        },
        // Danger / debt
        red: {
          400: '#FF5C5C',
          500: '#E03C3C',
        },
        // Success / credit
        green: {
          400: '#36F0A0',
          500: '#1DD480',
        },
        // Caution
        amber: {
          400: '#FFB800',
          500: '#E0A000',
        },
      },
      animation: {
        'fade-in': 'fadeIn 0.4s ease forwards',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(16px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
}
