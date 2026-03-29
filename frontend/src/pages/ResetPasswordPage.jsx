/**
 * ResetPasswordPage — /reset-password
 *
 * The page Supabase redirects to after a user clicks the password reset email.
 * Supabase embeds a short-lived session in the URL hash — it automatically
 * signs the user in for just long enough to update their password.
 *
 * Flow:
 *   1. User clicks reset link in email
 *   2. Lands here at /reset-password#access_token=xxx&type=recovery
 *   3. Supabase's onAuthStateChange fires with event "PASSWORD_RECOVERY"
 *   4. User enters new password → we call supabase.auth.updateUser()
 *   5. Success → redirect to /groups
 */
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Zap, Lock, CheckCircle, AlertCircle } from 'lucide-react'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(false)
  // True once Supabase confirms there's a valid recovery session in the URL
  const [sessionReady, setSessionReady] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    // Supabase fires PASSWORD_RECOVERY when it detects the recovery token in the URL hash.
    // We wait for this before showing the form — before this fires, updateUser() would fail.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)

    if (password !== confirm) {
      setError("Passwords don't match.")
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    // Update the user's password — works because Supabase set a recovery session
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setDone(true)
      // Give the user a moment to read the success message, then go home
      setTimeout(() => navigate('/groups', { replace: true }), 2000)
    }
  }

  // ── Success state ─────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
        <div className="text-center">
          <CheckCircle size={40} className="text-lime-400 mx-auto mb-4" strokeWidth={1.5} />
          <h1 className="font-display text-2xl font-semibold text-ink-50 mb-2">Password updated</h1>
          <p className="text-sm text-ink-400">Taking you to AutoSplit…</p>
        </div>
      </div>
    )
  }

  // ── Waiting for Supabase recovery session ─────────────────────────────────
  if (!sessionReady) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center mx-auto mb-4">
            <Zap size={14} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <p className="text-sm text-ink-400 animate-pulse">Verifying reset link…</p>
        </div>
      </div>
    )
  }

  // ── New password form ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
      <div className="pointer-events-none fixed inset-0" style={{ background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.08) 0%, transparent 70%)' }} />

      <div className="w-full max-w-sm relative">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-lime-400 mb-4 shadow-lg shadow-lime-400/20">
            <Zap size={22} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h1 className="font-display text-3xl font-semibold text-ink-50 leading-tight">
            New password
          </h1>
          <p className="text-sm text-ink-400 mt-1.5">Choose something strong</p>
        </div>

        <div className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden">
          <div className="px-6 pt-6 pb-6 space-y-4">

            {error && (
              <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-red-300">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="label mb-1.5">New password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                  <input
                    type="password"
                    className="input w-full pl-9 text-sm"
                    placeholder="6+ characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoFocus
                  />
                </div>
              </div>

              <div>
                <label className="label mb-1.5">Confirm new password</label>
                <div className="relative">
                  <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
                  <input
                    type="password"
                    className="input w-full pl-9 text-sm"
                    placeholder="Same again"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary w-full justify-center"
                disabled={loading}
              >
                {loading ? 'Updating…' : 'Set new password'}
              </button>
            </form>

          </div>
        </div>

      </div>
    </div>
  )
}
