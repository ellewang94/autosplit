import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  Upload, List, TrendingUp, CheckCircle, AlertTriangle,
  Calendar, Users, ArrowRight, FileText, ChevronRight, Trash2,
  Link2, Loader, Plus, Pencil, X,
} from 'lucide-react'
import clsx from 'clsx'
import { useAuth } from '../contexts/AuthContext'

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
  const qc = useQueryClient()
  const [confirmDeleteStmtId, setConfirmDeleteStmtId] = useState(null)

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
  const [inviteCopied, setInviteCopied] = useState(false)
  const [inviteLoading, setInviteLoading] = useState(false)

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

  async function handleInvite() {
    setInviteLoading(true)
    try {
      const data = await api.getInviteLink(groupId)
      await navigator.clipboard.writeText(data.invite_url)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 3000)
    } catch (e) {
      // Fallback: copy to clipboard failed — show the URL in an alert
      console.error('Copy failed:', e)
    } finally {
      setInviteLoading(false)
    }
  }

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

          {/* Member avatars */}
          <div className="flex items-center gap-1.5">
            <Users size={13} className="text-ink-500" />
            <div className="flex -space-x-1.5">
              {members.map((m, i) => {
                const initials = m.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
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
            </div>
            <span className="text-xs text-ink-500 ml-1">
              {members.map(m => m.name).join(', ')}
            </span>
          </div>

          {/* Invite button — only for trip owner */}
          {isOwner && (
            <button
              onClick={handleInvite}
              disabled={inviteLoading}
              className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-lime-400 transition-colors mt-3"
            >
              {inviteCopied ? (
                <><CheckCircle size={13} className="text-lime-400" /> Invite link copied!</>
              ) : inviteLoading ? (
                <><Loader size={13} className="animate-spin" /> Getting link…</>
              ) : (
                <><Link2 size={13} /> Invite friends to this trip</>
              )}
            </button>
          )}
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

      {/* ── Joined-member guidance banner ─────────────────────────────────── */}
      {/* Only shown to members who joined via invite link and haven't uploaded yet.
          The isOwner check comes from group.owner_id vs the current user's ID. */}
      {!isOwner && !hasStatements && (
        <div className="bg-lime-400/8 border border-lime-400/20 rounded-2xl px-5 py-4 mb-6 flex items-start gap-3 animate-slide-up">
          <Upload size={16} className="text-lime-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-ink-100 mb-1">You've joined this trip</div>
            <div className="text-xs text-ink-400 leading-relaxed">
              Upload your card statement so your expenses are included in the final settlement.
              Select yourself as the card holder when prompted.
            </div>
          </div>
        </div>
      )}

      {/* ── Workflow steps ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-8">
        <WorkflowCard
          icon={Upload}
          title="Import Statement"
          description={
            hasStatements
              ? `${statements.filter(s => !s.is_manual).length} statement${statements.filter(s => !s.is_manual).length > 1 ? 's' : ''} imported`
              : 'Upload a PDF or CSV statement, or add cash expenses manually'
          }
          status={importStatus}
          cta={hasStatements ? 'Import another' : 'Get started'}
          onClick={() => navigate(`/groups/${groupId}/upload`)}
        />
        <WorkflowCard
          icon={List}
          title="Review Transactions"
          description={
            !hasStatements ? 'Import a statement first'
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

      {/* ── Add expense manually — prominent shortcut ─────────────────────── */}
      {/* Airbnb bookings, cash meals, Ubers paid by one person — these often
          aren't on a credit card statement. This button surfaces the manual
          entry flow so users don't miss it. It opens the Add Expense modal
          on the transactions page via navigation state. */}
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

      {/* ── Empty state — no statements yet ──────────────────────────────── */}
      {!hasStatements && (
        <div className="card text-center py-12 border-dashed border-ink-700 animate-slide-up">
          <Upload size={32} className="text-ink-600 mx-auto mb-3" strokeWidth={1.5} />
          <p className="font-display text-lg text-ink-300 mb-1">No statements yet</p>
          <p className="text-sm text-ink-500 mb-5">
            Upload a bank statement (PDF or CSV) from Chase, Amex, BofA, Citi, and more — or add expenses manually.
          </p>
          <button
            className="btn-primary mx-auto"
            onClick={() => navigate(`/groups/${groupId}/upload`)}
          >
            <Upload size={14} />
            Import Statement or Add Manually
          </button>
        </div>
      )}
    </div>
  )
}
