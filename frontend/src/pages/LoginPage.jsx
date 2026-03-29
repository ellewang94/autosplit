/**
 * LoginPage — the sign-in screen.
 *
 * Google OAuth is the primary CTA (one click, no password).
 * Email/password is available as a fallback for people who prefer it.
 */
import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { Zap, Mail, Lock, AlertCircle, ArrowRight, KeyRound } from 'lucide-react'

// Google's official "G" logo as an inline SVG — no extra dependency needed
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
      <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const { signIn, signInWithGoogle } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  // Send the user back to where they were trying to go, or /groups by default
  const from = location.state?.from?.pathname || '/groups'

  async function handleGoogle() {
    setGoogleLoading(true)
    setError(null)
    // If we came from a join page, store the invite code so GroupsPage can redirect back
    const fromPath = location.state?.from?.pathname
    if (fromPath?.startsWith('/join/')) {
      const code = fromPath.split('/join/')[1]
      if (code) sessionStorage.setItem('pendingJoin', code)
    }
    // This redirects to Google — page will leave, so no need to setLoading(false)
    await signInWithGoogle()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      navigate(from, { replace: true })
    }
  }

  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">

      {/* Lime glow at top — depth without gaudiness */}
      <div
        className="pointer-events-none fixed inset-0"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.08) 0%, transparent 70%)',
        }}
      />

      <div className="w-full max-w-sm relative">

        {/* Brand lockup */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-lime-400 mb-4 shadow-lg shadow-lime-400/20">
            <Zap size={22} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink-50 leading-tight">
            Welcome back
          </h1>
          <p className="text-sm text-ink-400 mt-1.5">Sign in to AutoSplit</p>
        </div>

        <div className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden">

          <div className="px-6 pt-6 pb-5 space-y-4">

            {/* Error banner */}
            {error && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            {/* ── Google OAuth — primary CTA ────────────────────────────────── */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading || loading}
              className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl
                         bg-white hover:bg-gray-50 active:bg-gray-100
                         text-gray-700 text-sm font-medium
                         border border-gray-200
                         transition-all duration-150
                         disabled:opacity-60 disabled:cursor-not-allowed
                         shadow-sm"
            >
              <GoogleIcon />
              {googleLoading ? 'Redirecting to Google…' : 'Continue with Google'}
            </button>

            {/* Divider */}
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-ink-800" />
              <span className="text-xs text-ink-600 font-mono">or</span>
              <div className="flex-1 h-px bg-ink-800" />
            </div>

            {/* ── Email / password ─────────────────────────────────────────── */}
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                  <input
                    type="email"
                    className="input w-full pl-9 text-sm"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div>
                <label className="label mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                  <input
                    type="password"
                    className="input w-full pl-9 text-sm"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              {/* Forgot password — small, unobtrusive, but essential */}
              <div className="text-right -mt-1">
                <Link
                  to="/forgot-password"
                  className="text-xs text-ink-500 hover:text-ink-300 transition-colors inline-flex items-center gap-1"
                >
                  <KeyRound size={10} />
                  Forgot password?
                </Link>
              </div>

              <button
                type="submit"
                className="btn-primary w-full justify-center gap-2"
                disabled={loading || googleLoading}
              >
                {loading ? 'Signing in…' : (
                  <>Sign in <ArrowRight size={14} /></>
                )}
              </button>
            </form>

          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-ink-800/40 border-t border-ink-800 text-center">
            <p className="text-xs text-ink-400">
              Don't have an account?{' '}
              <Link to="/signup" className="text-lime-400 font-medium hover:text-lime-300 transition-colors">
                Create one free
              </Link>
            </p>
          </div>

        </div>

        <p className="text-center text-[11px] text-ink-600 mt-5 font-mono tracking-wide">
          AutoSplit · Split trips, not friendships
        </p>

      </div>
    </div>
  )
}
