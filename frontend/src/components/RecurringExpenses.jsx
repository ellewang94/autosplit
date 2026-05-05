import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  Repeat, Plus, Trash2, Pause, Play, Calendar, X, Loader, CheckCircle, AlertTriangle,
} from 'lucide-react'
import clsx from 'clsx'

/**
 * RecurringExpenses — manages monthly templates (rent / utilities / subscriptions).
 *
 * Built for the household / couples use case where you have the same
 * recurring expense every month and would otherwise re-enter it manually.
 *
 * Mounted inside the TripOverview for household groups (and visible — but
 * less prominent — on trips too, e.g. for a long road trip with weekly
 * Airbnb charges).
 *
 * Lazy generation: backend creates missing past instances whenever the
 * transactions list is fetched, so this component doesn't need to trigger
 * anything explicit. We just CRUD the templates.
 */
export default function RecurringExpenses({ groupId, members, baseCurrency = 'USD' }) {
  const qc = useQueryClient()
  const [showForm, setShowForm] = useState(false)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['recurring', String(groupId)],
    queryFn: () => api.listRecurring(groupId),
  })

  const realMembers = members.filter((m) => !m.is_placeholder)

  const toggleMut = useMutation({
    mutationFn: (id) => api.toggleRecurring(id),
    onSuccess: () => {
      qc.invalidateQueries(['recurring', String(groupId)])
      qc.invalidateQueries(['group-transactions', groupId])
    },
  })
  const deleteMut = useMutation({
    mutationFn: (id) => api.deleteRecurring(id),
    onSuccess: () => qc.invalidateQueries(['recurring', String(groupId)]),
  })

  return (
    <section className="mb-6 animate-slide-up">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-display text-base font-semibold text-ink-100 flex items-center gap-2">
          <Repeat size={14} className="text-lime-400" />
          Recurring expenses
        </h2>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-1 text-xs font-semibold text-lime-400 hover:text-lime-300 transition-colors"
          disabled={realMembers.length === 0}
          title={realMembers.length === 0 ? 'Add at least one member first' : 'Set up a monthly template'}
        >
          <Plus size={12} />
          Add recurring
        </button>
      </div>

      {isLoading ? (
        <div className="text-xs text-ink-500">Loading…</div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-700 px-4 py-5 text-center">
          <Repeat size={20} className="text-ink-600 mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-xs text-ink-400 leading-relaxed mb-2">
            Set up rent, utilities, or subscriptions once.<br />
            They'll auto-generate every month.
          </p>
          <button
            onClick={() => setShowForm(true)}
            className="text-xs font-semibold text-lime-400 hover:text-lime-300 transition-colors"
            disabled={realMembers.length === 0}
          >
            <Plus size={11} className="inline" /> Add your first
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((it) => (
            <RecurringRow
              key={it.id}
              item={it}
              members={realMembers}
              currency={baseCurrency}
              onToggle={() => toggleMut.mutate(it.id)}
              onDelete={() => {
                if (window.confirm(`Stop generating "${it.name}"? Past transactions are kept.`)) {
                  deleteMut.mutate(it.id)
                }
              }}
            />
          ))}
        </div>
      )}

      {showForm && (
        <RecurringFormSheet
          groupId={groupId}
          members={realMembers}
          baseCurrency={baseCurrency}
          onClose={() => setShowForm(false)}
        />
      )}
    </section>
  )
}

// ── One row in the list ──────────────────────────────────────────────────────
function RecurringRow({ item, members, currency, onToggle, onDelete }) {
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' '
  const payer = members.find((m) => m.id === item.paid_by_member_id)?.name || 'Someone'
  const fmt = (n) => `${sym}${n.toLocaleString('en-US', {
    minimumFractionDigits: currency === 'JPY' ? 0 : 2,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
  })}`
  const dayLabel = ordinal(item.day_of_month)

  return (
    <div className={clsx(
      'flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-ink-900',
      item.active ? 'border-ink-700' : 'border-ink-800 opacity-60',
    )}>
      <div className={clsx(
        'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
        item.active ? 'bg-lime-400/10' : 'bg-ink-800',
      )}>
        <Repeat size={13} className={item.active ? 'text-lime-400' : 'text-ink-500'} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-100 truncate">{item.name}</span>
          {!item.active && <span className="text-[10px] text-ink-500 font-mono">PAUSED</span>}
        </div>
        <div className="text-xs text-ink-500 mt-0.5">
          <span className="font-mono">{fmt(item.amount)}</span>
          <span className="mx-1.5 text-ink-700">·</span>
          <span>monthly on the {dayLabel}</span>
          <span className="mx-1.5 text-ink-700">·</span>
          <span>{payer} pays</span>
        </div>
      </div>
      <button
        onClick={onToggle}
        className="p-1.5 text-ink-500 hover:text-lime-400 transition-colors"
        title={item.active ? 'Pause future generation' : 'Resume generation'}
      >
        {item.active ? <Pause size={13} /> : <Play size={13} />}
      </button>
      <button
        onClick={onDelete}
        className="p-1.5 text-ink-600 hover:text-red-400 transition-colors"
        title="Delete (past transactions are kept)"
      >
        <Trash2 size={13} />
      </button>
    </div>
  )
}

// ── Add-recurring sheet ──────────────────────────────────────────────────────
function RecurringFormSheet({ groupId, members, baseCurrency, onClose }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [paidBy, setPaidBy] = useState(members[0]?.id || '')
  const [day, setDay] = useState(1)
  // Default split: everyone equal. We store as the same shape Transaction uses.
  const [participantIds, setParticipantIds] = useState(members.map((m) => m.id))
  // Default start_date: today, formatted as ISO yyyy-mm-dd
  const today = new Date().toISOString().split('T')[0]
  const [startDate, setStartDate] = useState(today)
  const [error, setError] = useState('')

  const create = useMutation({
    mutationFn: () => api.createRecurring(groupId, {
      name: name.trim(),
      amount: parseFloat(amount),
      currency: baseCurrency,
      paid_by_member_id: parseInt(paidBy),
      participants_json: participantIds.length === members.length
        ? null   // null = everyone, cleaner to store
        : { type: 'custom', member_ids: participantIds },
      split_method_json: { type: 'equal' },
      day_of_month: day,
      start_date: startDate,
      active: true,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['recurring', String(groupId)])
      qc.invalidateQueries(['group-transactions', groupId])
      onClose()
    },
    onError: (err) => setError(err?.message || 'Could not save'),
  })

  function toggleParticipant(id) {
    setParticipantIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  const sym = CURRENCY_SYMBOLS[baseCurrency] || baseCurrency + ' '
  const canSubmit = name.trim() && parseFloat(amount) > 0 && paidBy && participantIds.length > 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-ink-900 border-t md:border border-ink-700
                   rounded-t-3xl md:rounded-2xl shadow-2xl
                   w-full max-w-md md:mx-4 animate-slide-up
                   max-h-[92dvh] md:max-h-[90vh] flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="md:hidden mx-auto mt-2 mb-1 w-10 h-1 rounded-full bg-ink-600 flex-shrink-0" />

        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 flex-shrink-0">
          <h2 className="font-display text-lg font-semibold text-ink-50 flex items-center gap-2">
            <Repeat size={15} className="text-lime-400" />
            Set up recurring expense
          </h2>
          <button onClick={onClose} className="p-1 -mr-1 text-ink-500 hover:text-ink-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <div>
            <label className="block text-xs text-ink-400 mb-1.5">Name</label>
            <input
              type="text"
              className="input w-full text-sm"
              placeholder="Rent, Netflix, Internet…"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs text-ink-400 mb-1.5">Amount ({sym})</label>
              <input
                type="number"
                step="0.01"
                min="0"
                className="input w-full text-sm"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="w-32">
              <label className="block text-xs text-ink-400 mb-1.5">Day of month</label>
              <select
                className="select w-full text-sm"
                value={day}
                onChange={(e) => setDay(parseInt(e.target.value))}
              >
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <option key={d} value={d}>{ordinal(d)}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-400 mb-1.5">Starts</label>
            <input
              type="date"
              className="input w-full text-sm [color-scheme:dark]"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <p className="text-[11px] text-ink-500 mt-1">
              We'll generate transactions starting from this date and catch up retroactively.
            </p>
          </div>

          <div>
            <label className="block text-xs text-ink-400 mb-1.5">Paid by</label>
            <select
              className="select w-full text-sm"
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-ink-400">Split between</label>
              <button
                type="button"
                onClick={() => setParticipantIds(members.map((m) => m.id))}
                className="text-[11px] text-ink-500 hover:text-lime-400"
              >
                Everyone
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => {
                const active = participantIds.includes(m.id)
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleParticipant(m.id)}
                    className={clsx(
                      'text-xs font-medium px-2.5 py-1 rounded-full border transition-all',
                      active
                        ? 'border-lime-400/40 bg-lime-400/10 text-lime-400'
                        : 'border-ink-700 text-ink-500 hover:border-ink-500',
                    )}
                  >
                    {active ? <CheckCircle size={10} className="inline -mt-0.5 mr-0.5" /> : null}
                    {m.name}
                  </button>
                )
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="flex gap-2 px-6 py-3 border-t border-ink-800 flex-shrink-0">
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => { setError(''); create.mutate() }}
            disabled={!canSubmit || create.isPending}
          >
            {create.isPending ? <Loader size={13} className="animate-spin" /> : <><Plus size={13} /> Save recurring</>}
          </button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

const CURRENCY_SYMBOLS = {
  USD: '$', AUD: 'A$', NZD: 'NZ$', JPY: '¥', GBP: '£', EUR: '€',
  CAD: 'C$', SGD: 'S$', HKD: 'HK$', THB: '฿', MXN: 'Mex$',
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
