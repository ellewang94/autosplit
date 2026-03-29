import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

export default defineConfig({
  plugins: [
    react(),
    // Uploads source maps to Sentry after every production build.
    // This lets Sentry show human-readable stack traces ("LoginPage.jsx:54")
    // instead of minified garbage ("e.t(main.abc123.js:1:4532)").
    // Reads SENTRY_AUTH_TOKEN from environment — set in Vercel, not in code.
    // Automatically skipped in local dev if the token isn't present.
    sentryVitePlugin({
      org: 'autosplit',
      project: 'javascript-react',
    }),
  ],
  build: {
    // Source maps are required for Sentry to decode minified production errors.
    sourcemap: true,
  },
  server: {
    port: 5173,
    // Proxy API requests to the FastAPI backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:8001',
        changeOrigin: true,
      },
    },
  },
})
