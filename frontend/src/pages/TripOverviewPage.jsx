import { useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  Upload, List, TrendingUp, CheckCircle, AlertTriangle,
  Calendar, Users, ArrowRight, FileText, ChevronRight, Trash2,
  Link2, Loader, Plus, Pencil, X, Copy, MessageCircle, UserCheck,
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
  const location = useLocation()
  const qc = useQueryClient()
  const [confirmDeleteStmtId, setConfirmDeleteStmtId] = useState(null)
  // Inline "add first member" form that appears inside the empty-members banner.
  // Auto-opens when navigating here right after trip creation (state.newTrip = true).
  const [addingFirstMember, setAddingFirstMember] = useState(
    () => location.state?.newTrip === true
  )
  const [firstMemberName, setFirstMemberName] = useState('')

  const addMember = useMutation({
    mutationFn: (name) => api.addMember(groupId, name),
    onSuccess: () => {
      qc.invalidateQueries(['group', groupId])
      setFirstMemberName('')
      // Keep the form open so they can add more people one by one
    },
  })

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
  // Holds the fetched invite URL so we can display it in the card and offer share options
  const [inviteUrl, setInviteUrl] = useState(null)
  // Whether the prominent invite card is expanded (owner clicks it to reveal share options)
  const [inviteOpen, setInviteOpen] = useState(false)

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

  // Fetch or re-use the invite link, then copy to clipboard
  async function handleInvite() {
    setInviteLoading(true)
    try {
      const data = await api.getInviteLink(groupId)
      setInviteUrl(data.invite_url)
      await navigator.clipboard.writeText(data.invite_url)
      setInviteCopied(true)
      setTimeout(() => setInviteCopied(false), 3000)
    } catch (e) {
      console.error('Copy failed:', e)
    } finally {
      setInviteLoading(false)
    }
  }

  // Open the invite card — fetches the link in the background so it's ready to copy/share
  async function openInviteCard() {
    setInviteOpen(true)
    if (!inviteUrl) {
      setInviteLoading(true)
      try {
        const data = await api.getInviteLink(groupId)
        setInviteUrl(data.invite_url)
      } catch (e) {
        console.error('Failed to get invite link:', e)
      } finally {
        setInviteLoading(false)
      }
    }
  }

  // Share via WhatsApp deep link (works on mobile and desktop)
  function shareWhatsApp() {
    if (!inviteUrl) return
    const text = encodeURIComponent(`Join our trip "${group?.name}" on AutoSplit — add your card statement so we can split expenses fairly: ${inviteUrl}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  // Share via iMessage (tel: links open Messages on Mac/iPhone)
  function shareMessages() {
    if (!inviteUrl) return
    const text = encodeURIComponent(`Join our trip "${group?.name}" on AutoSplit: ${inviteUrl}`)
    window.open(`sms:?&body=${text}`, '_blank')
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
            {/* "+ Add" pill — one-click way to add another member without leaving the trip page.
                Only shown when at least one member already exists; the empty-state banner
                handles the first-member case. Clicking it opens the same shared form below. */}
            {members.length > 0 && (
              <button
                onClick={() => setAddingFirstMember(true)}
                className="ml-2 flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border border-lime-400/30 text-lime-400 hover:bg-lime-400/10 hover:border-lime-400/50 transition-all"
                title="Add another person to this trip"
              >
                <Plus size={11} />
                Add
              </button>
            )}
          </div>

          {/* Invite card — only for trip owner. Prominent and actionable, not a tiny text link. */}
          {isOwner && members.length > 0 && (
            <div className="mt-4 w-full">
              {!inviteOpen ? (
                /* Collapsed state — shows as a clear call-to-action button */
                <button
                  onClick={openInviteCard}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-lime-400/8 border border-lime-400/25 hover:bg-lime-400/12 hover:border-lime-400/40 transition-all text-left group"
                >
                  <div className="w-8 h-8 rounded-lg bg-lime-400/15 flex items-center justify-center flex-shrink-0 group-hover:bg-lime-400/25 transition-colors">
                    <UserCheck size={15} className="text-lime-400" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink-100">Invite your travel companions</div>
                    <div className="text-xs text-ink-500 mt-0.5">
                      Share a link so {members.length > 1 ? `all ${members.length} members` : 'your friend'} can upload their card statements
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-ink-500 flex-shrink-0 group-hover:text-lime-400 transition-colors" />
                </button>
              ) : (
                /* Expanded state — full invite panel with copy + share options */
                <div className="rounded-xl border border-lime-400/25 bg-ink-900 overflow-hidden animate-slide-up">
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-ink-800">
                    <div className="flex items-center gap-2">
                      <UserCheck size={14} className="text-lime-400" />
                      <span className="text-sm font-medium text-ink-100">Invite your travel companions</span>
                    </div>
                    <button
                      onClick={() => setInviteOpen(false)}
                      className="text-ink-600 hover:text-ink-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </div>

                  <div className="p-4 space-y-3">
                    <p className="text-xs text-ink-400 leading-relaxed">
                      Anyone with this link can join the trip and upload their own card statement.
                      They don't need an account — it takes 30 seconds.
                    </p>

                    {/* Link display + copy button */}
                    <div className="flex items-center gap-2">
                      <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-800 border border-ink-700 min-w-0">
                        <Link2 size={12} className="text-ink-500 flex-shrink-0" />
                        {inviteLoading ? (
                          <span className="text-xs text-ink-500 font-mono truncate">Getting link…</span>
                        ) : inviteUrl ? (
                          <span className="text-xs text-ink-300 font-mono truncate">{inviteUrl}</span>
                        ) : (
                          <span className="text-xs text-ink-600 italic">Failed to load link</span>
                        )}
                      </div>
                      <button
                        onClick={handleInvite}
                        disabled={inviteLoading || !inviteUrl}
                        className="flex-shrink-0 btn-primary text-xs py-2 px-3"
                      >
                        {inviteCopied ? (
                          <><CheckCircle size={13} /> Copied!</>
                        ) : (
                          <><Copy size={13} /> Copy</>
                        )}
                      </button>
                    </div>

                    {/* Quick share row */}
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-ink-600">Share via</span>
                      <button
                        onClick={shareWhatsApp}
                        disabled={!inviteUrl}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 transition-colors disabled:opacity-40"
                      >
                        <MessageCircle size={12} />
                        WhatsApp
                      </button>
                      <button
                        onClick={shareMessages}
                        disabled={!inviteUrl}
                        className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/20 transition-colors disabled:opacity-40"
                      >
                        <MessageCircle size={12} />
                        iMessage
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
        // Priority 1: adding members.
        // Show the expanded form if: the user opened it (addingFirstMember=true)
        // OR if there are literally no members yet (force them to add at least one).
        // Once at least one member exists and the user clicks "Done", we fall through.
        if (addingFirstMember) {
          return (
            <div className="mb-6 rounded-xl bg-lime-400/8 border border-lime-400/25 px-4 py-4 animate-slide-up">
              <div className="flex items-center gap-2 mb-3">
                <Users size={14} className="text-lime-400" />
                <span className="text-sm font-medium text-ink-100">Who's on this trip?</span>
                <span className="text-xs text-ink-500 ml-1">Add yourself first, then your friends</span>
              </div>

              {/* Pill list of already-added members */}
              {members.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                  {members.map((m, i) => (
                    <span key={m.id} className={`text-xs font-medium px-2.5 py-1 rounded-full ${['bg-lime-400/15 text-lime-400','bg-green-400/15 text-green-400','bg-amber-400/15 text-amber-400','bg-blue-400/15 text-blue-400'][i % 4]}`}>
                      {m.name}
                    </span>
                  ))}
                </div>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (firstMemberName.trim()) {
                    addMember.mutate(firstMemberName.trim())
                    setFirstMemberName('')
                  }
                }}
                className="flex gap-2"
              >
                <input
                  className="input flex-1 text-sm py-2"
                  placeholder="Name (e.g. Elle, Anthony…)"
                  value={firstMemberName}
                  onChange={(e) => setFirstMemberName(e.target.value)}
                  autoFocus
                />
                <button
                  type="submit"
                  className="btn-primary py-2 px-3 text-sm"
                  disabled={!firstMemberName.trim() || addMember.isPending}
                >
                  <Plus size={14} />
                  Add
                </button>
              </form>

              {/* Done — only show once at least one member exists */}
              {members.length > 0 && (
                <button
                  className="mt-3 text-xs text-lime-400 hover:text-lime-300 transition-colors flex items-center gap-1.5"
                  onClick={() => setAddingFirstMember(false)}
                >
                  <CheckCircle size={12} />
                  Done adding people
                </button>
              )}
            </div>
          )
        }

        if (members.length === 0) {
          // No members yet and form isn't open — collapsed prompt
          return (
            <button
              className="mb-6 w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-lime-400/8 border border-lime-400/20 hover:bg-lime-400/12 hover:border-lime-400/35 transition-all text-left animate-slide-up"
              onClick={() => setAddingFirstMember(true)}
            >
              <Users size={15} className="text-lime-400 flex-shrink-0" />
              <div className="flex-1">
                <span className="text-sm font-medium text-ink-100">Add your travel companions</span>
                <span className="text-xs text-ink-400 ml-2">tap to add who's on this trip</span>
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
