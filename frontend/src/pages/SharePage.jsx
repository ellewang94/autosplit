/**
 * SharePage — the public read-only trip settlement view.
 *
 * Anyone with a share link (e.g. /share/abc123-...) can open this page
 * without signing up. It shows:
 *   - Trip name and dates
 *   - Who owes whom (the settlement transfers)
 *   - Total shared expenses
 *   - A "try AutoSplit" CTA — the viral loop
 *
 * This page is intentionally minimal and works on mobile.
 * NO sensitive data is exposed — only member names and amounts.
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api/client'
import {
  Zap, ArrowRight, Users, DollarSign, CheckCircle, AlertCircle,
  Calendar, Loader, Eye,
} from 'lucide-react'

// Currency symbols — same map used throughout the app
const CURRENCY_SYMBOLS = {
  USD: '$', AUD: 'A$', NZD: 'NZ$', JPY: '¥',
  GBP: '£', EUR: '€', CAD: 'C$', SGD: 'S$', HKD: 'HK$', THB: '฿',
}

function formatAmount(amount, currency = 'USD') {
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' '
  const decimals = currency === 'JPY' ? 0 : 2
  return `${sym}${Math.abs(amount).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`
}

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
  if (start) {
    const [y, m, d] = start.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', opts)
  }
  const [y, m, d] = end.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', opts)
}


// ── Avatar initials ───────────────────────────────────────────────────────────
// Consistent color palette for member avatars
const AVATAR_COLORS = [
  'bg-lime-400 text-ink-950',
  'bg-green-400 text-ink-950',
  'bg-amber-400 text-ink-950',
  'bg-red-400 text-white',
  'bg-blue-400 text-white',
  'bg-purple-400 text-white',
]

function Avatar({ name, index, size = 'md' }) {
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const color = AVATAR_COLORS[index % AVATAR_COLORS.length]
  const sizeClass = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-10 h-10 text-sm'
  return (
    <div className={`${sizeClass} ${color} rounded-full flex items-center justify-center font-bold flex-shrink-0`}>
      {initials}
    </div>
  )
}


// ── Transfer row ──────────────────────────────────────────────────────────────
function TransferRow({ transfer, currency, index, memberIndex }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="bg-ink-800/40 border border-ink-700 rounded-xl p-4 animate-slide-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      {/* Main row: From → To + Amount */}
      <div className="flex items-center gap-3">
        {/* Avatars */}
        <div className="flex items-center gap-1.5">
          <Avatar
            name={transfer.from_member_name}
            index={memberIndex(transfer.from_member_name)}
            size="sm"
          />
          <ArrowRight size={12} className="text-ink-500" />
          <Avatar
            name={transfer.to_member_name}
            index={memberIndex(transfer.to_member_name)}
            size="sm"
          />
        </div>

        {/* Names */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-ink-100">{transfer.from_member_name}</span>
          <span className="text-xs text-ink-500 mx-1.5">pays</span>
          <span className="text-sm font-medium text-ink-100">{transfer.to_member_name}</span>
        </div>

        {/* Amount */}
        <div className="font-mono text-lg font-bold text-lime-400 flex-shrink-0">
          {formatAmount(transfer.amount, currency)}
        </div>
      </div>

      {/* Expand: show the copyable payment request message */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-2 text-xs text-ink-500 hover:text-ink-300 transition-colors flex items-center gap-1"
      >
        <span>{expanded ? 'Hide message' : 'Show payment message'}</span>
        <ArrowRight size={10} className={`transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-ink-700/60 animate-slide-up">
          <div className="bg-ink-900 rounded-lg px-3 py-2.5 text-xs text-ink-300 font-mono leading-relaxed border border-ink-700/60">
            {transfer.payment_request}
          </div>
          <button
            onClick={() => navigator.clipboard.writeText(transfer.payment_request)}
            className="mt-2 text-xs text-ink-500 hover:text-lime-400 transition-colors"
          >
            Copy message
          </button>
        </div>
      )}
    </div>
  )
}


// ── Main page ─────────────────────────────────────────────────────────────────
export default function SharePage() {
  const { shareCode } = useParams()
  const [trip, setTrip] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch the public trip data on mount
  useEffect(() => {
    api.getPublicShare(shareCode)
      .then(setTrip)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [shareCode])

  // Build a lookup: member_name → index (for consistent avatar colors)
  const memberIndex = (name) => {
    if (!trip) return 0
    const idx = trip.members.findIndex(m => m.name === name)
    return idx >= 0 ? idx : 0
  }

  const dateRange = trip ? formatDateRange(trip.start_date, trip.end_date) : null
  const hasTransfers = trip?.transfers?.length > 0

  // ── Loading state ────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center">
        {/* Lime glow at top */}
        <div className="pointer-events-none fixed inset-0" style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.08) 0%, transparent 70%)'
        }} />
        <div className="flex items-center gap-3 text-ink-400 relative">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center">
            <Zap size={14} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <span className="text-sm font-mono tracking-wider animate-pulse">Loading…</span>
        </div>
      </div>
    )
  }

  // ── Error state ──────────────────────────────────────────────────────────
  if (error || !trip) {
    return (
      <div className="min-h-screen bg-ink-950 flex items-center justify-center px-4">
        <div className="pointer-events-none fixed inset-0" style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.05) 0%, transparent 70%)'
        }} />
        <div className="w-full max-w-sm text-center relative">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-red-400/10 border border-red-400/30 mb-5">
            <AlertCircle size={26} className="text-red-400" strokeWidth={1.5} />
          </div>
          <h1 className="font-display text-2xl font-semibold text-ink-50 mb-2">Link not found</h1>
          <p className="text-sm text-ink-400 mb-6">
            This share link may have expired or been revoked by the trip organizer.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-lime-400 text-ink-950 text-sm font-semibold hover:bg-lime-500 transition-colors"
          >
            <Zap size={14} strokeWidth={2.5} />
            Start your own trip
          </Link>
        </div>
      </div>
    )
  }

  // ── Main view ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-ink-950">

      {/* Lime glow at top */}
      <div className="pointer-events-none fixed inset-0" style={{
        background: 'radial-gradient(ellipse 60% 40% at 50% -10%, rgba(200,241,53,0.07) 0%, transparent 65%)'
      }} />

      <div className="max-w-2xl mx-auto px-4 py-10 md:py-16 relative">

        {/* ── Header: logo + "shared via AutoSplit" ─────────────────────── */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center shadow-sm shadow-lime-400/20">
              <Zap size={15} className="text-ink-950" strokeWidth={2.5} />
            </div>
            <div className="font-display text-lg font-semibold text-ink-50">AutoSplit</div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-ink-500">
            <Eye size={11} />
            <span>{trip.view_count} view{trip.view_count !== 1 ? 's' : ''}</span>
          </div>
        </div>

        {/* ── Trip header ───────────────────────────────────────────────── */}
        <div className="mb-8 animate-fade-in">
          <h1 className="font-display text-3xl md:text-4xl font-semibold text-ink-50 leading-tight tracking-tight mb-2">
            {trip.trip_name}
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-sm text-ink-400">
            {dateRange && (
              <span className="flex items-center gap-1.5">
                <Calendar size={13} />
                {dateRange}
              </span>
            )}
            <span className="flex items-center gap-1.5">
              <Users size={13} />
              {trip.members.length} {trip.members.length === 1 ? 'person' : 'people'}
            </span>
            <span className="flex items-center gap-1.5">
              <DollarSign size={13} />
              {trip.transaction_count} transactions
            </span>
          </div>
        </div>

        {/* ── Members avatars ───────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3 mb-8 animate-fade-in">
          {trip.members.map((m, i) => (
            <div key={m.id} className="flex items-center gap-2 bg-ink-800/50 border border-ink-700 rounded-full pr-3 pl-1 py-1">
              <Avatar name={m.name} index={i} size="sm" />
              <span className="text-sm font-medium text-ink-200">{m.name}</span>
            </div>
          ))}
        </div>

        {/* ── Summary stats bar ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-ink-900/70 border border-ink-700 rounded-2xl p-4 animate-slide-up">
            <div className="text-xs text-ink-500 mb-1.5">Total shared</div>
            <div className="font-mono text-2xl font-bold text-lime-400">
              {formatAmount(trip.total_shared_expenses, trip.currency)}
            </div>
          </div>
          <div className="bg-ink-900/70 border border-ink-700 rounded-2xl p-4 animate-slide-up" style={{ animationDelay: '80ms' }}>
            <div className="text-xs text-ink-500 mb-1.5">Transfers needed</div>
            <div className="font-mono text-2xl font-bold text-ink-100">
              {trip.transfers.length}
            </div>
          </div>
        </div>

        {/* ── Settlement transfers ──────────────────────────────────────── */}
        <div className="mb-10">
          <h2 className="font-display text-xl font-semibold text-ink-100 mb-4 flex items-center gap-2">
            <ArrowRight size={16} className="text-ink-400" />
            Who owes whom
          </h2>

          {!hasTransfers ? (
            /* All settled — everyone is even */
            <div className="bg-ink-800/40 border border-green-400/20 rounded-2xl p-8 text-center">
              <CheckCircle size={32} className="text-green-400 mx-auto mb-3" strokeWidth={1.5} />
              <p className="font-display text-lg text-ink-100 mb-1">All settled up!</p>
              <p className="text-sm text-ink-400">Everyone's expenses are balanced — no transfers needed.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {trip.transfers.map((t, i) => (
                <TransferRow
                  key={i}
                  transfer={t}
                  currency={trip.currency}
                  index={i}
                  memberIndex={memberIndex}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── CTA: "Try AutoSplit for your next trip" ───────────────────── */}
        {/* This is the viral loop — non-users see this and sign up */}
        <div className="bg-ink-900/80 border border-lime-400/20 rounded-2xl p-6 text-center animate-slide-up">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-lime-400 mb-4 shadow-lg shadow-lime-400/20">
            <Zap size={20} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <h3 className="font-display text-xl font-semibold text-ink-50 mb-2">
            Plan your next trip?
          </h3>
          <p className="text-sm text-ink-400 mb-5 leading-relaxed max-w-xs mx-auto">
            AutoSplit makes splitting group expenses effortless. Upload your card statement and settle in minutes.
          </p>
          <Link
            to="/signup"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-lime-400 text-ink-950 text-sm font-semibold hover:bg-lime-500 active:bg-lime-600 transition-colors shadow-md shadow-lime-400/20"
          >
            Try AutoSplit free
            <ArrowRight size={14} />
          </Link>
          <p className="text-xs text-ink-600 mt-3 font-mono">Your first trip is on us</p>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-ink-700 mt-8 font-mono tracking-wide">
          AutoSplit · Split trips, not friendships
        </p>

      </div>
    </div>
  )
}
