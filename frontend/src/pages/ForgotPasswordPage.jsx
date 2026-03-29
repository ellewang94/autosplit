/**
 * ForgotPasswordPage — /forgot-password
 *
 * User enters their email → Supabase sends a password reset link.
 * The link redirects to /reset-password where they set a new password.
 *
 * This is critical for email/password signups. Google OAuth users
 * don't need this — they always authenticate via Google.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Zap, Mail, ArrowLeft, CheckCircle, AlertCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    // Supabase sends a magic reset link to the email.
    // The link redirects to /reset-password with an access token in the URL hash.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (sent) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
        <div className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.08) 0%, transparent 70%)' }} />
        <div className="w-full max-w-sm relative text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-lime-400/10 border border-lime-400/30 mb-5">
            <CheckCircle size={26} className="text-lime-400" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink-50 mb-2">Check your email</h1>
          <p className="text-sm text-ink-400 leading-relaxed mb-6">
            We sent a reset link to <span className="text-ink-200 font-medium">{email}</span>.
            Click it to set a new password — the link expires in 1 hour.
          </p>
          <Link to="/login" className="btn-secondary inline-flex items-center gap-2">
            <ArrowLeft size={13} />
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.08) 0%, transparent 70%)' }} />

      <div className="w-full max-w-sm relative">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-lime-400 mb-4 shadow-lg shadow-lime-400/20">
            <Zap size={22} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink-50 leading-tight">
            Reset password
          </h1>
          <p className="text-sm text-ink-400 mt-1.5">We'll email you a reset link</p>
        </div>

        <div className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-6 pt-6 pb-5 space-y-4">

            {error && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label mb-1.5">Email address</label>
                <div className="relative">
                  <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                  <input
                    type="email"
                    className="input w-full pl-9 text-sm"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={loading}
              >
                {loading ? 'Sending…' : 'Send reset link'}
              </button>
            </form>

          </div>

          <div className="px-6 py-4 bg-ink-800/40 border-t border-ink-800 text-center">
            <Link to="/login" className="text-xs text-ink-400 hover:text-ink-200 transition-colors inline-flex items-center gap-1.5">
              <ArrowLeft size={11} />
              Back to sign in
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
