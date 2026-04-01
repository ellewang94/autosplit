import { useState, useMemo, useEffect } from 'react'
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  List, TrendingUp, AlertTriangle, Users, Check, X,
  ChevronDown, Search, CheckSquare, Square, Minus, Calendar, Plane, Download, Plus, Trash2, Pencil,
} from 'lucide-react'
import clsx from 'clsx'

// ── Constants ────────────────────────────────────────────────────────────────
const CATEGORIES = [
  'dining', 'groceries', 'utilities', 'subscriptions',
  'transportation', 'entertainment', 'health', 'fitness',
  'shopping', 'travel', 'unknown',
]

// All supported currencies for expense entry and group setup
const CURRENCIES = ['USD', 'AUD', 'NZD', 'JPY', 'GBP', 'EUR', 'CAD', 'SGD', 'HKD', 'THB']

// Currency symbol map — used to format amounts like "¥5,000" or "£42.00"
const CURRENCY_SYMBOLS = {
  USD: '$', AUD: 'A$', NZD: 'NZ$', JPY: '¥',
  GBP: '£', EUR: '€', CAD: 'C$', SGD: 'S$', HKD: 'HK$', THB: '฿',
}

/**
 * Format a currency amount with the right symbol.
 * JPY has no decimal places (¥5,000 not ¥5,000.00).
 * All other currencies show 2 decimal places.
 */
function formatCurrency(amount, currency = 'USD') {
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' '
  // JPY is a "zero-decimal" currency — no cents
  const decimals = currency === 'JPY' ? 0 : 2
  return `${sym}${amount.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`
}

// Categories that are commonly booked *before* a trip starts.
// A flight or hotel reservation on Dec 15 for a Jan trip is still a trip expense.
// We use this to surface likely pre-trip bookings in the Excluded tab.
const LIKELY_TRIP_CATEGORIES = ['travel', 'transportation', 'entertainment']

// Merchant keywords that strongly suggest a pre-trip booking.
// Real Chase statements often truncate or encode merchant names, so a flight
// might show up as "DELTA AIR" or "JETBLUE" rather than being categorized as
// 'travel'. This keyword list is the safety net.
const TRAVEL_KEYWORDS = [
  // Airlines
  'airways', 'airlines', 'air lines', 'airway', 'airline',
  'jetstar', 'qantas', 'united air', 'delta air', 'american air',
  'british air', 'emirates', 'cathay', 'lufthansa', 'virgin',
  'southwest', 'jetblue', 'frontier', 'spirit air', 'air asia',
  'singapore air', 'air new zealand', 'air canada',
  // Airports & lounges
  'airport', 'lounge', 'priority pass',
  // Hotels & accommodation
  'hotel', 'hotels', 'hostel', 'resort', 'inn ', ' inn',
  'airbnb', 'vrbo', 'booking.com', 'hotels.com', 'expedia',
  'hilton', 'marriott', 'hyatt', 'sheraton', 'westin', 'ihg',
  'holiday inn', 'novotel', 'ibis', 'accor', 'radisson',
  'four seasons', 'ritz', 'sofitel',
  // Booking platforms
  'kayak', 'priceline', 'tripadvisor', 'agoda',
  // Rail / ground transport
  'amtrak', 'eurostar', 'greyhound',
  // Car rental
  'hertz', 'avis', 'enterprise rent', 'budget rent', 'alamo',
  // Chase travel portal
  'chase travel', 'tripchrg',
  // Tour/activity platforms
  'viator', 'getyourguide', 'klook',
]

/**
 * Returns true if the raw merchant description contains any travel-related
 * keyword — used as a fallback when the AI categorizer labels something as
 * 'unknown' but it's clearly a flight or hotel booking.
 */
function isTravelKeywordMatch(description) {
  const lower = description.toLowerCase()
  return TRAVEL_KEYWORDS.some(kw => lower.includes(kw))
}

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

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Normalize a merchant description to its first 3 lowercase words.
 * Mirrors backend logic in domain/categories.py: normalize_merchant_key().
 * "7-ELEVEN SHINJUKU TOKYO JP" → "7-eleven shinjuku tokyo"
 * This is what powers "select all from this merchant" — two 7-Elevens in
 * different neighborhoods will normalize to the same key and select together.
 */
function normalizeMerchantKey(description) {
  return description.toLowerCase().trim().split(/\s+/).slice(0, 3).join(' ')
}

// ── Display components ────────────────────────────────────────────────────────

function CategoryBadge({ category }) {
  return (
    <span className={`badge ${CATEGORY_COLORS[category] || 'badge-muted'} capitalize`}>
      {category || 'unknown'}
    </span>
  )
}

function ParticipantsBadge({ participants, members }) {
  if (!participants) {
    return <span className="badge badge-red"><AlertTriangle size={10} /> Unassigned</span>
  }
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

// ── Header checkbox (tri-state: all selected / partial / none) ───────────────

function HeaderCheckbox({ selectedCount, totalCount, onToggleAll }) {
  const isAll = selectedCount === totalCount && totalCount > 0
  const isPartial = selectedCount > 0 && selectedCount < totalCount
  return (
    <button
      onClick={onToggleAll}
      className="text-ink-500 hover:text-ink-200 transition-colors"
      title={isAll ? 'Deselect all' : 'Select all'}
    >
      {isAll
        ? <CheckSquare size={15} className="text-lime-400" />
        : isPartial
          ? <Minus size={15} className="text-lime-400/60" />
          : <Square size={15} />
      }
    </button>
  )
}

// ── Bulk participants popover ─────────────────────────────────────────────────
// A small dropdown that lets you choose who to assign to the selected transactions.

function ParticipantsPopover({ members, onApply, onClose }) {
  const [selected, setSelected] = useState([])

  const toggle = (id) => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )

  return (
    <div className="absolute left-0 top-full mt-1 z-50 bg-ink-800 border border-ink-600 rounded-lg shadow-xl p-3 min-w-[180px]">
      <div className="text-xs text-ink-400 mb-2 font-medium uppercase tracking-wider">Participants</div>
      {/* "Everyone" shortcut — most common trip choice */}
      <button
        className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-ink-700 text-lime-400 mb-1 flex items-center gap-1.5"
        onClick={() => onApply({ type: 'all', member_ids: members.map(m => m.id) })}
      >
        <Users size={10} /> Everyone
      </button>
      {/* Individual member toggles */}
      <div className="space-y-0.5 mb-2">
        {members.map(m => (
          <button
            key={m.id}
            onClick={() => toggle(m.id)}
            className={clsx(
              'w-full text-left text-xs px-2 py-1.5 rounded flex items-center gap-2 transition-colors',
              selected.includes(m.id)
                ? 'bg-lime-400/10 text-lime-400'
                : 'hover:bg-ink-700 text-ink-300'
            )}
          >
            {selected.includes(m.id) ? <Check size={10} /> : <Square size={10} />}
            {m.name}
          </button>
        ))}
      </div>
      {selected.length > 0 && (
        <button
          className="w-full btn-primary text-xs py-1.5 justify-center"
          onClick={() => onApply({ type: 'custom', member_ids: selected })}
        >
          Apply to {selected.length} member{selected.length > 1 ? 's' : ''}
        </button>
      )}
      <button className="w-full btn-ghost text-xs py-1 justify-center mt-1 text-ink-500" onClick={onClose}>
        Cancel
      </button>
    </div>
  )
}

// ── Inline category editor ────────────────────────────────────────────────────
// Shown in the table cell when user clicks a category badge.

function InlineCategoryEdit({ txn, groupId, onClose }) {
  const qc = useQueryClient()
  const update = useMutation({
    mutationFn: (cat) => api.updateTransaction(txn.id, { category: cat }),
    onSuccess: () => {
      qc.invalidateQueries(['group-transactions', groupId])
      onClose()
    },
  })
  return (
    <select
      className="select text-xs py-0.5 px-1.5 h-6"
      defaultValue={txn.category}
      autoFocus
      onChange={(e) => update.mutate(e.target.value)}
      onBlur={onClose}
    >
      {CATEGORIES.map(c => (
        <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
      ))}
    </select>
  )
}

// ── Inline participants editor ────────────────────────────────────────────────
// Shown in the table cell when user clicks a participants badge.

function InlineParticipantsEdit({ txn, members, groupId, onClose }) {
  const [ids, setIds] = useState(txn.participants_json?.member_ids || [])
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: (p) => api.updateTransaction(txn.id, { participants_json: p }),
    onSuccess: () => {
      qc.invalidateQueries(['group-transactions', groupId])
      onClose()
    },
  })

  const toggle = (id) => setIds(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  )

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {members.map(m => (
        <button
          key={m.id}
          onClick={() => toggle(m.id)}
          className={clsx(
            'px-1.5 py-0.5 rounded text-[10px] font-medium border transition-all',
            ids.includes(m.id)
              ? 'bg-lime-400/15 text-lime-400 border-lime-400/30'
              : 'bg-ink-700 text-ink-500 border-ink-600 hover:border-ink-400'
          )}
        >
          {m.name}
        </button>
      ))}
      <button
        className="px-1.5 py-0.5 rounded text-[10px] border border-lime-400/20 text-lime-400 hover:bg-lime-400/10"
        onClick={() => setIds(members.map(m => m.id))}
      >
        All
      </button>
      <button
        className="px-1.5 py-0.5 rounded text-[10px] border border-lime-400/20 text-lime-400 hover:bg-lime-400/10 flex items-center"
        onClick={() => update.mutate({ type: 'custom', member_ids: ids })}
      >
        <Check size={9} />
      </button>
      <button
        className="px-1.5 py-0.5 rounded text-[10px] border border-ink-600 text-ink-400 hover:border-ink-400 flex items-center"
        onClick={onClose}
      >
        <X size={9} />
      </button>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

// ── Add Expense Modal ─────────────────────────────────────────────────────────
// Lets the user manually log a single expense without uploading a bank statement.
// Useful for cash expenses, IOUs, or anything not on a card statement.
//
// Supports 3 split methods:
//   - equal: everyone pays the same share
//   - percentage: each person pays a % (must add up to 100)
//   - exact: each person pays a specific dollar amount (must add up to total)
//
// Also supports multi-currency: if the group has a base currency like USD but
// the expense was charged in JPY, enter the amount in JPY and provide an exchange rate.

// ── Edit Transaction Modal ────────────────────────────────────────────────────
// A simple "fix it" form for correcting parsing errors or adjusting any field.
// Unlike AddExpenseModal it pre-fills all values from the existing transaction.
// Currency conversion is NOT re-done here — we just update the stored base-currency
// amount directly. This is the right UX: if someone misread "¥5,000" as "¥50,000"
// we just fix the number, we don't re-run exchange rate math.

function EditTransactionModal({ transaction, members, baseCurrency, onClose }) {
  const qc = useQueryClient()

  // Pre-fill the form with the existing transaction values
  const [date, setDate] = useState(transaction.posted_date || '')
  const [description, setDescription] = useState(transaction.description_raw || '')
  const [amount, setAmount] = useState(String(transaction.amount ?? ''))
  const [category, setCategory] = useState(transaction.category || '')
  // Participants: start from the current participants_json, if any
  const initIds = transaction.participants_json?.member_ids || members.map(m => m.id)
  const [participantIds, setParticipantIds] = useState(initIds)
  const [error, setError] = useState('')

  // ── Split method state ──────────────────────────────────────────────────────
  // Read the existing split_method_json to pre-fill the split mode selector
  const initSplitMode = transaction.split_method_json?.type || 'equal'
  const [splitMode, setSplitMode] = useState(initSplitMode)

  // Pre-fill percentages from existing data, or equal distribution as fallback
  const [percentages, setPercentages] = useState(() => {
    const existing = transaction.split_method_json?.percentages
    if (existing) return Object.fromEntries(Object.entries(existing).map(([k, v]) => [k, String(v)]))
    const share = members.length > 0 ? (100 / members.length) : 0
    return Object.fromEntries(members.map(m => [String(m.id), String(share.toFixed(1))]))
  })

  // Pre-fill exact amounts from existing data, or empty strings
  const [exactAmounts, setExactAmounts] = useState(() => {
    const existing = transaction.split_method_json?.amounts
    if (existing) return Object.fromEntries(Object.entries(existing).map(([k, v]) => [k, String(v)]))
    return Object.fromEntries(members.map(m => [String(m.id), '']))
  })

  const toggleParticipant = (id) =>
    setParticipantIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const isAllSelected = participantIds.length === members.length

  // ── Split validation ──────────────────────────────────────────────────────
  const expenseAmount = parseFloat(amount) || 0
  const percentageTotal = participantIds.reduce((sum, id) => sum + (parseFloat(percentages[String(id)]) || 0), 0)
  const exactTotal = participantIds.reduce((sum, id) => sum + (parseFloat(exactAmounts[String(id)]) || 0), 0)
  const percentageValid = Math.abs(percentageTotal - 100) < 0.01
  const exactValid = Math.abs(exactTotal - expenseAmount) < 0.01

  // ── Build split_method_json for the backend ─────────────────────────────
  function buildSplitMethod() {
    if (splitMode === 'percentage') {
      const percs = {}
      participantIds.forEach(id => { percs[String(id)] = parseFloat(percentages[String(id)]) || 0 })
      return { type: 'percentage', percentages: percs }
    }
    if (splitMode === 'exact') {
      const amounts = {}
      participantIds.forEach(id => { amounts[String(id)] = parseFloat(exactAmounts[String(id)]) || 0 })
      return { type: 'exact', amounts }
    }
    return { type: 'equal' }
  }

  const splitValid = splitMode === 'equal'
    || (splitMode === 'percentage' && percentageValid)
    || (splitMode === 'exact' && exactValid)

  const save = useMutation({
    mutationFn: () => api.updateTransaction(transaction.id, {
      posted_date: date,
      description_raw: description.trim(),
      amount: parseFloat(amount),
      category: category || null,
      participants_json: isAllSelected
        ? { type: 'all', member_ids: members.map(m => m.id) }
        : { type: 'custom', member_ids: participantIds },
      split_method_json: buildSplitMethod(),
    }),
    onSuccess: () => {
      qc.invalidateQueries(['group-transactions', transaction.statement_id])
      qc.invalidateQueries({ predicate: q => q.queryKey[0] === 'group-transactions' })
      onClose()
    },
    onError: (err) => setError(err.message || 'Save failed'),
  })

  const canSubmit = description.trim() && parseFloat(amount) > 0 && participantIds.length > 0 && splitValid && !save.isPending

  const sym = CURRENCY_SYMBOLS[baseCurrency] || baseCurrency + ' '

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 flex-shrink-0">
          <h2 className="font-display text-lg font-semibold text-ink-50">Edit Transaction</h2>
          <button onClick={onClose} className="text-ink-400 hover:text-ink-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Date and Amount row */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-ink-400 mb-1.5">Date</label>
              <input
                type="date"
                className="input w-full text-sm [color-scheme:dark]"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-ink-400 mb-1.5">Amount ({sym})</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                className="input w-full text-sm"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs text-ink-400 mb-1.5">Description / Merchant</label>
            <input
              type="text"
              className="input w-full text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Dinner at Nobu"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-xs text-ink-400 mb-1.5">Category</label>
            <select
              className="select w-full text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Auto-detect</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>

          {/* Participants */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-ink-400">Split between</label>
              <div className="flex gap-2">
                <button
                  className="text-[10px] text-lime-400 hover:text-lime-300 transition-colors"
                  onClick={() => setParticipantIds(members.map(m => m.id))}
                >
                  All
                </button>
                <button
                  className="text-[10px] text-ink-400 hover:text-ink-300 transition-colors"
                  onClick={() => setParticipantIds([])}
                >
                  None
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {members.map(m => (
                <button
                  key={m.id}
                  onClick={() => toggleParticipant(m.id)}
                  className={clsx(
                    'px-2.5 py-1 rounded-full text-xs font-medium transition-colors border',
                    participantIds.includes(m.id)
                      ? 'bg-lime-400/10 border-lime-400/40 text-lime-300'
                      : 'bg-ink-800 border-ink-600 text-ink-400 hover:border-ink-400 hover:text-ink-300'
                  )}
                >
                  {m.name}
                </button>
              ))}
            </div>
            {participantIds.length === 0 && (
              <p className="text-xs text-amber-400 mt-1.5">Select at least one participant</p>
            )}
          </div>

          {/* ── Split method selector ───────────────────────────────────────── */}
          {participantIds.length > 0 && (
            <div>
              <label className="block text-xs text-ink-400 mb-2">Split method</label>

              {/* Equal / Percentage / Exact toggle */}
              <div className="flex gap-1 p-1 bg-ink-800 rounded-lg mb-3">
                {[
                  { key: 'equal',      label: 'Equal' },
                  { key: 'percentage', label: 'Percentage' },
                  { key: 'exact',      label: 'Exact' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSplitMode(key)}
                    className={clsx(
                      'flex-1 text-xs py-1.5 px-2 rounded-md transition-all font-medium',
                      splitMode === key
                        ? 'bg-lime-400 text-ink-950 shadow-sm'
                        : 'text-ink-400 hover:text-ink-200'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Equal: just shows the per-person amount */}
              {splitMode === 'equal' && (
                <p className="text-xs text-ink-400">
                  {sym}{expenseAmount.toFixed(2)} divided equally among {participantIds.length} participant{participantIds.length !== 1 ? 's' : ''}.
                  {expenseAmount > 0 && (
                    <span className="text-ink-300 ml-1">
                      ({sym}{(expenseAmount / participantIds.length).toFixed(2)} each)
                    </span>
                  )}
                </p>
              )}

              {/* Percentage: one input per participant + running total */}
              {splitMode === 'percentage' && (
                <div className="space-y-2">
                  {participantIds.map(id => {
                    const member = members.find(m => m.id === id)
                    if (!member) return null
                    return (
                      <div key={id} className="flex items-center gap-3">
                        <span className="text-sm text-ink-300 w-24 truncate flex-shrink-0">{member.name}</span>
                        <div className="relative flex-1">
                          <input
                            type="number" min="0" max="100" step="0.1"
                            className="input w-full text-sm pr-7"
                            value={percentages[String(id)] ?? ''}
                            onChange={(e) => setPercentages(prev => ({ ...prev, [String(id)]: e.target.value }))}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-400 text-xs">%</span>
                        </div>
                        {/* Dollar equivalent of the percentage */}
                        {expenseAmount > 0 && percentages[String(id)] && (
                          <span className="text-xs text-ink-400 w-16 text-right flex-shrink-0">
                            {sym}{((parseFloat(percentages[String(id)]) || 0) / 100 * expenseAmount).toFixed(2)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {/* Running total — red when not 100% */}
                  <div className={clsx(
                    'flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border',
                    percentageValid
                      ? 'bg-lime-400/5 border-lime-400/20 text-lime-400'
                      : 'bg-red-400/5 border-red-400/20 text-red-400'
                  )}>
                    <span>Total</span>
                    <span className="font-mono font-semibold">
                      {percentageTotal.toFixed(1)}% {percentageValid ? '— perfect!' : '— must equal 100%'}
                    </span>
                  </div>
                  {!percentageValid && (
                    <button
                      type="button"
                      className="text-xs text-lime-400/70 hover:text-lime-400 transition-colors"
                      onClick={() => {
                        const share = (100 / participantIds.length).toFixed(1)
                        setPercentages(prev => ({ ...prev, ...Object.fromEntries(participantIds.map(id => [String(id), share])) }))
                      }}
                    >
                      Fill equal percentages
                    </button>
                  )}
                </div>
              )}

              {/* Exact amounts: one dollar input per participant */}
              {splitMode === 'exact' && (
                <div className="space-y-2">
                  {participantIds.map(id => {
                    const member = members.find(m => m.id === id)
                    if (!member) return null
                    return (
                      <div key={id} className="flex items-center gap-3">
                        <span className="text-sm text-ink-300 w-24 truncate flex-shrink-0">{member.name}</span>
                        <div className="relative flex-1">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-400 text-xs">{sym}</span>
                          <input
                            type="number" min="0" step="0.01" placeholder="0.00"
                            className="input w-full text-sm pl-7"
                            value={exactAmounts[String(id)] ?? ''}
                            onChange={(e) => setExactAmounts(prev => ({ ...prev, [String(id)]: e.target.value }))}
                          />
                        </div>
                      </div>
                    )
                  })}
                  {/* Running total vs expected */}
                  <div className={clsx(
                    'flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border',
                    exactValid
                      ? 'bg-lime-400/5 border-lime-400/20 text-lime-400'
                      : 'bg-red-400/5 border-red-400/20 text-red-400'
                  )}>
                    <span>Total assigned</span>
                    <span className="font-mono font-semibold">
                      {sym}{exactTotal.toFixed(2)} / {sym}{expenseAmount.toFixed(2)}
                      {' — '}{exactValid ? 'perfect!' : `${sym}${Math.abs(expenseAmount - exactTotal).toFixed(2)} ${exactTotal < expenseAmount ? 'remaining' : 'over'}`}
                    </span>
                  </div>
                  {!exactValid && expenseAmount > 0 && (
                    <button
                      type="button"
                      className="text-xs text-lime-400/70 hover:text-lime-400 transition-colors"
                      onClick={() => {
                        const share = (expenseAmount / participantIds.length).toFixed(2)
                        setExactAmounts(prev => ({ ...prev, ...Object.fromEntries(participantIds.map(id => [String(id), share])) }))
                      }}
                    >
                      Fill equal amounts
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-ink-800 flex gap-3 justify-end flex-shrink-0">
          <button onClick={onClose} className="btn-secondary text-sm">Cancel</button>
          <button
            className="btn-primary text-sm"
            onClick={() => save.mutate()}
            disabled={!canSubmit}
          >
            {save.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

function AddExpenseModal({ groupId, members, group, onClose, onSaved }) {
  const qc = useQueryClient()

  // The group's settlement currency — all foreign amounts convert to this
  const baseCurrency = group?.base_currency || 'USD'

  // Default the date to today so users don't have to type it every time
  const today = new Date().toISOString().split('T')[0]

  const [posted_date, setPostedDate] = useState(today)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState(baseCurrency)     // starts at group's base currency
  const [exchangeRate, setExchangeRate] = useState('')       // shown only when currency differs
  const [paidBy, setPaidBy] = useState(members[0]?.id ?? '')
  // By default everyone splits — all member IDs checked
  const [participantIds, setParticipantIds] = useState(members.map(m => m.id))
  const [category, setCategory] = useState('')   // empty = auto-detect on backend
  const [error, setError] = useState('')

  // Split method: 'equal' | 'percentage' | 'exact'
  const [splitMode, setSplitMode] = useState('equal')

  // Per-participant percentages — keyed by member ID as string
  // Initialized to equal split across all members
  const [percentages, setPercentages] = useState(() => {
    const share = members.length > 0 ? (100 / members.length) : 0
    return Object.fromEntries(members.map(m => [String(m.id), String(share.toFixed(1))]))
  })

  // Per-participant exact amounts — keyed by member ID as string
  const [exactAmounts, setExactAmounts] = useState(() =>
    Object.fromEntries(members.map(m => [String(m.id), '']))
  )

  const toggleParticipant = (id) => {
    setParticipantIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const selectAll = () => setParticipantIds(members.map(m => m.id))
  const selectNone = () => setParticipantIds([])

  // ── Split validation ──────────────────────────────────────────────────────

  // Compute the sum of all percentages entered (for the validation indicator)
  const percentageTotal = participantIds.reduce((sum, id) => {
    return sum + (parseFloat(percentages[String(id)]) || 0)
  }, 0)

  // Compute the sum of all exact amounts entered
  const exactTotal = participantIds.reduce((sum, id) => {
    return sum + (parseFloat(exactAmounts[String(id)]) || 0)
  }, 0)

  // When percentage mode is active, the split is valid only when %s add up to 100
  const percentageValid = Math.abs(percentageTotal - 100) < 0.01

  // When exact mode is active, the split is valid only when amounts add up to the total
  const expenseAmount = parseFloat(amount) || 0
  const exactValid = Math.abs(exactTotal - expenseAmount) < 0.01

  // ── Build the split_method_json to send to the backend ────────────────────
  function buildSplitMethod() {
    if (splitMode === 'equal') {
      return { type: 'equal' }
    }
    if (splitMode === 'percentage') {
      // { type: "percentage", percentages: { "1": 60, "2": 40 } }
      const percs = {}
      participantIds.forEach(id => {
        percs[String(id)] = parseFloat(percentages[String(id)]) || 0
      })
      return { type: 'percentage', percentages: percs }
    }
    if (splitMode === 'exact') {
      // { type: "exact", amounts: { "1": 45.00, "2": 23.50 } }
      const amounts = {}
      participantIds.forEach(id => {
        amounts[String(id)] = parseFloat(exactAmounts[String(id)]) || 0
      })
      return { type: 'exact', amounts }
    }
    return { type: 'equal' }
  }

  const save = useMutation({
    mutationFn: () => api.createManualTransaction(groupId, {
      postedDate: posted_date,
      description: description.trim(),
      amount: parseFloat(amount),
      paidByMemberId: parseInt(paidBy),
      category: category || null,
      participantIds: participantIds.length === members.length
        ? null   // null = backend uses "all" type (cleaner)
        : participantIds,
      splitMethod: buildSplitMethod(),
      // Multi-currency: only send if it differs from base currency
      currency,
      exchangeRate: currency !== baseCurrency && exchangeRate ? parseFloat(exchangeRate) : null,
    }),
    onSuccess: () => {
      // Refresh the transactions list so the new expense appears immediately
      qc.invalidateQueries(['group-transactions', groupId])
      onSaved?.()
      onClose()
    },
    onError: (err) => setError(err.message),
  })

  // A split is valid when the chosen method's constraints are satisfied
  const splitValid = splitMode === 'equal' || (splitMode === 'percentage' && percentageValid) || (splitMode === 'exact' && exactValid)
  // Exchange rate required when currency differs from base
  const rateValid = currency === baseCurrency || (exchangeRate && parseFloat(exchangeRate) > 0)
  const canSubmit = description.trim() && amount > 0 && paidBy && participantIds.length > 0 && splitValid && rateValid

  // The label to show on the amount field — "$" for USD, "¥" for JPY, etc.
  const currencySymbol = CURRENCY_SYMBOLS[currency] || currency + ' '

  return (
    // Dark overlay — clicking outside closes the modal
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Scrollable inner container — the form can be tall when many members have percentage inputs */}
      <div className="bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 flex-shrink-0">
          <h2 className="font-display text-lg font-semibold text-ink-50">Add Expense</h2>
          <button onClick={onClose} className="text-ink-500 hover:text-ink-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          {/* Date + Amount + Currency */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-ink-400 mb-1.5">Date</label>
              <input
                type="date"
                className="input w-full text-sm [color-scheme:dark]"
                value={posted_date}
                onChange={(e) => setPostedDate(e.target.value)}
              />
            </div>
            <div className="flex-1">
              {/* Label shows the selected currency's symbol */}
              <label className="block text-xs text-ink-400 mb-1.5">Amount ({currencySymbol})</label>
              <div className="flex gap-1.5">
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  className="input flex-1 text-sm min-w-0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  autoFocus
                />
                {/* Currency selector — compact dropdown next to amount */}
                <select
                  className="select text-sm w-20 flex-shrink-0"
                  value={currency}
                  onChange={(e) => {
                    setCurrency(e.target.value)
                    // Reset exchange rate when switching currencies
                    setExchangeRate('')
                  }}
                >
                  {CURRENCIES.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Exchange rate — only shown when currency differs from the group's base currency */}
          {currency !== baseCurrency && (
            <div className="rounded-lg bg-ink-800/60 border border-ink-700 px-4 py-3">
              <label className="block text-xs text-ink-400 mb-1.5">
                Exchange rate
                <span className="text-ink-600 ml-1">(required for conversion to {baseCurrency})</span>
              </label>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-ink-400 text-xs">1 {currency} =</span>
                <input
                  type="number"
                  min="0.000001"
                  step="any"
                  placeholder="0.0067"
                  className="input flex-1 text-sm"
                  value={exchangeRate}
                  onChange={(e) => setExchangeRate(e.target.value)}
                />
                <span className="text-ink-400 text-xs">{baseCurrency}</span>
              </div>
              {/* Show what the converted amount will be so user can verify */}
              {amount && exchangeRate && parseFloat(exchangeRate) > 0 && (
                <p className="text-xs text-lime-400/80 mt-1.5">
                  {formatCurrency(parseFloat(amount), currency)} ≈ {formatCurrency(parseFloat(amount) * parseFloat(exchangeRate), baseCurrency)}
                </p>
              )}
            </div>
          )}

          {/* Description */}
          <div>
            <label className="block text-xs text-ink-400 mb-1.5">Description / Merchant</label>
            <input
              type="text"
              placeholder="e.g. Dinner at Nobu, Taxi to airport, Cash for groceries…"
              className="input w-full text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Paid by */}
          <div>
            <label className="block text-xs text-ink-400 mb-1.5">Paid by</label>
            <select
              className="select w-full text-sm"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Category (optional — auto-detected if left blank) */}
          <div>
            <label className="block text-xs text-ink-400 mb-1.5">
              Category <span className="text-ink-600">(auto-detected if blank)</span>
            </label>
            <select
              className="select w-full text-sm"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Auto-detect</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Who splits this? */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-ink-400">Split between</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={selectAll}
                  className="text-xs text-lime-400 hover:text-lime-300 transition-colors"
                >All</button>
                <span className="text-ink-700">·</span>
                <button
                  type="button"
                  onClick={selectNone}
                  className="text-xs text-ink-500 hover:text-ink-300 transition-colors"
                >None</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {members.map(m => {
                const checked = participantIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleParticipant(m.id)}
                    className={clsx(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm border transition-all text-left',
                      checked
                        ? 'bg-lime-400/10 border-lime-400/30 text-lime-300'
                        : 'bg-ink-800/50 border-ink-700 text-ink-400 hover:border-ink-500'
                    )}
                  >
                    {checked
                      ? <Check size={12} className="text-lime-400 flex-shrink-0" />
                      : <div className="w-3 h-3 rounded border border-ink-600 flex-shrink-0" />
                    }
                    {m.name}
                  </button>
                )
              })}
            </div>
            {participantIds.length === 0 && (
              <p className="text-xs text-amber-400 mt-1.5">Select at least one participant</p>
            )}
          </div>

          {/* ── Split method selector ─────────────────────────────────────── */}
          {/* Only show when there are participants selected */}
          {participantIds.length > 0 && (
            <div>
              <label className="block text-xs text-ink-400 mb-2">Split method</label>

              {/* Toggle pills: Equal | Percentage | Exact */}
              <div className="flex gap-1 p-1 bg-ink-800 rounded-lg mb-3">
                {[
                  { key: 'equal',      label: 'Equal' },
                  { key: 'percentage', label: 'Percentage' },
                  { key: 'exact',      label: 'Exact' },
                ].map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSplitMode(key)}
                    className={clsx(
                      'flex-1 text-xs py-1.5 px-2 rounded-md transition-all font-medium',
                      splitMode === key
                        ? 'bg-lime-400 text-ink-950 shadow-sm'
                        : 'text-ink-400 hover:text-ink-200'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Equal: just a description, no extra inputs needed */}
              {splitMode === 'equal' && (
                <p className="text-xs text-ink-500">
                  {formatCurrency(expenseAmount, currency)} divided equally among {participantIds.length} participant{participantIds.length !== 1 ? 's' : ''}.
                  {participantIds.length > 0 && expenseAmount > 0 && (
                    <span className="text-ink-400 ml-1">
                      ({formatCurrency(expenseAmount / participantIds.length, currency)} each)
                    </span>
                  )}
                </p>
              )}

              {/* Percentage: one input per participant, running total shown */}
              {splitMode === 'percentage' && (
                <div className="space-y-2">
                  {/* One row per selected participant */}
                  {participantIds.map(id => {
                    const member = members.find(m => m.id === id)
                    if (!member) return null
                    return (
                      <div key={id} className="flex items-center gap-3">
                        <span className="text-sm text-ink-300 w-24 truncate flex-shrink-0">{member.name}</span>
                        <div className="relative flex-1">
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            className="input w-full text-sm pr-7"
                            value={percentages[String(id)] ?? ''}
                            onChange={(e) => setPercentages(prev => ({ ...prev, [String(id)]: e.target.value }))}
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-500 text-xs">%</span>
                        </div>
                        {/* Show what dollar amount this % equals (helpful for verification) */}
                        {expenseAmount > 0 && percentages[String(id)] && (
                          <span className="text-xs text-ink-500 w-16 text-right flex-shrink-0">
                            {formatCurrency((parseFloat(percentages[String(id)]) || 0) / 100 * expenseAmount, currency)}
                          </span>
                        )}
                      </div>
                    )
                  })}
                  {/* Running total — goes red if not 100 */}
                  <div className={clsx(
                    'flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border',
                    percentageValid
                      ? 'bg-lime-400/5 border-lime-400/20 text-lime-400'
                      : 'bg-red-400/5 border-red-400/20 text-red-400'
                  )}>
                    <span>Total</span>
                    <span className="font-mono font-semibold">
                      {percentageTotal.toFixed(1)}% {percentageValid ? '— perfect!' : `— needs to be 100%`}
                    </span>
                  </div>
                  {/* Quick-fill button: distribute remaining % evenly */}
                  {!percentageValid && participantIds.length > 0 && (
                    <button
                      type="button"
                      className="text-xs text-lime-400/70 hover:text-lime-400 transition-colors"
                      onClick={() => {
                        // Fill equal percentages for all selected participants
                        const share = (100 / participantIds.length).toFixed(1)
                        const filled = Object.fromEntries(participantIds.map(id => [String(id), share]))
                        setPercentages(prev => ({ ...prev, ...filled }))
                      }}
                    >
                      Fill equal percentages
                    </button>
                  )}
                </div>
              )}

              {/* Exact amounts: one dollar input per participant */}
              {splitMode === 'exact' && (
                <div className="space-y-2">
                  {participantIds.map(id => {
                    const member = members.find(m => m.id === id)
                    if (!member) return null
                    return (
                      <div key={id} className="flex items-center gap-3">
                        <span className="text-sm text-ink-300 w-24 truncate flex-shrink-0">{member.name}</span>
                        <div className="relative flex-1">
                          {/* Show the currency symbol before the input */}
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500 text-xs">
                            {currencySymbol}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="0.00"
                            className="input w-full text-sm pl-7"
                            value={exactAmounts[String(id)] ?? ''}
                            onChange={(e) => setExactAmounts(prev => ({ ...prev, [String(id)]: e.target.value }))}
                          />
                        </div>
                      </div>
                    )
                  })}
                  {/* Running total vs expected — goes red if mismatch */}
                  <div className={clsx(
                    'flex items-center justify-between text-xs px-2 py-1.5 rounded-lg border',
                    exactValid
                      ? 'bg-lime-400/5 border-lime-400/20 text-lime-400'
                      : 'bg-red-400/5 border-red-400/20 text-red-400'
                  )}>
                    <span>Total assigned</span>
                    <span className="font-mono font-semibold">
                      {formatCurrency(exactTotal, currency)} / {formatCurrency(expenseAmount, currency)}
                      {exactValid ? ' — ' : ' — '}
                      {exactValid
                        ? 'perfect!'
                        : `${formatCurrency(Math.abs(expenseAmount - exactTotal), currency)} ${exactTotal < expenseAmount ? 'remaining' : 'over'}`
                      }
                    </span>
                  </div>
                  {/* Quick-fill: split remainder evenly among blank fields */}
                  {!exactValid && expenseAmount > 0 && (
                    <button
                      type="button"
                      className="text-xs text-lime-400/70 hover:text-lime-400 transition-colors"
                      onClick={() => {
                        const share = (expenseAmount / participantIds.length).toFixed(2)
                        const filled = Object.fromEntries(participantIds.map(id => [String(id), share]))
                        setExactAmounts(prev => ({ ...prev, ...filled }))
                      }}
                    >
                      Fill equal amounts
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Error display */}
          {error && (
            <p className="text-xs text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 pb-5 flex-shrink-0 pt-2 border-t border-ink-800">
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => save.mutate()}
            disabled={!canSubmit || save.isPending}
          >
            <Plus size={14} />
            {save.isPending ? 'Adding…' : 'Add Expense'}
          </button>
          <button className="btn-ghost px-4" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}


export default function TransactionsPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  // Statement filter — set when user clicks a statement row in TripOverviewPage.
  // Stored in the URL (?statement=123) so it survives refresh and can be shared.
  const statementIdFilter = searchParams.get('statement')
    ? parseInt(searchParams.get('statement'))
    : null

  // Which rows are checked (main table bulk selection)
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Which rows are checked in the pre-trip callout (separate selection so it
  // doesn't interfere with the main table's bulk toolbar)
  const [preTripSelected, setPreTripSelected] = useState(new Set())

  // Filter tabs and search
  const [filter, setFilter] = useState('all') // 'all' | 'needs-review' | 'assigned' | 'excluded'
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Date range filter — ISO date strings (YYYY-MM-DD) or empty string for no limit.
  // Works via string comparison, which is correct for ISO dates.
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Track which cell is open for inline editing: { txnId, field }
  const [editingCell, setEditingCell] = useState(null)

  // Whether the "Set Participants" popover in the bulk toolbar is open
  const [showParticipantsPopover, setShowParticipantsPopover] = useState(false)

  // Whether the Add Expense modal is open
  const [showAddExpense, setShowAddExpense] = useState(false)

  // If we arrived here via the "Add expense manually" shortcut from TripOverview,
  // auto-open the modal so the user doesn't have to hunt for it.
  useEffect(() => {
    if (location.state?.openAddExpense) {
      setShowAddExpense(true)
      // Clear the navigation state so a page refresh doesn't re-open the modal
      window.history.replaceState({}, '', window.location.pathname)
    }
  }, [location.state])

  // ID of the transaction currently showing "Delete?" confirmation
  // (null = no confirmation visible). One at a time — clicking another row resets it.
  const [confirmDeleteId, setConfirmDeleteId] = useState(null)

  // ID of the transaction currently open in the Edit modal (null = modal closed)
  const [editTxnId, setEditTxnId] = useState(null)

  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
  })

  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ['group-transactions', groupId],
    queryFn: () => api.getGroupTransactions(groupId),
  })

  const { data: statements = [] } = useQuery({
    queryKey: ['group-statements', groupId],
    queryFn: () => api.getStatements(groupId),
  })

  const members = group?.members || []

  // Build a lookup: statement_id → payer name
  // Used to show "Paid by" in the transactions table without a backend change.
  const paidByMap = useMemo(() => {
    const map = {}
    for (const stmt of statements) {
      if (stmt.card_holder_member_id) {
        const member = members.find(m => m.id === stmt.card_holder_member_id)
        if (member) map[stmt.id] = member.name
      }
    }
    return map
  }, [statements, members])

  // ── Delete mutation ───────────────────────────────────────────────────────
  // Removes a transaction permanently. Best for manually-entered expenses.
  // For uploaded ones, excluding is safer (delete = would re-appear on re-upload).
  const deleteTxn = useMutation({
    mutationFn: (id) => api.deleteTransaction(id),
    onSuccess: () => {
      qc.invalidateQueries(['group-transactions', groupId])
      setConfirmDeleteId(null)
    },
  })

  // ── Bulk update mutation with optimistic UI ───────────────────────────────
  // Optimistic = we update the screen immediately and roll back if the API call fails.
  // This makes bulk actions feel instant even on slow connections.
  const bulkUpdate = useMutation({
    mutationFn: (body) => api.bulkUpdateTransactions(groupId, body),
    onMutate: async (body) => {
      // Cancel any outgoing refetches (so they don't overwrite our optimistic update)
      await qc.cancelQueries(['group-transactions', groupId])

      // Snapshot the previous data so we can roll back if needed
      const prev = qc.getQueryData(['group-transactions', groupId])

      // Optimistically apply the updates to the cache right now
      qc.setQueryData(['group-transactions', groupId], old =>
        (old || []).map(t => {
          if (!body.transaction_ids.includes(t.id)) return t
          // Only apply fields that were actually sent (not null/undefined)
          const updates = {}
          if (body.category != null) updates.category = body.category
          if (body.status != null) updates.status = body.status
          if (body.participants_json != null) updates.participants_json = body.participants_json
          if (body.split_method_json != null) updates.split_method_json = body.split_method_json
          if (body.is_personal != null) updates.is_personal = body.is_personal
          return { ...t, ...updates }
        })
      )
      return { prev } // Return context for onError
    },
    onError: (_err, _body, ctx) => {
      // Roll back to the previous snapshot if the API call failed
      qc.setQueryData(['group-transactions', groupId], ctx.prev)
    },
    onSettled: () => {
      // Refresh from server to stay in sync, then clear selection
      qc.invalidateQueries(['group-transactions', groupId])
      setSelectedIds(new Set())
    },
  })

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const excluded = transactions.filter(t => t.status === 'excluded').length
    const needsReview = transactions.filter(t =>
      t.status === 'unreviewed' && (
        t.participants_json?.type === 'ask' ||
        (t.participants_json?.type === 'single' && !t.participants_json?.member_ids?.length)
      )
    ).length
    // "Shared" = not excluded, has participants assigned → these will show up in settlement
    const sharedTxns = transactions.filter(t =>
      t.status !== 'excluded' && t.participants_json?.member_ids?.length > 0
    )
    const sharedTotal = sharedTxns.reduce((s, t) => s + t.amount, 0)
    return { excluded, needsReview, sharedCount: sharedTxns.length, sharedTotal }
  }, [transactions])

  // ── Probable pre-trip bookings ────────────────────────────────────────────
  // Finds excluded transactions that: (a) fell before the trip start date, and
  // (b) look like a travel booking — either by category OR by merchant keyword.
  //
  // The keyword fallback is important because real Chase PDFs often label flights
  // and hotels as 'unknown' due to truncated/encoded merchant names. Relying on
  // category alone would miss most real-world pre-trip bookings.
  const probablePreTripBookings = useMemo(() => {
    if (!group?.start_date) return []
    return transactions.filter(t =>
      t.status === 'excluded' &&
      t.posted_date < group.start_date &&
      (LIKELY_TRIP_CATEGORIES.includes(t.category) || isTravelKeywordMatch(t.description_raw))
    )
  }, [transactions, group])

  // ── Filtering ─────────────────────────────────────────────────────────────
  //
  // Tab logic — every transaction belongs to exactly one tab:
  //
  //   All          → literally everything (132 = 92 + 16 + 24)
  //   Needs Review → unreviewed AND participants unclear
  //   Assigned     → has participants set, not excluded  (the "ready" bucket)
  //   Excluded     → out of settlement
  //
  // This makes the numbers add up and removes the confusion where some
  // transactions (the "16 shared") had nowhere obvious to live.
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      // ── Step 1: Tab filter — eliminates transactions that don't belong here ──
      // Each tab is a gate. Transactions that don't pass the gate are excluded.
      // "All" passes everything through (no gate).
      if (filter === 'needs-review') {
        if (!(t.status === 'unreviewed' && (
          t.participants_json?.type === 'ask' ||
          (t.participants_json?.type === 'single' && !t.participants_json?.member_ids?.length)
        ))) return false
      } else if (filter === 'assigned') {
        if (!(t.status !== 'excluded' && t.participants_json?.member_ids?.length > 0)) return false
      } else if (filter === 'excluded') {
        if (t.status !== 'excluded') return false
      }

      // ── Step 2: Secondary filters — apply on every tab, not just "All" ──
      // This is the fix: previously these only ran in the "All" branch.
      if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
      if (searchQuery && !t.description_raw.toLowerCase().includes(searchQuery.toLowerCase())) return false
      if (dateFrom && t.posted_date < dateFrom) return false
      if (dateTo && t.posted_date > dateTo) return false
      // Statement filter — set via ?statement=123 URL param when user clicks a statement row
      if (statementIdFilter && t.statement_id !== statementIdFilter) return false

      return true
    })
  }, [transactions, filter, categoryFilter, searchQuery, dateFrom, dateTo, statementIdFilter])

  // ── Selection helpers ─────────────────────────────────────────────────────

  // Toggle all currently-visible transactions
  const toggleAll = () => {
    if (selectedIds.size === filtered.length && filtered.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(t => t.id)))
    }
  }

  const toggleRow = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  /**
   * "Select all from this merchant" — normalizes description to first 3 words,
   * then adds all visible transactions that share that normalized key.
   * 7-Eleven Shinjuku + 7-Eleven Shibuya → both get selected.
   */
  const selectAllFromMerchant = (description) => {
    const key = normalizeMerchantKey(description)
    const matchIds = filtered
      .filter(t => normalizeMerchantKey(t.description_raw) === key)
      .map(t => t.id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      matchIds.forEach(id => next.add(id))
      return next
    })
  }

  if (isLoading) {
    return <div className="text-ink-500 animate-pulse-soft text-sm">Loading transactions…</div>
  }

  return (
    <div>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink-50 tracking-tight">Transactions</h1>
          <p className="text-ink-400 text-sm mt-1">
            {group?.name} · {transactions.length} total
            {selectedIds.size > 0 && (
              <span className="text-lime-400 ml-2">· {selectedIds.size} selected</span>
            )}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Export all transactions as CSV — useful for record-keeping or sharing
              a full breakdown with the group. Available any time, no settlement needed. */}
          <button
            className="btn-secondary text-xs"
            onClick={() => api.exportTransactionsCSV(groupId, group?.name || 'trip')}
            title="Download all transactions as a spreadsheet"
          >
            <Download size={13} />
            Export CSV
          </button>
          {/* Add a single expense manually — no statement upload needed */}
          <button
            className="btn-secondary text-xs"
            onClick={() => setShowAddExpense(true)}
            title="Manually add a cash or card expense"
          >
            <Plus size={13} />
            Add Expense
          </button>
          <button
            className="btn-primary"
            onClick={() => navigate(`/groups/${groupId}/settlement`)}
          >
            <TrendingUp size={14} />
            View Settlement
          </button>
        </div>
      </div>

      {/* ── Statement filter banner — shown when user clicked a statement row ── */}
      {statementIdFilter && (() => {
        const stmt = statements.find(s => s.id === statementIdFilter)
        if (!stmt) return null
        const members = group?.members || []
        const holder = stmt.card_holder_member_id
          ? members.find(m => m.id === stmt.card_holder_member_id)?.name
          : null
        const label = holder
          ? `${holder}'s ${stmt.bank_name || 'Card'}`
          : stmt.bank_name || 'Statement'
        return (
          <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-lime-400/8 border border-lime-400/25 rounded-lg">
            <span className="text-xs text-lime-400">Showing transactions from</span>
            <span className="text-xs font-semibold text-lime-300">{label}</span>
            <button
              className="ml-auto text-xs text-ink-500 hover:text-ink-300 transition-colors flex items-center gap-1"
              onClick={() => setSearchParams({})}
            >
              <X size={11} /> Clear filter
            </button>
          </div>
        )
      })()}

      {/* ── Stats row ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total', value: transactions.length, sub: 'all transactions' },
          {
            // Show shared total in the group's base currency
            label: `${formatCurrency(stats.sharedTotal, group?.base_currency || 'USD')} shared`,
            value: stats.sharedCount,
            sub: 'going to settlement',
            highlight: true,
          },
          {
            label: 'Needs Review',
            value: stats.needsReview,
            sub: 'awaiting participants',
            warn: stats.needsReview > 0,
          },
          { label: 'Excluded', value: stats.excluded, sub: 'out of settlement' },
        ].map(({ label, value, sub, highlight, warn }) => (
          <div
            key={label}
            className={clsx(
              'card-sm cursor-pointer transition-all hover:border-ink-600',
              // Clicking a stat card jumps to the relevant filter tab
              highlight && filter === 'assigned' && 'border-lime-400/30',
              warn && filter === 'needs-review' && 'border-amber-400/30',
            )}
            onClick={() => {
              if (highlight) setFilter('assigned')
              else if (warn) setFilter('needs-review')
              else if (label === 'Excluded') setFilter('excluded')
              else setFilter('all')
            }}
          >
            <div className={clsx(
              'font-mono text-2xl font-bold mb-0.5',
              highlight ? 'text-lime-400' :
              warn && value > 0 ? 'text-amber-400' : 'text-ink-100',
            )}>
              {value}
            </div>
            <div className="text-xs text-ink-200 font-medium">{label}</div>
            <div className="text-[10px] text-ink-600 mt-0.5">{sub}</div>
          </div>
        ))}
      </div>

      {/* ── Filters + search ───────────────────────────────────────────────── */}
      <div className="flex gap-2 mb-3 flex-wrap items-center">
        {[
          { key: 'all',          label: 'All',                              desc: 'Every transaction' },
          { key: 'needs-review', label: `Needs Review (${stats.needsReview})`, desc: 'Awaiting participant assignment' },
          { key: 'assigned',     label: `Assigned (${stats.sharedCount})`,  desc: 'Participants set — going to settlement' },
          { key: 'excluded',     label: `Excluded (${stats.excluded})`,     desc: 'Not included in settlement' },
        ].map(({ key, label, desc }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            title={desc}
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

        {/* Date range filter — narrow by transaction date */}
        <div className="flex items-center gap-1.5 bg-ink-800 border border-ink-700 rounded-lg px-2.5 py-1.5">
          <Calendar size={11} className="text-ink-500 flex-shrink-0" />
          <input
            type="date"
            className="bg-transparent text-xs text-ink-300 outline-none w-[112px] cursor-pointer [color-scheme:dark]"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            title="Filter from date"
          />
          <span className="text-ink-600 text-xs">–</span>
          <input
            type="date"
            className="bg-transparent text-xs text-ink-300 outline-none w-[112px] cursor-pointer [color-scheme:dark]"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            title="Filter to date"
          />
          {/* Show a clear button only when a date is active */}
          {(dateFrom || dateTo) && (
            <button
              className="text-ink-500 hover:text-ink-200 transition-colors ml-0.5"
              onClick={() => { setDateFrom(''); setDateTo('') }}
              title="Clear date filter"
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Text search — filters by merchant name */}
        <div className="relative ml-auto">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-500" />
          <input
            className="input pl-7 py-1.5 text-xs w-48"
            placeholder="Search merchant…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* ── "Needs Review" helper tip ────────────────────────────────────────
          Only shown when on the needs-review filter with items present and
          nothing selected yet. Teaches the batch workflow so users don't
          have to click into each transaction individually.
      ─────────────────────────────────────────────────────────────────────── */}
      {filter === 'needs-review' && filtered.length > 0 && selectedIds.size === 0 && (
        <div className="flex items-center gap-2.5 mb-3 px-3 py-2.5 rounded-lg bg-amber-400/5 border border-amber-400/20 animate-slide-up">
          <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
          <p className="text-xs text-ink-300">
            These transactions need a participant assignment.{' '}
            <span className="text-amber-400 font-medium">
              Check the box in the table header to select all
            </span>
            , then use{' '}
            <span className="text-amber-400 font-medium">Set Participants</span>
            {' '}to resolve them all in one go.
          </p>
        </div>
      )}

      {/* Bulk action bar moved to sticky bottom — see end of return */}

      {/* ── Pre-trip bookings callout (Excluded tab only) ──────────────────── */}
      {/*
        When the user is viewing excluded transactions, we check if any of them
        look like deliberate pre-trip bookings (flights, hotels, etc.) that were
        auto-excluded just because they were charged before the trip start date.
        We surface them here so the user doesn't have to hunt for them.
      */}
      {filter === 'excluded' && probablePreTripBookings.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/5 p-4 animate-slide-up">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Plane size={14} className="text-amber-400" />
                <h3 className="text-sm font-semibold text-amber-400">
                  Possible pre-trip bookings
                </h3>
                <span className="badge badge-amber">{probablePreTripBookings.length}</span>
              </div>
              <p className="text-xs text-ink-400">
                Auto-excluded by date, but look like trip-related bookings. Check the
                ones you want to include, then click Include Selected.
              </p>
            </div>

            {/* Action buttons — change based on whether anything is checked */}
            <div className="flex gap-2 flex-shrink-0 ml-4">
              {preTripSelected.size > 0 ? (
                <button
                  className="btn-primary text-xs py-1.5 px-3"
                  onClick={() => {
                    bulkUpdate.mutate({
                      transaction_ids: [...preTripSelected],
                      status: 'unreviewed',
                    })
                    setPreTripSelected(new Set())
                  }}
                >
                  <Check size={11} />
                  Include Selected ({preTripSelected.size})
                </button>
              ) : (
                <button
                  className="btn-ghost text-xs py-1.5 px-3 text-ink-400"
                  onClick={() => {
                    // Select all as a shortcut — user can then deselect
                    setPreTripSelected(new Set(probablePreTripBookings.map(t => t.id)))
                  }}
                >
                  Select All
                </button>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            {probablePreTripBookings.map(t => {
              const isChecked = preTripSelected.has(t.id)
              const togglePreTrip = () => setPreTripSelected(prev => {
                const next = new Set(prev)
                next.has(t.id) ? next.delete(t.id) : next.add(t.id)
                return next
              })
              return (
                <div
                  key={t.id}
                  className={clsx(
                    'flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors',
                    isChecked
                      ? 'bg-lime-400/10 border-lime-400/30'
                      : 'bg-ink-800/60 border-ink-700/50 hover:bg-ink-800'
                  )}
                  onClick={togglePreTrip}
                >
                  {/* Checkbox */}
                  <div className="flex-shrink-0">
                    {isChecked
                      ? <CheckSquare size={14} className="text-lime-400" />
                      : <Square size={14} className="text-ink-500" />
                    }
                  </div>
                  <span className="font-mono text-xs text-ink-500 w-24 flex-shrink-0">{t.posted_date}</span>
                  <span className="text-sm text-ink-200 flex-1 truncate">{t.description_raw}</span>
                  <CategoryBadge category={t.category} />
                  <span className="font-mono text-sm font-semibold text-ink-100 flex-shrink-0">
                    {formatCurrency(t.amount, group?.base_currency || 'USD')}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Transaction table ──────────────────────────────────────────────── */}
      {transactions.length === 0 ? (
        <div className="card text-center py-12">
          <List size={36} className="text-ink-600 mx-auto mb-3" />
          <p className="font-display text-xl text-ink-300 mb-2">No transactions yet</p>
          <p className="text-sm text-ink-500 mb-4">Import a bank statement (PDF or CSV) or add expenses manually to get started</p>
          <div className="flex gap-2 justify-center">
            <button className="btn-primary" onClick={() => navigate(`/groups/${groupId}/upload`)}>
              Import Statement
            </button>
            <button className="btn-secondary" onClick={() => setShowAddExpense(true)}>
              Add Manually
            </button>
          </div>
        </div>
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  {/* Checkbox column — header toggles all */}
                  <th className="w-10">
                    <HeaderCheckbox
                      selectedCount={selectedIds.size}
                      totalCount={filtered.length}
                      onToggleAll={toggleAll}
                    />
                  </th>
                  <th className="w-28">Date</th>
                  <th>Merchant</th>
                  <th>Category</th>
                  <th>Participants</th>
                  <th className="text-right">Amount</th>
                  <th className="w-24">Paid by</th>
                  <th className="w-8"></th>{/* Quick action column */}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8">
                      <p className="text-ink-400 text-sm mb-1">No transactions match your current filters</p>
                      <p className="text-ink-600 text-xs">
                        {[
                          filter !== 'all' && `Status: ${filter}`,
                          categoryFilter !== 'all' && `Category: ${categoryFilter}`,
                          searchQuery && `Search: "${searchQuery}"`,
                          dateFrom && `From: ${dateFrom}`,
                          dateTo && `To: ${dateTo}`,
                        ].filter(Boolean).join(' · ')}
                      </p>
                    </td>
                  </tr>
                ) : (
                  // When in the Excluded tab, the probable pre-trip bookings are already
                  // shown in the callout section above — filter them out here to avoid duplication.
                  (filter === 'excluded'
                    ? filtered.filter(t => !probablePreTripBookings.some(p => p.id === t.id))
                    : filtered
                  ).map((txn) => {
                    const isSelected = selectedIds.has(txn.id)
                    const isExcluded = txn.status === 'excluded'
                    const isConfirmed = txn.status === 'confirmed'
                    // "Needs review" = unreviewed AND still has unknown participants
                    const needsReview = txn.status === 'unreviewed' && (
                      txn.participants_json?.type === 'ask' ||
                      (txn.participants_json?.type === 'single' && !txn.participants_json?.member_ids?.length)
                    )
                    const isEditCat = editingCell?.txnId === txn.id && editingCell?.field === 'category'
                    const isEditPart = editingCell?.txnId === txn.id && editingCell?.field === 'participants'

                    return (
                      <tr
                        key={txn.id}
                        className={clsx(
                          'cursor-pointer select-none group',
                          isSelected && 'bg-lime-400/5',
                          // Only dim excluded rows in "All" view — in the Excluded tab
                          // itself, rows should be fully readable (you're there to review them)
                          isExcluded && filter === 'all' && 'opacity-50',
                          !isSelected && !isExcluded && needsReview && 'bg-amber-400/5',
                        )}
                        onClick={(e) => {
                          // Don't toggle row when clicking interactive elements
                          if (e.target.closest('button,select,input')) return
                          toggleRow(txn.id)
                        }}
                      >
                        {/* ── Checkbox ── */}
                        <td onClick={(e) => e.stopPropagation()} className="w-10">
                          <button
                            onClick={() => toggleRow(txn.id)}
                            className="text-ink-500 hover:text-lime-400 transition-colors"
                          >
                            {isSelected
                              ? <CheckSquare size={14} className="text-lime-400" />
                              : <Square size={14} />
                            }
                          </button>
                        </td>

                        {/* ── Date ── */}
                        <td className="w-28">
                          <span className="font-mono text-ink-400 text-xs">{txn.posted_date}</span>
                        </td>

                        {/* ── Merchant + "select all from merchant" ── */}
                        <td>
                          <div className="flex items-center gap-2 group/merchant">
                            <div>
                              <div className={clsx(
                                'font-medium text-sm leading-tight',
                                isExcluded ? 'line-through text-ink-500' : 'text-ink-100'
                              )}>
                                {txn.description_raw}
                              </div>
                              {txn.parse_confidence < 0.8 && (
                                <span className="badge badge-amber text-[10px] mt-0.5" title="Merchant name may be garbled from the PDF">low confidence</span>
                              )}
                              {needsReview && (
                                <span className="text-[10px] text-amber-400/70 mt-0.5">assign participants ↑</span>
                              )}
                            </div>
                            {/*
                              "Select all from merchant" helper:
                              Hover over any row → a tiny "select all" button appears.
                              Click it to add every visible transaction from the same
                              merchant to your selection (matching on first 3 words).
                            */}
                            <button
                              className="opacity-30 group-hover/merchant:opacity-100 text-[10px] text-ink-500 hover:text-lime-400 border border-ink-700 hover:border-lime-400/30 rounded px-1.5 py-0.5 transition-all whitespace-nowrap shrink-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                selectAllFromMerchant(txn.description_raw)
                              }}
                              title="Select all transactions from this merchant"
                            >
                              select all
                            </button>
                          </div>
                        </td>

                        {/* ── Category — click badge to edit in-place ── */}
                        <td onClick={(e) => e.stopPropagation()}>
                          {isEditCat ? (
                            <InlineCategoryEdit
                              txn={txn}
                              groupId={groupId}
                              onClose={() => setEditingCell(null)}
                            />
                          ) : (
                            <button
                              className="hover:opacity-70 transition-opacity"
                              onClick={() => setEditingCell({ txnId: txn.id, field: 'category' })}
                            >
                              <CategoryBadge category={txn.category} />
                            </button>
                          )}
                        </td>

                        {/* ── Participants — click badge to edit in-place ── */}
                        <td onClick={(e) => e.stopPropagation()}>
                          {isEditPart ? (
                            <InlineParticipantsEdit
                              txn={txn}
                              members={members}
                              groupId={groupId}
                              onClose={() => setEditingCell(null)}
                            />
                          ) : (
                            <button
                              className="hover:opacity-70 transition-opacity"
                              onClick={() => setEditingCell({ txnId: txn.id, field: 'participants' })}
                            >
                              {txn.is_personal
                                ? <span className="badge badge-muted">Personal</span>
                                : <ParticipantsBadge
                                    participants={txn.participants_json}
                                    members={members}
                                  />
                              }
                            </button>
                          )}
                        </td>

                        {/* ── Amount ── */}
                        {/*
                          If original_amount is set, it means the expense was charged
                          in a foreign currency. We show both:
                            ¥5,000 (≈$33.50)
                          The foreign amount first (what was actually charged), then
                          the converted base-currency amount in parentheses.
                        */}
                        <td className="text-right">
                          {txn.original_amount ? (
                            <div>
                              <span className="font-mono font-semibold text-ink-100">
                                {formatCurrency(txn.original_amount, txn.currency)}
                              </span>
                              <span className="block text-[10px] text-ink-500 font-mono">
                                ≈{formatCurrency(txn.amount, group?.base_currency || 'USD')}
                              </span>
                            </div>
                          ) : (
                            <span className="font-mono font-semibold text-ink-100">
                              {formatCurrency(txn.amount, group?.base_currency || 'USD')}
                            </span>
                          )}
                        </td>

                        {/* ── Paid by — info only, last editable column ── */}
                        <td className="w-24">
                          <span className="text-xs text-ink-500 font-medium">
                            {paidByMap[txn.statement_id] || '—'}
                          </span>
                        </td>

                        {/* ── Quick actions (visible on row hover) ── */}
                        <td className="w-20 text-right pr-1" onClick={(e) => e.stopPropagation()}>
                          {confirmDeleteId === txn.id ? (
                            // Delete confirmation — show Yes/No inline
                            <div className="flex items-center gap-1 justify-end">
                              <span className="text-[10px] text-red-400">Delete?</span>
                              <button
                                className="px-1.5 py-0.5 rounded text-[10px] bg-red-500 text-white hover:bg-red-400 transition-colors"
                                onClick={() => deleteTxn.mutate(txn.id)}
                                disabled={deleteTxn.isPending}
                              >
                                Yes
                              </button>
                              <button
                                className="px-1.5 py-0.5 rounded text-[10px] bg-ink-700 text-ink-300 hover:bg-ink-600 transition-colors"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                No
                              </button>
                            </div>
                          ) : (
                            <div className="transition-opacity flex items-center gap-0.5 justify-end sm:opacity-0 sm:group-hover:opacity-100">
                              {isExcluded ? (
                                // Already excluded — show "include" to rescue it
                                <button
                                  className="p-1 rounded text-ink-500 hover:text-green-400 hover:bg-green-400/10 transition-colors"
                                  title="Include in settlement"
                                  onClick={() => bulkUpdate.mutate({ transaction_ids: [txn.id], status: 'unreviewed' })}
                                >
                                  <Check size={13} />
                                </button>
                              ) : (
                                // Active transaction — show exclude icon
                                <button
                                  className="p-1 rounded text-ink-500 hover:text-amber-400 hover:bg-amber-400/10 transition-colors"
                                  title="Exclude from settlement"
                                  onClick={() => bulkUpdate.mutate({ transaction_ids: [txn.id], status: 'excluded' })}
                                >
                                  <X size={13} />
                                </button>
                              )}
                              {/* Edit button — opens the edit modal to fix any field */}
                              <button
                                className="p-1 rounded text-ink-500 hover:text-lime-400 hover:bg-lime-400/10 transition-colors"
                                title="Edit this transaction"
                                onClick={() => setEditTxnId(txn.id)}
                              >
                                <Pencil size={12} />
                              </button>
                              {/* Delete button — permanently removes the transaction */}
                              <button
                                className="p-1 rounded text-ink-500 hover:text-red-400 hover:bg-red-400/10 transition-colors"
                                title="Delete this transaction"
                                onClick={() => setConfirmDeleteId(txn.id)}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Edit Transaction modal — opens when user clicks the pencil icon on a row */}
      {editTxnId && (() => {
        // Find the full transaction object from our flat list of all transactions
        const txnToEdit = transactions.find(t => t.id === editTxnId)
        if (!txnToEdit) return null
        return (
          <EditTransactionModal
            transaction={txnToEdit}
            members={members}
            baseCurrency={group?.base_currency || 'USD'}
            onClose={() => setEditTxnId(null)}
          />
        )
      })()}

      {/* Add Expense modal — rendered as a portal-style overlay on top of everything */}
      {showAddExpense && members.length > 0 && (
        <AddExpenseModal
          groupId={groupId}
          members={members}
          group={group}   // needed so the modal knows the group's base currency
          onClose={() => setShowAddExpense(false)}
        />
      )}

      {/* ── Sticky bulk action bar ─────────────────────────────────────────────
          Floats at the bottom of the viewport when rows are selected.
          Fixed positioning avoids the page-jump that happened when the bar
          appeared inline and pushed content down. z-40 sits below modals (z-50). */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex justify-center pointer-events-none">
          <div className="pointer-events-auto mb-4 mx-4 w-full max-w-3xl flex items-center gap-2 px-4 py-2.5
                          bg-ink-800/95 backdrop-blur-sm border border-lime-400/25 rounded-2xl shadow-2xl
                          shadow-black/40 flex-wrap animate-slide-up">
            <span className="text-xs font-mono text-lime-400 font-semibold">
              {selectedIds.size} selected
            </span>
            <span className="text-ink-700 mx-0.5">·</span>

            {/* Set Category dropdown */}
            <select
              className="select text-xs py-1 px-2 h-7 w-auto"
              value=""
              onChange={(e) => {
                if (!e.target.value) return
                bulkUpdate.mutate({ transaction_ids: [...selectedIds], category: e.target.value })
              }}
            >
              <option value="" disabled>Set Category</option>
              {CATEGORIES.map(c => (
                <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
              ))}
            </select>

            {/* Set Participants button + popover — popover opens upward from the bottom bar */}
            <div className="relative">
              <button
                className="btn-ghost text-xs py-1 px-2.5 h-7 flex items-center gap-1.5"
                onClick={() => setShowParticipantsPopover(p => !p)}
              >
                <Users size={11} />
                Set Participants
                <ChevronDown size={9} />
              </button>
              {showParticipantsPopover && (
                <div className="absolute bottom-full mb-2 left-0">
                  <ParticipantsPopover
                    members={members}
                    onApply={(participants) => {
                      bulkUpdate.mutate({
                        transaction_ids: [...selectedIds],
                        participants_json: participants,
                      })
                      setShowParticipantsPopover(false)
                    }}
                    onClose={() => setShowParticipantsPopover(false)}
                  />
                </div>
              )}
            </div>

            {/* Status action buttons */}
            <button
              className="btn-ghost text-xs py-1 px-2.5 h-7 flex items-center gap-1.5 text-green-400 hover:bg-green-400/10"
              onClick={() => bulkUpdate.mutate({ transaction_ids: [...selectedIds], status: 'confirmed' })}
              title="Mark as reviewed & confirmed"
            >
              <Check size={11} /> Confirm
            </button>
            <button
              className="btn-ghost text-xs py-1 px-2.5 h-7 flex items-center gap-1.5 text-red-400 hover:bg-red-400/10"
              onClick={() => bulkUpdate.mutate({ transaction_ids: [...selectedIds], status: 'excluded' })}
              title="Exclude from settlement"
            >
              <X size={11} /> Exclude
            </button>
            <button
              className="btn-ghost text-xs py-1 px-2.5 h-7 text-ink-400"
              onClick={() => bulkUpdate.mutate({ transaction_ids: [...selectedIds], status: 'unreviewed' })}
              title="Undo exclude — mark as unreviewed"
            >
              Include
            </button>

            {/* Clear selection */}
            <button
              className="btn-ghost text-xs py-1 px-2 h-7 text-ink-600 hover:text-ink-400 ml-auto"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
