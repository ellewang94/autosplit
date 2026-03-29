/**
 * SignupPage — account creation.
 *
 * Google OAuth is the primary CTA. Email/password available as fallback.
 * For Google signups there's no confirmation step — they're in immediately.
 */
import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { Zap, Mail, Lock, AlertCircle, CheckCircle, ArrowRight, RefreshCw, ChevronDown } from 'lucide-react'

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

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  // Track whether user clicked "resend" so we can show confirmation text
  const [resent, setResent] = useState(false)
  // Required: user must check this before creating an account
  const [tosAccepted, setTosAccepted] = useState(false)
  // Optional field: "How did you hear about us?"
  const [hearAbout, setHearAbout] = useState('')
  const { signUp, signInWithGoogle } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()

  async function handleGoogle() {
    setGoogleLoading(true)
    setError(null)
    // If we came from a join page, store the invite code so GroupsPage can redirect back
    const fromPath = location.state?.from?.pathname
    if (fromPath?.startsWith('/join/')) {
      const code = fromPath.split('/join/')[1]
      if (code) sessionStorage.setItem('pendingJoin', code)
    }
    await signInWithGoogle()
    // Page will redirect to Google — no need to reset state
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    if (password !== confirm) { setError("Passwords don't match."); return }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (!tosAccepted) { setError('Please accept the Terms of Service and Privacy Policy to continue.'); return }
    setLoading(true)

    // Save the "how did you hear" answer to localStorage for analytics.
    // We do this BEFORE the signup call so it's stored even if something goes sideways.
    if (hearAbout) {
      localStorage.setItem('autosplit_hear_about', hearAbout)
    }

    const { data, error } = await signUp(email, password)
    setLoading(false)

    if (error) {
      setError(error.message)
    } else if (data?.session) {
      // Supabase auto-confirmed the user (email confirmation is disabled in the dashboard).
      // Session exists immediately — redirect straight to /groups.
      navigate('/groups', { replace: true })
    } else {
      // Supabase requires email confirmation — show the check-email screen.
      setEmailSent(true)
    }
  }

  // Resend the confirmation email using Supabase's resend API.
  // This is useful when the user doesn't receive the first email.
  async function handleResend() {
    setResent(false)
    try {
      await supabase.auth.resend({ type: 'signup', email })
      setResent(true)
    } catch (err) {
      // If resend fails, silently ignore — it's a non-critical feature
      console.error('Resend failed:', err)
    }
  }

  // ── Email confirmation sent state ─────────────────────────────────────────
  if (emailSent) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
        <div className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.08) 0%, transparent 70%)' }} />
        <div className="w-full max-w-sm relative text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lime-400/10 border border-lime-400/30 mb-5">
            <CheckCircle size={26} className="text-lime-400" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink-50 mb-2">Check your email</h1>
          <p className="text-sm text-ink-400 mb-6 leading-relaxed">
            We sent a confirmation link to <span className="text-ink-200 font-medium">{email}</span>.
            Click it to activate your account, then sign in.
          </p>
          <Link to="/login" className="btn-secondary inline-flex items-center gap-2 mb-5">
            Back to sign in <ArrowRight size={13} />
          </Link>

          {/* Resend confirmation email — helpful if the email doesn't arrive */}
          <div className="mt-2">
            {resent ? (
              <p className="text-xs text-lime-400 font-mono flex items-center justify-center gap-1.5">
                <CheckCircle size={12} />
                Sent! Check your inbox again.
              </p>
            ) : (
              <button
                onClick={handleResend}
                className="text-xs text-ink-500 hover:text-ink-300 transition-colors flex items-center gap-1.5 mx-auto"
              >
                <RefreshCw size={11} />
                Resend confirmation email
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Sign-up form ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">

      <div className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.08) 0%, transparent 70%)' }} />

      <div className="w-full max-w-sm relative">

        {/* Brand lockup */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-lime-400 mb-4 shadow-lg shadow-lime-400/20">
            <Zap size={22} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink-50 leading-tight">
            Create account
          </h1>
          <p className="text-sm text-ink-400 mt-1.5">Your first trip is on us</p>
        </div>

        <div className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden">

          <div className="px-6 pt-6 pb-5 space-y-4">

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
                  <input type="email" className="input w-full pl-9 text-sm" placeholder="you@example.com"
                    value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus />
                </div>
              </div>
              <div>
                <label className="label mb-1.5">Password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                  <input type="password" className="input w-full pl-9 text-sm" placeholder="6+ characters"
                    value={password} onChange={(e) => setPassword(e.target.value)} required />
                </div>
              </div>
              <div>
                <label className="label mb-1.5">Confirm password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                  <input type="password" className="input w-full pl-9 text-sm" placeholder="Same again"
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                </div>
              </div>
              {/* ── Optional attribution field ────────────────────────────────── */}
              {/* We use this data to understand which channels are driving signups.
                  This is optional — the user can leave it blank. */}
              <div>
                <label className="label mb-1.5">How did you hear about us? <span className="text-ink-600 normal-case font-normal">(optional)</span></label>
                <div className="relative">
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                  <select
                    className="select w-full text-sm appearance-none pr-8"
                    value={hearAbout}
                    onChange={(e) => setHearAbout(e.target.value)}
                  >
                    <option value="">Select an option…</option>
                    <option value="Friend / word of mouth">Friend / word of mouth</option>
                    <option value="Reddit">Reddit</option>
                    <option value="Product Hunt">Product Hunt</option>
                    <option value="Hacker News">Hacker News</option>
                    <option value="Google search">Google search</option>
                    <option value="TikTok / Instagram">TikTok / Instagram</option>
                    <option value="Twitter / X">Twitter / X</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* ── Terms of Service acceptance — required field ─────────────── */}
              {/* Users must explicitly agree before we create their account.
                  This is both a legal requirement and good trust-building practice. */}
              <label className="flex items-start gap-2.5 cursor-pointer group">
                <div className="relative flex-shrink-0 mt-0.5">
                  <input
                    type="checkbox"
                    checked={tosAccepted}
                    onChange={(e) => setTosAccepted(e.target.checked)}
                    className="sr-only"
                  />
                  {/* Custom checkbox visual — green when checked */}
                  <div className={`w-4 h-4 rounded border transition-all ${
                    tosAccepted
                      ? 'bg-lime-400 border-lime-400'
                      : 'border-ink-600 bg-ink-800 group-hover:border-ink-400'
                  } flex items-center justify-center`}>
                    {tosAccepted && (
                      <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                        <path d="M1 3.5L3.5 6L8 1" stroke="#07070A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-xs text-ink-400 leading-relaxed">
                  I agree to AutoSplit's{' '}
                  <Link to="/terms" target="_blank" className="text-lime-400 hover:underline">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" target="_blank" className="text-lime-400 hover:underline">Privacy Policy</Link>
                </span>
              </label>

              <button type="submit" className="btn-primary w-full justify-center gap-2" disabled={loading || googleLoading || !tosAccepted}>
                {loading ? 'Creating account…' : (<>Create account <ArrowRight size={14} /></>)}
              </button>
            </form>

          </div>

          <div className="px-6 py-4 bg-ink-800/40 border-t border-ink-800 text-center">
            <p className="text-xs text-ink-400">
              Already have an account?{' '}
              <Link to="/login" className="text-lime-400 font-medium hover:text-lime-300 transition-colors">Sign in</Link>
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
