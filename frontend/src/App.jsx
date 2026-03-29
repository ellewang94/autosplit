import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import GroupsPage from './pages/GroupsPage'
import TripOverviewPage from './pages/TripOverviewPage'
import UploadPage from './pages/UploadPage'
import TransactionsPage from './pages/TransactionsPage'
import SettlementPage from './pages/SettlementPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import SharePage from './pages/SharePage'
import JoinPage from './pages/JoinPage'
import LandingPage from './pages/LandingPage'
import SplitCalculatorPage from './pages/SplitCalculatorPage'
import PrivacyPage from './pages/PrivacyPage'
import TermsPage from './pages/TermsPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import NotFoundPage from './pages/NotFoundPage'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Zap } from 'lucide-react'

/**
 * ProtectedRoute — wraps any route that requires the user to be signed in.
 *
 * If the user is not signed in, redirects them to /login.
 * Passes `state.from` so after login they're sent back to where they were headed.
 * Shows a loading state while we check for an existing session (prevents flash).
 */
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  // Still checking for an existing session — don't flash the login page
  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink-400">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center">
            <Zap size={14} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-mono tracking-wider animate-pulse">Loading…</span>
        </div>
      </div>
    )
  }

  // Not signed in — redirect to login, remembering where they wanted to go
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return children
}

/**
 * HomepageRoute — smart home route.
 * Logged-in users go straight to /groups. Everyone else sees the landing page.
 * Shows a loading state while we check for an existing session (prevents flash).
 */
function HomepageRoute() {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink-400">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center">
            <Zap size={14} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-mono tracking-wider animate-pulse">Loading…</span>
        </div>
      </div>
    )
  }
  if (user) return <Navigate to="/groups" replace />
  return <LandingPage />
}

/**
 * AppRoutes — inner component that uses useAuth (must be inside AuthProvider).
 */
function AppRoutes() {
  return (
    <Routes>
      {/* ── Public routes (no login required) ─────────────────────────────── */}
      {/* / → landing page (or /groups if signed in) */}
      <Route path="/" element={<HomepageRoute />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      {/* Share page — public read-only trip view, no login needed */}
      <Route path="/share/:shareCode" element={<SharePage />} />
      {/* Trip invite — lets friends join a trip and contribute their statements */}
      <Route path="/join/:inviteCode" element={<JoinPage />} />
      {/* Free expense calculator — SEO asset + product funnel, no login needed */}
      <Route path="/split" element={<SplitCalculatorPage />} />
      {/* Legal pages — public, no login needed */}
      <Route path="/privacy" element={<PrivacyPage />} />
      <Route path="/terms" element={<TermsPage />} />
      {/* Password reset flow — both routes are public (no session yet) */}
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* ── Protected routes (must be signed in) ───────────────────────────── */}
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route path="/groups" element={<GroupsPage />} />
        {/* Trip overview — the landing page when you open a trip */}
        <Route path="/groups/:groupId" element={<TripOverviewPage />} />
        <Route path="/groups/:groupId/upload" element={<UploadPage />} />
        <Route path="/groups/:groupId/transactions" element={<TransactionsPage />} />
        <Route path="/groups/:groupId/settlement" element={<SettlementPage />} />
      </Route>

      {/* Catch-all: any unknown URL shows the 404 page */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      {/* AuthProvider must wrap everything that uses useAuth() */}
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
