/**
 * JoinPage — the invite landing page.
 *
 * When the trip organizer shares an invite link (autosplit.co/join/[code]),
 * this is what their friends see. It handles the full join flow:
 *
 * 1. Preview the trip (no login needed — just show what they're joining)
 * 2. Auth gate: if not signed in, show sign-up / sign-in CTAs
 * 3. Join form: pick your name from existing members OR add yourself as new
 * 4. Redirect into the trip once joined
 *
 * The key design principle: the person receiving the invite should feel
 * welcomed and oriented ("you're joining Jane's Japan trip"), not confronted
 * with a generic sign-up wall.
 */
import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import { Zap, Users, Calendar, ArrowRight, CheckCircle, AlertCircle, Loader, UserPlus, UserCheck } from 'lucide-react'

function formatDateRange(start, end) {
  if (!start && !end) return null
  const opts = { month: 'short', day: 'numeric', year: 'numeric' }
  if (start && end) {
    const [sy, sm, sd] = start.split('-').map(Number)
    const [ey, em, ed] = end.split('-').map(Number)
    const startStr = new Date(sy, sm - 1, sd).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    const endStr = new Date(ey, em - 1, ed).toLocaleDateString('en-US', opts)
    return `${startStr} – ${endStr}`
  }
  const [y, m, d] = (start || end).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts)
}

export default function JoinPage() {
  const { inviteCode } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user, signInWithGoogle } = useAuth()

  const [preview, setPreview] = useState(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState(null)

  // Join form state
  // mode: 'claim' = pick an existing member | 'new' = add yourself as new member
  const [mode, setMode] = useState('claim')
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [newName, setNewName] = useState('')
  const [joining, setJoining] = useState(false)
  const [joinError, setJoinError] = useState(null)

  // Load the trip preview (public — no auth needed)
  useEffect(() => {
    api.getInvitePreview(inviteCode)
      .then(data => {
        setPreview(data)
        // If there are no unclaimed slots, default to 'new' mode
        if (!data.unclaimed_members?.length) setMode('new')
      })
      .catch(e => setPreviewError(e.message))
      .finally(() => setPreviewLoading(false))
  }, [inviteCode])

  // Auto-select the only unclaimed member if there's just one
  useEffect(() => {
    if (preview?.unclaimed_members?.length === 1 && mode === 'claim') {
      setSelectedMemberId(String(preview.unclaimed_members[0].id))
    }
  }, [preview, mode])

  async function handleGoogleSignIn() {
    // Store the invite code so GroupsPage can redirect back here after Google auth
    sessionStorage.setItem('pendingJoin', inviteCode)
    await signInWithGoogle()
  }

  async function handleJoin(e) {
    e.preventDefault()
    setJoinError(null)

    if (mode === 'claim' && !selectedMemberId) {
      setJoinError('Select which member you are, or choose to join as a new member.')
      return
    }
    if (mode === 'new' && !newName.trim()) {
      setJoinError('Enter your name.')
      return
    }

    setJoining(true)
    try {
      const result = await api.joinTrip(inviteCode, {
        claimMemberId: mode === 'claim' ? parseInt(selectedMemberId) : null,
        newName: mode === 'new' ? newName.trim() : null,
      })
      // Success — navigate into the trip
      navigate(`/groups/${result.group_id}`, { replace: true })
    } catch (e) {
      setJoinError(e.message)
      setJoining(false)
    }
  }

  const dateRange = preview ? formatDateRange(preview.start_date, preview.end_date) : null

  // ── Loading ────────────────────────────────────────────────────────────────
  if (previewLoading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        <div className="pointer-events-none fixed inset-0" style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.08) 0%, transparent 70%)'
        }} />
        <div className="flex items-center gap-3 text-ink-400 relative">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center">
            <Zap size={14} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-mono tracking-wider animate-pulse">Loading invite…</span>
        </div>
      </div>
    )
  }

  // ── Error / expired link ───────────────────────────────────────────────────
  if (previewError || !preview) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
        <div className="pointer-events-none fixed inset-0" style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.05) 0%, transparent 70%)'
        }} />
        <div className="w-full max-w-sm text-center relative">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-400/10 border border-red-400/30 mb-5">
            <AlertCircle size={26} className="text-red-400" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink-50 mb-2">Invite not found</h1>
          <p className="text-sm text-ink-400 mb-6 leading-relaxed">
            This invite link may have expired or been revoked. Ask the trip organizer to send you a fresh one.
          </p>
          <Link to="/signup" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lime-400 text-ink-950 text-sm font-semibold hover:bg-lime-500 transition-colors">
            <Zap size={14} strokeWidth={2.5} />
            Start your own trip
          </Link>
        </div>
      </div>
    )
  }

  // ── Main view ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4 py-12">

      <div className="pointer-events-none fixed inset-0" style={{
        background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.08) 0%, transparent 70%)'
      }} />

      <div className="w-full max-w-sm relative">

        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center shadow-sm shadow-lime-400/20">
            <Zap size={15} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <div className="font-display text-lg font-semibold text-ink-50">AutoSplit</div>
        </div>

        {/* Trip preview card */}
        <div className="bg-ink-900 border border-ink-700 rounded-2xl p-5 mb-5 shadow-xl">
          <div className="text-xs text-ink-500 mb-2 font-mono tracking-wide uppercase">You've been invited to</div>
          <h1 className="font-display text-2xl font-semibold text-ink-50 leading-tight mb-3">
            {preview.trip_name}
          </h1>
          <div className="flex flex-wrap gap-3 text-sm text-ink-400">
            {dateRange && (
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                {dateRange}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              {preview.member_count} {preview.member_count === 1 ? 'person' : 'people'}
            </span>
          </div>
        </div>

        {/* ── Not signed in: auth gate ────────────────────────────────────── */}
        {!user ? (
          <div className="bg-ink-900 border border-ink-700 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 pt-6 pb-5">
              <p className="text-sm text-ink-300 mb-5 leading-relaxed">
                Sign in to join this trip and contribute your own expenses.
              </p>

              {/* Google — primary */}
              <button
                onClick={handleGoogleSignIn}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl
                           bg-white hover:bg-gray-50 active:bg-gray-100
                           text-gray-700 text-sm font-medium border border-gray-200
                           transition-all duration-150 shadow-sm mb-4"
              >
                {/* Google G icon */}
                <svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/>
                  <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.962L3.964 6.294C4.672 4.167 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                Continue with Google
              </button>

              <div className="flex items-center gap-3 mb-4">
                <div className="flex-1 h-px bg-ink-800" />
                <span className="text-xs text-ink-600 font-mono">or</span>
                <div className="flex-1 h-px bg-ink-800" />
              </div>

              <div className="flex gap-2">
                {/* Login — preserves the invite via state.from */}
                <Link
                  to="/login"
                  state={{ from: location }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                             border border-ink-600 text-ink-200 text-sm font-medium
                             hover:border-ink-400 hover:bg-ink-800/50 transition-all"
                >
                  Sign in
                </Link>
                {/* Signup — preserves the invite via state.from */}
                <Link
                  to="/signup"
                  state={{ from: location }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                             bg-lime-400 text-ink-950 text-sm font-semibold
                             hover:bg-lime-500 transition-all"
                >
                  Sign up free
                </Link>
              </div>
            </div>
          </div>
        ) : (
          /* ── Signed in: join form ──────────────────────────────────────── */
          <div className="bg-ink-900 border border-ink-700 rounded-2xl overflow-hidden shadow-xl">
            <div className="px-6 pt-6 pb-5">
              <p className="text-sm text-ink-300 mb-5 leading-relaxed">
                Which member are you?
              </p>

              <form onSubmit={handleJoin} className="space-y-4">

                {/* If there are unclaimed slots, let them pick one */}
                {preview.unclaimed_members.length > 0 && (
                  <div className="space-y-2">
                    {/* Mode toggle */}
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <button
                        type="button"
                        onClick={() => setMode('claim')}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          mode === 'claim'
                            ? 'bg-lime-400/15 border border-lime-400/40 text-lime-400'
                            : 'border border-ink-700 text-ink-400 hover:border-ink-500'
                        }`}
                      >
                        <UserCheck size={12} />
                        I'm already listed
                      </button>
                      <button
                        type="button"
                        onClick={() => setMode('new')}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          mode === 'new'
                            ? 'bg-lime-400/15 border border-lime-400/40 text-lime-400'
                            : 'border border-ink-700 text-ink-400 hover:border-ink-500'
                        }`}
                      >
                        <UserPlus size={12} />
                        Add me as new
                      </button>
                    </div>

                    {mode === 'claim' && (
                      <select
                        className="w-full bg-ink-800 border border-ink-600 rounded-xl px-3 py-2.5 text-sm text-ink-100
                                   focus:outline-none focus:border-lime-400/60 transition-colors"
                        value={selectedMemberId}
                        onChange={(e) => setSelectedMemberId(e.target.value)}
                        required={mode === 'claim'}
                      >
                        <option value="">Select your name…</option>
                        {preview.unclaimed_members.map((m) => (
                          <option key={m.id} value={String(m.id)}>{m.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                )}

                {/* New member name input */}
                {(mode === 'new' || preview.unclaimed_members.length === 0) && (
                  <div>
                    {preview.unclaimed_members.length === 0 && (
                      <p className="text-xs text-ink-500 mb-2">
                        All existing slots are claimed. You'll be added as a new member.
                      </p>
                    )}
                    <input
                      type="text"
                      placeholder="Your name (e.g. Anthony)"
                      className="w-full bg-ink-800 border border-ink-600 rounded-xl px-3 py-2.5 text-sm text-ink-100
                                 placeholder-ink-600 focus:outline-none focus:border-lime-400/60 transition-colors"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      autoFocus
                      required={mode === 'new'}
                    />
                  </div>
                )}

                {joinError && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-red-500/8 border border-red-500/20">
                    <AlertCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-red-300">{joinError}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={joining}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl
                             bg-lime-400 text-ink-950 text-sm font-semibold
                             hover:bg-lime-500 active:bg-lime-600 transition-all
                             disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {joining ? (
                    <><Loader size={14} className="animate-spin" /> Joining…</>
                  ) : (
                    <>Join Trip <ArrowRight size={14} /></>
                  )}
                </button>
              </form>
            </div>
          </div>
        )}

        <p className="text-center text-[11px] text-ink-700 mt-6 font-mono tracking-wide">
          AutoSplit · Split trips, not friendships
        </p>
      </div>
    </div>
  )
}
