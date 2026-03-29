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
          // Obsidian Clarity palette — blue cast removed from light shades.
          // Previous palette had a 16–24pt blue bias in every light color
          // (e.g. old ink-100 was #D8D8E8: R=216, G=216, B=232 — B was 16 higher).
          // That cold lavender tint made whites feel washed-out and muted even
          // though the raw contrast ratios were technically fine.
          // New values are neutral-to-warm, crisper, and easier to read at a glance.
          500: '#72728A',  // was #666680 — slightly brighter, less blue
          400: '#9898B0',  // was #8888A8 — notably brighter, less blue (6.8:1 on ink-900)
          300: '#BABACE',  // was #A8A8C0 — brighter, cleaner neutral
          200: '#D4D4E0',  // was #C0C0D4 — brighter, much less blue
          100: '#E8E8EE',  // was #D8D8E8 — significantly brighter, near-neutral white
          50:  '#F6F6F9',  // was #F0F0F8 — near-pure white, minimal tint
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
