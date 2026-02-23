import { useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  List, Filter, ChevronDown, Save, User, Users,
  AlertTriangle, CheckSquare, Square, Eye, EyeOff,
  BookmarkPlus, RefreshCw, TrendingUp,
} from 'lucide-react'
import clsx from 'clsx'

// ── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'dining', 'groceries', 'utilities', 'subscriptions',
  'transportation', 'entertainment', 'health', 'fitness',
  'shopping', 'travel', 'unknown',
]

const CATEGORY_COLORS = {
  dining: 'badge-lime',
  groceries: 'badge-green',
  utilities: 'badge-amber',
  subscriptions: 'badge-muted',
  transportation: 'badge-muted',
  entertainment: 'badge-lime',
  health: 'badge-muted',
  fitness: 'badge-green',
  shopping: 'badge-muted',
  travel: 'badge-amber',
  unknown: 'badge-red',
}

// ── Small helper components ──────────────────────────────────────────────────
function CategoryBadge({ category }) {
  return (
    <span className={`badge ${CATEGORY_COLORS[category] || 'badge-muted'} capitalize`}>
      {category || 'unknown'}
    </span>
  )
}

function ParticipantsBadge({ participants, members }) {
  if (!participants) return <span className="badge badge-red"><AlertTriangle size={10} /> Unassigned</span>

  const { type, member_ids = [] } = participants
  if (type === 'ask' || (type === 'single' && member_ids.length === 0)) {
    return <span className="badge badge-amber"><AlertTriangle size={10} /> Needs review</span>
  }
  if (type === 'all' || member_ids.length === members.length) {
    return <span className="badge badge-muted"><Users size={10} /> Everyone</span>
  }
  const names = member_ids.map(id => members.find(m => m.id === id)?.name || `#${id}`).join(', ')
  return <span className="badge badge-muted font-mono text-[10px]">{names}</span>
}

// ── Transaction edit row (inline editor) ────────────────────────────────────
function TransactionRow({ txn, members, groupId }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: (updates) => api.updateTransaction(txn.id, updates),
    onSuccess: () => {
      qc.invalidateQueries(['group-transactions', groupId])
      setEditing(false)
    },
  })

  const saveRule = useMutation({
    mutationFn: () => api.saveMerchantRule(txn.id),
    onSuccess: () => qc.invalidateQueries(['merchant-rules', groupId]),
  })

  const startEdit = () => {
    setDraft({
      category: txn.category,
      is_personal: txn.is_personal,
      participants_json: { ...txn.participants_json },
      split_method_json: { ...txn.split_method_json },
    })
    setEditing(true)
  }

  const toggleParticipant = (memberId) => {
    const current = draft.participants_json?.member_ids || []
    const updated = current.includes(memberId)
      ? current.filter(id => id !== memberId)
      : [...current, memberId]
    setDraft(d => ({
      ...d,
      participants_json: { type: 'custom', member_ids: updated },
    }))
  }

  const save = () => {
    update.mutate({
      category: draft.category,
      is_personal: draft.is_personal,
      participants_json: draft.participants_json,
      split_method_json: draft.split_method_json,
    })
  }

  const needsReview = (txn.participants_json?.type === 'ask') ||
    (txn.participants_json?.type === 'single' && !txn.participants_json?.member_ids?.length)

  return (
    <>
      <tr
        className={clsx(
          txn.is_personal && 'opacity-50',
          needsReview && 'bg-amber-400/5',
        )}
      >
        <td className="w-28">
          <span className="font-mono text-ink-400 text-xs">{txn.posted_date}</span>
        </td>
        <td>
          <div className="font-medium text-ink-100 text-sm leading-tight">{txn.description_raw}</div>
          {txn.is_personal && <span className="text-[10px] text-ink-500 font-mono">personal</span>}
          {txn.parse_confidence < 0.8 && (
            <span className="badge badge-amber text-[10px] ml-1">low confidence</span>
          )}
        </td>
        <td>
          <CategoryBadge category={txn.category} />
        </td>
        <td>
          {txn.is_personal
            ? <span className="badge badge-muted">Personal</span>
            : <ParticipantsBadge participants={txn.participants_json} members={members} />
          }
        </td>
        <td className="text-right">
          <span className="font-mono font-semibold text-ink-100">${txn.amount.toFixed(2)}</span>
        </td>
        <td>
          <button
            className="btn-ghost py-1 px-2 text-xs"
            onClick={editing ? () => setEditing(false) : startEdit}
          >
            {editing ? 'Cancel' : 'Edit'}
          </button>
        </td>
      </tr>

      {/* Inline editor row */}
      {editing && (
        <tr>
          <td colSpan={6} className="p-0">
            <div className="bg-ink-800/80 border-t border-b border-ink-700 px-4 py-4 animate-slide-up">
              <div className="grid grid-cols-3 gap-4">
                {/* Category */}
                <div>
                  <label className="label">Category</label>
                  <select
                    className="select text-sm"
                    value={draft.category}
                    onChange={(e) => setDraft(d => ({ ...d, category: e.target.value }))}
                  >
                    {CATEGORIES.map(c => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>

                {/* Participants */}
                <div>
                  <label className="label">Participants</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {members.map((m) => {
                      const active = draft.participants_json?.member_ids?.includes(m.id)
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleParticipant(m.id)}
                          className={clsx(
                            'px-2.5 py-1 rounded-md text-xs font-medium border transition-all',
                            active
                              ? 'bg-lime-400/15 text-lime-400 border-lime-400/30'
                              : 'bg-ink-700 text-ink-400 border-ink-600 hover:border-ink-400'
                          )}
                        >
                          {m.name}
                        </button>
                      )
                    })}
                    <button
                      type="button"
                      onClick={() => setDraft(d => ({
                        ...d,
                        participants_json: { type: 'all', member_ids: members.map(m => m.id) },
                      }))}
                      className="px-2.5 py-1 rounded-md text-xs border border-ink-600 text-ink-400 hover:text-ink-200 hover:border-ink-400"
                    >
                      All
                    </button>
                  </div>
                </div>

                {/* Split method */}
                <div>
                  <label className="label">Split Method</label>
                  <select
                    className="select text-sm"
                    value={draft.split_method_json?.type || 'equal'}
                    onChange={(e) => setDraft(d => ({
                      ...d,
                      split_method_json: { type: e.target.value },
                    }))}
                  >
                    <option value="equal">Equal split</option>
                    <option value="percentage">By percentage</option>
                    <option value="exact">Exact amounts</option>
                  </select>
                </div>
              </div>

              {/* Personal toggle */}
              <div className="flex items-center gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setDraft(d => ({ ...d, is_personal: !d.is_personal }))}
                  className={clsx(
                    'flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium border transition-all',
                    draft.is_personal
                      ? 'bg-ink-700 text-ink-200 border-ink-500'
                      : 'bg-ink-800 text-ink-400 border-ink-700 hover:border-ink-500'
                  )}
                >
                  {draft.is_personal ? <EyeOff size={12} /> : <Eye size={12} />}
                  {draft.is_personal ? 'Personal (excluded from split)' : 'Mark as personal'}
                </button>
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 mt-4 pt-3 border-t border-ink-700">
                <button
                  className="btn-primary py-1.5 px-3 text-xs"
                  onClick={save}
                  disabled={update.isPending}
                >
                  <Save size={12} />
                  {update.isPending ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  className="btn-secondary py-1.5 px-3 text-xs"
                  onClick={() => saveRule.mutate()}
                  disabled={saveRule.isPending}
                  title="Remember these settings for this merchant"
                >
                  <BookmarkPlus size={12} />
                  {saveRule.isPending ? 'Saving rule…' : 'Save as Merchant Rule'}
                </button>
                <button className="btn-ghost py-1.5 px-3 text-xs ml-auto" onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function TransactionsPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('all') // 'all' | 'needs-review' | 'personal'
  const [categoryFilter, setCategoryFilter] = useState('all')

  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
  })

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['group-transactions', groupId],
    queryFn: () => api.getGroupTransactions(groupId),
  })

  const members = group?.members || []

  // Derived stats
  const stats = useMemo(() => {
    const needsReview = transactions.filter(t =>
      t.participants_json?.type === 'ask' ||
      (t.participants_json?.type === 'single' && !t.participants_json?.member_ids?.length)
    ).length
    const personal = transactions.filter(t => t.is_personal).length
    const shared = transactions.filter(t => !t.is_personal).length
    // Only count transactions that will actually be included in settlement:
    // not personal AND has participants assigned (excludes "needs review" with empty member_ids)
    const totalShared = transactions
      .filter(t => !t.is_personal && t.participants_json?.member_ids?.length > 0)
      .reduce((s, t) => s + t.amount, 0)
    return { needsReview, personal, shared, totalShared }
  }, [transactions])

  // Filtered & sorted
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (filter === 'needs-review') {
        return t.participants_json?.type === 'ask' ||
          (t.participants_json?.type === 'single' && !t.participants_json?.member_ids?.length)
      }
      if (filter === 'personal') return t.is_personal
      if (categoryFilter !== 'all') return t.category === categoryFilter
      return true
    })
  }, [transactions, filter, categoryFilter])

  if (isLoading) return <div className="text-ink-500 animate-pulse-soft text-sm">Loading transactions…</div>

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="section-title">Transactions</h1>
          <p className="text-ink-400 text-sm mt-1">
            {group?.name} · {transactions.length} transactions
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => navigate(`/groups/${groupId}/settlement`)}
        >
          <TrendingUp size={14} />
          View Settlement
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total transactions', value: transactions.length, mono: true },
          { label: 'Will be settled', value: `$${stats.totalShared.toFixed(2)}`, highlight: true },
          { label: 'Needs review', value: stats.needsReview, warn: stats.needsReview > 0 },
          { label: 'Personal', value: stats.personal },
        ].map(({ label, value, highlight, warn, mono }) => (
          <div key={label} className="card-sm">
            <div className={clsx(
              'font-mono text-2xl font-bold mb-0.5',
              highlight && 'text-lime-400',
              warn && value > 0 ? 'text-amber-400' : !highlight && 'text-ink-100',
            )}>
              {value}
            </div>
            <div className="text-xs text-ink-500">{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[
          { key: 'all', label: 'All' },
          { key: 'needs-review', label: `Needs Review (${stats.needsReview})` },
          { key: 'personal', label: 'Personal' },
        ].map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
              filter === key
                ? 'bg-lime-400/10 text-lime-400 border-lime-400/30'
                : 'bg-ink-800 text-ink-400 border-ink-700 hover:border-ink-500'
            )}
          >
            {label}
          </button>
        ))}

        <select
          className="select text-xs py-1.5 px-3 w-auto"
          value={categoryFilter}
          onChange={(e) => { setCategoryFilter(e.target.value); setFilter('all') }}
        >
          <option value="all">All categories</option>
          {CATEGORIES.map(c => (
            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {transactions.length === 0 ? (
        <div className="card text-center py-12">
          <List size={36} className="text-ink-600 mx-auto mb-3" />
          <p className="font-display text-xl text-ink-300 mb-2">No transactions yet</p>
          <p className="text-sm text-ink-500 mb-4">Upload a Chase PDF statement to get started</p>
          <button className="btn-primary mx-auto" onClick={() => navigate(`/groups/${groupId}/upload`)}>
            Import Statement
          </button>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th>Participants</th>
                  <th className="text-right">Amount</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-ink-500 text-sm">
                      No transactions match this filter
                    </td>
                  </tr>
                ) : (
                  filtered.map((txn) => (
                    <TransactionRow
                      key={txn.id}
                      txn={txn}
                      members={members}
                      groupId={groupId}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
