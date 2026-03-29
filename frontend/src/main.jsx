import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as Sentry from '@sentry/react'
import App from './App'
import './index.css'

// ── Sentry: Frontend Error Tracking ──────────────────────────────────────────
// Catches JavaScript errors, promise rejections, and React rendering errors.
// Sends them to your Sentry dashboard so you see user-facing crashes in real time.
//
// HOW TO SET UP:
//   1. Sign up at https://sentry.io (free tier is generous)
//   2. Create a project → choose "React"
//   3. Copy the DSN from the setup page
//   4. Add to .env.local:  VITE_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
//   5. Restart dev server
//
// In local dev without the DSN, Sentry is disabled and errors still appear in console.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,     // 'development' or 'production'
    // Only send errors in production — don't pollute your dashboard during dev
    enabled: import.meta.env.PROD,
    // Capture 10% of sessions as performance traces — enough to spot slow pages
    tracesSampleRate: 0.1,
    integrations: [
      Sentry.browserTracingIntegration(),
    ],
    // Don't send user email or IP — respects privacy
    beforeSend(event) {
      if (event.user) {
        delete event.user.email
        delete event.user.ip_address
      }
      return event
    },
  })
}

// ── React Query: Server State Management ──────────────────────────────────────
// Handles all API calls with caching, refetching, and loading/error states.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,   // data is fresh for 30s before re-fetching
      retry: 1,            // retry once on network error
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>
)
