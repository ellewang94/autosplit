import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'

// React Query client — handles caching, refetching, loading states
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,     // data is fresh for 30s before re-fetching
      retry: 1,              // retry once on error
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
