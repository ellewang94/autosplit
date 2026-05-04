import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  Upload, List, TrendingUp, CheckCircle, AlertTriangle,
  Calendar, Users, ArrowRight, FileText, ChevronRight, Trash2,
  Loader, Plus, Pencil, X, Hourglass,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'
import PeopleSheet from '../components/PeopleSheet'
import { PaymentHandlesEditor } from '../components/PaymentHandles'

// ── Helpers ───────────────────────────────────────────────────────────────────

const MEMBER_COLORS = [
  'bg-lime-400 text-ink-950',
  'bg-green-400 text-ink-950',
  'bg-amber-400 text-ink-950',
  'bg-red-400 text-white',
  'bg-blue-400 text-white',
]

function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function formatDateShort(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const CURRENCY_SYMBOLS = {
  USD: '$', AUD: 'A$', NZD: 'NZ$', JPY: '¥', GBP: '£', EUR: '€',
  CAD: 'C$', SGD: 'S$', HKD: 'HK$', THB: '฿', MXN: 'Mex$',
}

// ── "Where I stand" balance widget ────────────────────────────────────────────
// One-line read of the current user's personal balance for this trip — the
// thing Splitwise users open the app to check. We hit a lightweight backend
// endpoint so the math always matches what the Settlement page would show.
function MyBalanceWidget({ groupId }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['my-balance', groupId],
    queryFn: () => api.getMyBalance(groupId),
    // Cheap on the backend, safe to refetch on focus to stay current.
    staleTime: 15_000,
  })

  if (isLoading || !data || !data.linked) return null

  const sym = CURRENCY_SYMBOLS[data.currency] || data.currency + ' '
  const fmt = (n) => `${sym}${Math.abs(n).toLocaleString('en-US', {
    minimumFractionDigits: data.currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: data.currency === 'JPY' ? 0 : 2,
  })}`

  // Split into three visual states: you're owed (green), you owe (amber),
  // settled-up (muted). Showing both numbers below the headline mimics
  // Splitwise's "$320 paid · $158.50 your share" breakdown that helps
  // users trust the math.
  const isOwed = data.net > 0.01
  const owes = data.net < -0.01
  const accent = isOwed ? 'lime-400' : owes ? 'amber-400' : 'ink-400'
  const headline = isOwed
    ? `You're owed ${fmt(data.net)}`
    : owes
      ? `You owe ${fmt(data.net)}`
      : `You're settled up`

  return (
    <button
      onClick={() => navigate(`/groups/${groupId}/settlement`)}
      className={clsx(
        'mb-6 w-full rounded-2xl px-5 py-4 text-left animate-slide-up transition-all',
        'border bg-ink-900 hover:bg-ink-800/60',
        isOwed && 'border-lime-400/30 hover:border-lime-400/50',
        owes && 'border-amber-400/30 hover:border-amber-400/50',
        !isOwed && !owes && 'border-ink-700 hover:border-ink-600',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-mono uppercase tracking-widest text-ink-500 mb-1">
            Where you stand
          </div>
          <div className={`font-display text-2xl font-bold text-${accent}`}>
            {headline}
          </div>
          <div className="text-xs text-ink-500 mt-1 font-mono">
            You paid <span className="text-ink-300">{fmt(data.you_paid)}</span>
            {' · '}
            Your share <span className="text-ink-300">{fmt(data.your_share)}</span>
          </div>
        </div>
        <ChevronRight size={18} className={`text-${accent} flex-shrink-0`} />
      </div>
    </button>
  )
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, color }) {
  return (
    <div className="card-sm">
      <div className={clsx('font-mono text-2xl font-bold mb-0.5', color || 'text-ink-100')}>
        {value}
      </div>
      <div className="text-xs text-ink-500">{label}</div>
      {sub && <div className="text-xs text-ink-600 mt-0.5 font-mono">{sub}</div>}
    </div>
  )
}

// ── Workflow step card ────────────────────────────────────────────────────────
// Each card represents one stage of the trip workflow and shows its status.

function WorkflowCard({ icon: Icon, title, description, status, cta, onClick, disabled }) {
  // status: 'done' | 'attention' | 'pending' | 'ready'
  const styles = {
    done:      { border: 'border-ink-700',       bg: '',                    badge: 'bg-green-400/10 text-green-400',  badgeText: 'Done' },
    attention: { border: 'border-amber-400/40',  bg: 'bg-amber-400/5',     badge: 'bg-amber-400/15 text-amber-400',  badgeText: 'Needs attention' },
    ready:     { border: 'border-lime-400/40',   bg: 'bg-lime-400/5',      badge: 'bg-lime-400/15 text-lime-400',    badgeText: 'Ready' },
    pending:   { border: 'border-ink-700',       bg: '',                    badge: 'bg-ink-700 text-ink-500',         badgeText: 'Waiting' },
  }
  const s = styles[status] || styles.pending

  return (
    <button
      className={clsx(
        'card text-left w-full transition-all duration-150 group',
        s.border, s.bg,
        disabled ? 'opacity-40 cursor-not-allowed' : 'hover:border-ink-500 hover:bg-ink-800/60',
      )}
      onClick={!disabled ? onClick : undefined}
    >
      {/* Icon + badge row */}
      <div className="flex items-start justify-between mb-3">
        <div className={clsx(
          'w-9 h-9 rounded-lg flex items-center justify-center',
          status === 'done' ? 'bg-ink-800' :
          status === 'attention' ? 'bg-amber-400/10' :
          status === 'ready' ? 'bg-lime-400/10' : 'bg-ink-800'
        )}>
          <Icon size={16} className={
            status === 'done' ? 'text-ink-400' :
            status === 'attention' ? 'text-amber-400' :
            status === 'ready' ? 'text-lime-400' : 'text-ink-500'
          } />
        </div>
        <span className={clsx('text-[10px] font-medium px-2 py-0.5 rounded-full', s.badge)}>
          {s.badgeText}
        </span>
      </div>

      {/* Text */}
      <div className="font-display text-base font-semibold text-ink-100 mb-1">{title}</div>
      <div className="text-xs text-ink-400 leading-relaxed mb-4">{description}</div>

      {/* CTA */}
      {!disabled && (
        <div className={clsx(
          'flex items-center gap-1.5 text-xs font-medium',
          status === 'attention' ? 'text-amber-400' :
          status === 'ready' ? 'text-lime-400' : 'text-ink-400',
          'group-hover:gap-2.5 transition-all'
        )}>
          {cta}
          <ArrowRight size={12} />
        </div>
      )}
    </button>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TripOverviewPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const [confirmDeleteStmtId, setConfirmDeleteStmtId] = useState(null)

  // The unified People sheet replaces the old inline add-member form, the
  // separate big "Invite your travel companions" card, and the small "+ Add"
  // pill — all three flows now live behind one trigger.
  // Auto-opens when navigating here right after trip creation so the user is
  // immediately prompted to invite people instead of staring at an empty page.
  const [peopleSheetOpen, setPeopleSheetOpen] = useState(
    () => location.state?.newTrip === true
  )

  // Which member is the user editing payment handles for? Set from the People
  // sheet's per-member "Edit pay" button.
  const [editingHandlesFor, setEditingHandlesFor] = useState(null)

  const deleteStatement = useMutation({
    mutationFn: (id) => api.deleteStatement(id),
    onSuccess: () => {
      // Refresh both statements and transactions (deleting a statement cascades to its transactions)
      qc.invalidateQueries(['statements', groupId])
      qc.invalidateQueries(['group-transactions', groupId])
      setConfirmDeleteStmtId(null)
    },
  })

  const { data: group, isLoading: loadingGroup } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
  })

  const { data: transactions = [] } = useQuery({
    queryKey: ['group-transactions', groupId],
    queryFn: () => api.getGroupTransactions(groupId),
    enabled: !!groupId,
  })

  const { data: statements = [] } = useQuery({
    queryKey: ['statements', groupId],
    queryFn: () => api.getStatements(groupId),
    enabled: !!groupId,
  })

  const { user } = useAuth()

  // ── Inline date editor ────────────────────────────────────────────────────
  const [editingDates, setEditingDates] = useState(false)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')

  const updateDates = useMutation({
    mutationFn: () => api.updateGroup(groupId, group.name, editStart || null, editEnd || null),
    onSuccess: () => {
      qc.invalidateQueries(['group', groupId])
      setEditingDates(false)
    },
  })

  function openDateEditor() {
    setEditStart(group?.start_date || '')
    setEditEnd(group?.end_date || '')
    setEditingDates(true)
  }

  if (loadingGroup) {
    return <div className="text-ink-500 animate-pulse-soft text-sm">Loading…</div>
  }

  const members = group?.members || []

  // True if the current user is the trip owner OR if it's a legacy group (no owner)
  const isOwner = !group?.owner_id || group.owner_id === user?.id

  // ── Compute stats from transactions ───────────────────────────────────────
  const excluded = transactions.filter(t => t.status === 'excluded')
  const active = transactions.filter(t => t.status !== 'excluded')

  // "Needs review" = unreviewed AND participants are unclear
  const needsReview = active.filter(t =>
    t.status === 'unreviewed' && (
      t.participants_json?.type === 'ask' ||
      (t.participants_json?.type === 'single' && !t.participants_json?.member_ids?.length)
    )
  )

  // Shared = active, has participants assigned, not personal
  const shared = active.filter(t =>
    !t.is_personal && t.participants_json?.member_ids?.length > 0
  )
  const sharedTotal = shared.reduce((s, t) => s + t.amount, 0)

  // ── Determine workflow step statuses ──────────────────────────────────────
  // Only count real uploaded statements — not virtual "Manual Expenses" containers
  const hasStatements = statements.filter(s => !s.is_manual).length > 0
  const hasTransactions = transactions.length > 0
  const allReviewed = hasTransactions && needsReview.length === 0

  const importStatus = hasStatements ? 'done' : 'ready'
  const reviewStatus = !hasStatements ? 'pending'
    : needsReview.length > 0 ? 'attention'
    : 'done'
  const settleStatus = !hasTransactions ? 'pending'
    : allReviewed ? 'ready'
    : 'pending'

  return (
    <div className="max-w-3xl mx-auto">

      {/* ── Trip header ──────────────────────────────────────────────────── */}
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold text-ink-50 mb-1">{group?.name}</h1>

        <div className="flex items-center gap-4 mt-2 flex-wrap">
          {/* Date range — click pencil to edit inline */}
          {editingDates ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Calendar size={13} className="text-ink-500 flex-shrink-0" />
                <input
                  type="date"
                  className="input text-sm py-1 px-2 w-36"
                  value={editStart}
                  onChange={e => setEditStart(e.target.value)}
                />
                <span className="text-ink-500 text-xs">–</span>
                <input
                  type="date"
                  className="input text-sm py-1 px-2 w-36"
                  value={editEnd}
                  onChange={e => setEditEnd(e.target.value)}
                />
                <button
                  className="btn-primary text-xs py-1 px-3"
                  onClick={() => updateDates.mutate()}
                  disabled={updateDates.isPending}
                >
                  {updateDates.isPending ? <Loader size={11} className="animate-spin" /> : 'Save'}
                </button>
                <button
                  className="text-ink-500 hover:text-ink-300 transition-colors"
                  onClick={() => setEditingDates(false)}
                >
                  <X size={13} />
                </button>
              </div>
              {/* Explain what trip dates actually do — surfaced here where users edit them */}
              <p className="text-xs text-amber-400/80 pl-5">
                Everyday spending outside these dates (groceries, dining, etc.) is auto-excluded. Travel charges — flights, hotels, car rentals — booked up to 90 days before or 14 days after your trip are surfaced for review instead.
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-sm text-ink-400 group/dates">
              <Calendar size={13} className="text-ink-500" />
              {group?.start_date && group?.end_date
                ? `${formatDateShort(group.start_date)} – ${formatDate(group.end_date)}`
                : <span className="text-ink-600 italic">No dates set</span>
              }
              {/* Edit button — visible on hover */}
              <button
                onClick={openDateEditor}
                className="ml-1 text-ink-600 hover:text-ink-300 transition-colors opacity-0 group-hover/dates:opacity-100"
                title="Edit trip dates"
              >
                <Pencil size={11} />
              </button>
            </div>
          )}

          {/* ── Members row — single tap target opens the People sheet ─────
              The whole row (avatars + names + +Add pill + pending count)
              opens PeopleSheet, which handles add-by-name, quick-add from
              past trips, and the invite link with expected count. */}
          <button
            onClick={() => setPeopleSheetOpen(true)}
            className="flex items-center gap-2 px-2 -mx-2 py-1 rounded-lg
                       hover:bg-ink-800/60 active:bg-ink-800 transition-colors
                       text-left w-full md:w-auto"
            title="Manage people on this trip"
          >
            <Users size={13} className="text-ink-500" />
            {members.length === 0 ? (
              <span className="text-xs text-lime-400 font-medium flex items-center gap-1">
                <Plus size={11} /> Add who's on this trip
                <ChevronRight size={11} />
              </span>
            ) : (
              <>
                <div className="flex -space-x-1.5">
                  {members.slice(0, 5).map((m, i) => {
                    if (m.is_placeholder) {
                      return (
                        <div
                          key={m.id}
                          title="Pending invite"
                          className="w-6 h-6 rounded-full bg-ink-800 border-2 border-ink-950 border-dashed flex items-center justify-center"
                        >
                          <Hourglass size={10} className="text-ink-500" />
                        </div>
                      )
                    }
                    const initials = (m.name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
                    return (
                      <div
                        key={m.id}
                        title={m.name}
                        className={clsx(
                          'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold border-2 border-ink-950',
                          MEMBER_COLORS[i % MEMBER_COLORS.length]
                        )}
                      >
                        {initials}
                      </div>
                    )
                  })}
                  {members.length > 5 && (
                    <div className="w-6 h-6 rounded-full bg-ink-700 border-2 border-ink-950 flex items-center justify-center text-[9px] font-bold text-ink-300">
                      +{members.length - 5}
                    </div>
                  )}
                </div>
                <span className="text-xs text-ink-500 truncate max-w-[180px]">
                  {members.filter(m => !m.is_placeholder).map(m => m.name).join(', ')}
                  {members.some(m => m.is_placeholder) && (
                    <span className="text-ink-600">
                      {' '}· {members.filter(m => m.is_placeholder).length} pending
                    </span>
                  )}
                </span>
                <span className="ml-1 flex items-center gap-0.5 text-[11px] font-medium text-lime-400 hover:text-lime-300">
                  <Plus size={10} />
                  Add
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ── Stats row (only shown once data exists) ───────────────────────── */}
      {hasTransactions && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 animate-slide-up">
          <StatCard label="Transactions" value={transactions.length} />
          <StatCard
            label="Shared total"
            value={(() => {
            const sym = { USD:'$',AUD:'A$',NZD:'NZ$',JPY:'¥',GBP:'£',EUR:'€',CAD:'C$',SGD:'S$',HKD:'HK$',THB:'฿' }
            const c = group?.base_currency || 'USD'
            return `${sym[c] || c+' '}${c==='JPY' ? Math.round(sharedTotal).toLocaleString() : sharedTotal.toFixed(0)}`
          })()}
            sub={`${shared.length} txns`}
            color="text-lime-400"
          />
          <StatCard
            label="Needs review"
            value={needsReview.length}
            color={needsReview.length > 0 ? 'text-amber-400' : 'text-ink-400'}
          />
          <StatCard
            label="Excluded"
            value={excluded.length}
            color="text-ink-400"
          />
        </div>
      )}

      {/* ── "Where I stand" balance summary ──────────────────────────────────
          Splitwise's signature feature: a one-line read of your personal
          balance the moment you open a trip. Shown only when there are real
          transactions and the current user is linked to a member slot
          (otherwise the math is meaningless). */}
      {hasTransactions && <MyBalanceWidget groupId={groupId} />}

      {/* ── Joined-member guidance banner ─────────────────────────────────── */}
      {/* Only shown to members who joined via invite link and haven't uploaded yet.
          The isOwner check comes from group.owner_id vs the current user's ID. */}
      {!isOwner && !hasStatements && (
        <div className="bg-lime-400/8 border border-lime-400/20 rounded-2xl px-5 py-4 mb-6 animate-slide-up">
          <div className="text-sm font-medium text-ink-100 mb-1">You've joined this trip</div>
          <div className="text-xs text-ink-400 leading-relaxed mb-3">
            Add your expenses so they're included in the final settlement. You can upload a bank statement or type them in manually.
          </div>
          <div className="flex gap-2">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-lime-400 text-ink-950 text-xs font-semibold hover:bg-lime-500 transition-colors"
              onClick={() => navigate(`/groups/${groupId}/upload`)}
            >
              <Upload size={11} />
              Upload statement
            </button>
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-ink-600 text-ink-300 text-xs font-medium hover:border-ink-400 hover:bg-ink-800/50 transition-all"
              onClick={() => navigate(`/groups/${groupId}/transactions`, { state: { openAddExpense: true } })}
            >
              <Plus size={11} />
              Add manually
            </button>
          </div>
        </div>
      )}

      {/* ── Contextual next-step banner ───────────────────────────────────────
          Shows ONE clear "do this now" prompt based on where the user is in the
          workflow. Disappears once they've completed all steps and settled up.
          Priority order: no members > no statements > needs review > settle up.
      ─────────────────────────────────────────────────────────────────────── */}
      {(() => {
        // Determine what the most important next action is right now
        // Priority 1: people. Open the People sheet from a single CTA when
        // no real members exist yet. Pending placeholders don't satisfy this
        // — we still want the user to add at least one real person before
        // moving on to expenses.
        const realMemberCount = members.filter((m) => !m.is_placeholder).length
        if (realMemberCount === 0) {
          return (
            <button
              className="mb-6 w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-lime-400/8 border border-lime-400/20 hover:bg-lime-400/12 hover:border-lime-400/35 transition-all text-left animate-slide-up"
              onClick={() => setPeopleSheetOpen(true)}
            >
              <Users size={15} className="text-lime-400 flex-shrink-0" />
              <div className="flex-1">
                <span className="text-sm font-medium text-ink-100">Who's on this trip?</span>
                <span className="text-xs text-ink-400 ml-2">add by name or share an invite link</span>
              </div>
              <ChevronRight size={14} className="text-ink-500 flex-shrink-0" />
            </button>
          )
        }
        if (!hasStatements) {
          return (
            <div className="mb-6 rounded-xl bg-lime-400/8 border border-lime-400/20 overflow-hidden animate-slide-up">
              <div className="px-4 py-3">
                <p className="text-sm font-medium text-ink-100 mb-1">Add your expenses</p>
                <p className="text-xs text-ink-500 mb-3">Pick whichever way works best for you</p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-lime-400 text-ink-950 text-xs font-semibold hover:bg-lime-500 transition-colors"
                    onClick={() => navigate(`/groups/${groupId}/upload`)}
                  >
                    <Upload size={12} />
                    Upload statement
                  </button>
                  <button
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-ink-600 text-ink-300 text-xs font-medium hover:border-ink-400 hover:bg-ink-800/50 transition-all"
                    onClick={() => navigate(`/groups/${groupId}/transactions`, { state: { openAddExpense: true } })}
                  >
                    <Plus size={12} />
                    Add manually
                  </button>
                </div>
              </div>
            </div>
          )
        }
        if (needsReview.length > 0) {
          return (
            <div
              className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-400/8 border border-amber-400/20 animate-slide-up cursor-pointer hover:bg-amber-400/12 transition-colors"
              onClick={() => navigate(`/groups/${groupId}/transactions`)}
            >
              <AlertTriangle size={15} className="text-amber-400 flex-shrink-0" />
              <div className="flex-1">
                <span className="text-sm font-medium text-ink-100">
                  {needsReview.length} transaction{needsReview.length > 1 ? 's' : ''} need participant assignment
                </span>
                <span className="text-xs text-ink-400 ml-2">decide who splits each expense</span>
              </div>
              <ChevronRight size={14} className="text-ink-500 flex-shrink-0" />
            </div>
          )
        }
        if (hasTransactions) {
          return (
            <div
              className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl bg-lime-400/8 border border-lime-400/20 animate-slide-up cursor-pointer hover:bg-lime-400/12 transition-colors"
              onClick={() => navigate(`/groups/${groupId}/settlement`)}
            >
              <TrendingUp size={15} className="text-lime-400 flex-shrink-0" />
              <div className="flex-1">
                <span className="text-sm font-medium text-ink-100">Ready to settle up</span>
                <span className="text-xs text-ink-400 ml-2">compute who owes whom</span>
              </div>
              <ChevronRight size={14} className="text-ink-500 flex-shrink-0" />
            </div>
          )
        }
        return null
      })()}

      {/* ── Workflow steps ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <WorkflowCard
          icon={Upload}
          title="Add Expenses"
          description={
            hasStatements
              ? `${statements.filter(s => !s.is_manual).length} statement${statements.filter(s => !s.is_manual).length > 1 ? 's' : ''} imported · manually added expenses also count`
              : 'Upload a bank statement or type in a few expenses — both work'
          }
          status={importStatus}
          cta={hasStatements ? 'Add more expenses' : 'Get started'}
          onClick={() => navigate(`/groups/${groupId}/upload`)}
        />
        <WorkflowCard
          icon={List}
          title="Review Transactions"
          description={
            !hasStatements ? 'Add some expenses first'
            : needsReview.length > 0
              ? `${needsReview.length} transaction${needsReview.length > 1 ? 's' : ''} need participant assignment`
              : 'All transactions reviewed'
          }
          status={reviewStatus}
          cta={needsReview.length > 0 ? 'Review now' : 'View transactions'}
          onClick={() => navigate(`/groups/${groupId}/transactions`)}
          disabled={!hasStatements}
        />
        <WorkflowCard
          icon={TrendingUp}
          title="Settle Up"
          description={
            !hasTransactions ? 'Import transactions first'
            : needsReview.length > 0
              ? `Review ${needsReview.length} transaction${needsReview.length > 1 ? 's' : ''} first`
              : 'Ready to compute who owes whom'
          }
          status={settleStatus}
          cta="Compute settlement"
          onClick={() => navigate(`/groups/${groupId}/settlement`)}
          disabled={!hasTransactions}
        />
      </div>

      {/* ── Add expense manually — only shown once they have statements ───── */}
      {/* Pre-statement, the contextual banner above already offers the manual path,
          so showing this here too creates noise. Once at least one statement is in,
          this becomes a meaningful escape hatch for cash / Airbnb / off-card costs. */}
      {hasStatements && (
        <div className="flex items-center justify-between mb-6 px-1">
          <p className="text-xs text-ink-500 leading-relaxed">
            Have an Airbnb, cash meal, or shared cost not on any card?
          </p>
          <button
            className="flex items-center gap-1.5 text-xs font-semibold text-lime-400 hover:text-lime-300 transition-colors ml-4 flex-shrink-0"
            onClick={() => navigate(`/groups/${groupId}/transactions`, { state: { openAddExpense: true } })}
          >
            <Plus size={12} />
            Add expense manually
          </button>
        </div>
      )}

      {/* ── Imported statements list ──────────────────────────────────────── */}
      {hasStatements && (
        <div className="card animate-slide-up">
          <h2 className="font-display text-base font-semibold text-ink-200 mb-3 flex items-center gap-2">
            <FileText size={14} className="text-ink-500" />
            Imported Statements
          </h2>
          <div className="space-y-2">
            {statements.filter(s => !s.is_manual).map((s) => {
              const holder = s.card_holder_member_id
                ? members.find(m => m.id === s.card_holder_member_id)?.name
                : null
              const holderIndex = holder
                ? members.findIndex(m => m.id === s.card_holder_member_id)
                : -1

              // Format the statement period into something readable
              // e.g. "Jan 5 – Apr 14, 2026" instead of "2026-01-05 – 2026-04-14"
              const fmtDate = (iso) => {
                if (!iso) return null
                const [y, m, d] = iso.split('-').map(Number)
                return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              }
              const period = s.period_start && s.period_end
                ? `${fmtDate(s.period_start)} – ${fmtDate(s.period_end)}`
                : s.statement_date
                  ? fmtDate(s.statement_date)
                  : null

              const isConfirmingDelete = confirmDeleteStmtId === s.id

              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-ink-800/50 hover:bg-ink-800 transition-colors group"
                >
                  {/* Card holder avatar */}
                  {holder ? (
                    <div className={clsx(
                      'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                      MEMBER_COLORS[holderIndex % MEMBER_COLORS.length]
                    )}>
                      {holder.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-ink-700 flex items-center justify-center flex-shrink-0">
                      <FileText size={12} className="text-ink-400" />
                    </div>
                  )}

                  {/* Statement info — click to filter transactions to just this statement */}
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => navigate(`/groups/${groupId}/transactions?statement=${s.id}`)}
                    title="View this statement's transactions"
                  >
                    <div className="text-sm text-ink-200 font-medium">
                      {holder
                        ? `${holder}'s ${s.bank_name || 'Card'}`
                        : s.bank_name || 'Statement'
                      }
                      {!holder && (
                        <span className="ml-2 text-[10px] text-amber-400 font-normal">no card holder set</span>
                      )}
                    </div>
                    {period && (
                      <div className="text-xs text-ink-500 mt-0.5">{period}</div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-xs font-mono text-ink-500">
                      {s.transaction_count} txns
                    </span>
                    <CheckCircle size={13} className="text-lime-400" />

                    {/* Delete statement — with inline confirm */}
                    {isConfirmingDelete ? (
                      <div className="flex items-center gap-1">
                        <span className="text-[10px] text-red-400">Delete all {s.transaction_count} transactions?</span>
                        <button
                          className="px-1.5 py-0.5 rounded text-[10px] bg-red-500 text-white hover:bg-red-400"
                          onClick={() => deleteStatement.mutate(s.id)}
                          disabled={deleteStatement.isPending}
                        >
                          Yes
                        </button>
                        <button
                          className="px-1.5 py-0.5 rounded text-[10px] bg-ink-700 text-ink-300 hover:bg-ink-600"
                          onClick={() => setConfirmDeleteStmtId(null)}
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        className="p-1 rounded text-ink-500 hover:text-red-400 hover:bg-red-400/10 transition-all sm:opacity-0 sm:group-hover:opacity-100"
                        title="Delete this statement and all its transactions"
                        onClick={() => setConfirmDeleteStmtId(s.id)}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* The previous "No statements yet" empty-state hero was duplicate
          messaging — the contextual banner above already prompts for the
          first import. Removed to reduce noise. */}

      {/* People sheet — single surface for add-by-name, quick-add from past
          trips, and the invite-link-with-expected-count flow. Triggered from
          the clickable members row in the trip header. */}
      {peopleSheetOpen && (
        <PeopleSheet
          group={group}
          members={members}
          isOwner={isOwner}
          onClose={() => setPeopleSheetOpen(false)}
          onEditHandles={(member) => setEditingHandlesFor(member)}
        />
      )}

      {/* Payment handles editor — triggered from inside the People sheet.
          Same modal we use on the Settlement page; isolated mounting here so
          it overlays the People sheet without a z-index fight. */}
      {editingHandlesFor && (
        <PaymentHandlesEditor
          member={editingHandlesFor}
          onClose={() => setEditingHandlesFor(null)}
        />
      )}
    </div>
  )
}
