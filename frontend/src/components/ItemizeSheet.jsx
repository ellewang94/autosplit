import { useState, useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { X, Plus, Trash2, AlertTriangle, CheckCircle, Loader, Users } from 'lucide-react'
import clsx from 'clsx'

/**
 * ItemizeSheet — break one transaction into per-item splits.
 *
 * The use case (Elle's words): "we go to Whole Foods, $80 total, but $20 is
 * my wine, $30 is his protein, $30 is shared groceries". One transaction →
 * three line items, each with their own participants.
 *
 * Same shape works for:
 *   - statement-imported transactions (the row's Itemize button opens this)
 *   - manual entries (Add Expense modal flips into itemize mode)
 *   - receipt OCR results (Claude returns items[] → we open this pre-filled)
 *
 * Props:
 *   transaction  the txn we're itemizing — id + amount + currency are all we need
 *   members      all real members of the trip (placeholders excluded by caller)
 *   currency     base currency code for the trip
 *   initialItems optional — pre-fill from OCR or an existing items_json
 *   onClose      dismiss callback
 *   onSaved      called with the updated txn after a successful save
 *
 * The math: sum of items must equal the transaction amount within 1 cent.
 * We show the running total live so the user can fix mistakes before saving.
 */
export default function ItemizeSheet({ transaction, members, currency = 'USD', initialItems, onClose, onSaved }) {
  const qc = useQueryClient()

  // Each item: { name, amount, member_ids }. We start either from existing
  // items (editing), OCR-provided items, or one blank row.
  const seed = useMemo(() => {
    if (initialItems && initialItems.length) {
      return initialItems.map((i) => ({
        name: i.name || '',
        amount: i.amount != null ? String(i.amount) : '',
        member_ids: i.member_ids || members.map((m) => m.id),
      }))
    }
    if (transaction?.items_json && transaction.items_json.length) {
      return transaction.items_json.map((i) => ({
        name: i.name || '',
        amount: i.amount != null ? String(i.amount) : '',
        member_ids: i.member_ids || members.map((m) => m.id),
      }))
    }
    return [{ name: '', amount: '', member_ids: members.map((m) => m.id) }]
  }, [initialItems, transaction?.items_json])

  const [items, setItems] = useState(seed)
  const [error, setError] = useState('')

  // ── Math ────────────────────────────────────────────────────────────────
  const totalAmount = transaction?.amount || 0
  const itemsTotal = items.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0)
  const remaining = +(totalAmount - itemsTotal).toFixed(2)
  const matches = Math.abs(remaining) <= 0.01
  const overdrawn = remaining < -0.01
  const sym = CURRENCY_SYMBOLS[currency] || currency + ' '
  const fmt = (n) => `${sym}${Math.abs(n).toFixed(currency === 'JPY' ? 0 : 2)}`

  // ── Mutations ───────────────────────────────────────────────────────────
  const save = useMutation({
    mutationFn: () => api.setTransactionItems(
      transaction.id,
      items.map((it) => ({
        name: it.name.trim(),
        amount: parseFloat(it.amount),
        member_ids: it.member_ids,
      })),
    ),
    onSuccess: (data) => {
      qc.invalidateQueries(['group-transactions'])
      qc.invalidateQueries(['my-balance'])
      onSaved?.(data)
      onClose()
    },
    onError: (err) => setError(err?.message || 'Save failed'),
  })

  const clearItemization = useMutation({
    mutationFn: () => api.setTransactionItems(transaction.id, []),
    onSuccess: () => {
      qc.invalidateQueries(['group-transactions'])
      qc.invalidateQueries(['my-balance'])
      onClose()
    },
  })

  // Every row must be valid: name + amount + at least one participant
  const allRowsValid = items.every(
    (it) => it.name.trim() && parseFloat(it.amount) > 0 && it.member_ids.length > 0
  )
  const canSave = matches && allRowsValid && !save.isPending

  // ── Row helpers ─────────────────────────────────────────────────────────
  function updateItem(idx, patch) {
    setItems((cur) => cur.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }
  function toggleParticipant(idx, mid) {
    setItems((cur) => cur.map((it, i) => {
      if (i !== idx) return it
      const has = it.member_ids.includes(mid)
      return {
        ...it,
        member_ids: has ? it.member_ids.filter((x) => x !== mid) : [...it.member_ids, mid],
      }
    }))
  }
  function addRow() {
    setItems((cur) => [
      ...cur,
      // New item suggests the leftover amount so the user just hits Add.
      { name: '', amount: remaining > 0 ? String(remaining) : '', member_ids: members.map((m) => m.id) },
    ])
  }
  function removeRow(idx) {
    setItems((cur) => cur.length === 1 ? cur : cur.filter((_, i) => i !== idx))
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="bg-ink-900 border-t md:border border-ink-700
                   rounded-t-3xl md:rounded-2xl shadow-2xl
                   w-full max-w-lg md:mx-4 animate-slide-up
                   max-h-[92dvh] md:max-h-[90vh] flex flex-col"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Mobile grab handle */}
        <div className="md:hidden mx-auto mt-2 mb-1 w-10 h-1 rounded-full bg-ink-600 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-ink-800 flex-shrink-0 gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-lg font-semibold text-ink-50 leading-tight">Split into items</h2>
            <p className="text-xs text-ink-500 mt-0.5 truncate">
              {transaction?.description_raw || 'Transaction'} · {fmt(totalAmount)}
            </p>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 text-ink-500 hover:text-ink-200 transition-colors flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          <p className="text-xs text-ink-400 leading-relaxed">
            Break this charge into items and pick who's on each one. Common when shared receipts
            mix personal stuff with shared stuff.
          </p>

          {items.map((item, idx) => (
            <div key={idx} className="rounded-xl border border-ink-700 bg-ink-800/40 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  className="input flex-1 text-sm"
                  placeholder={idx === 0 ? 'e.g. Wine' : 'Item name'}
                  value={item.name}
                  onChange={(e) => updateItem(idx, { name: e.target.value })}
                />
                <div className="flex items-center gap-1">
                  <span className="text-ink-500 text-sm">{sym}</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    className="input w-24 text-sm text-right"
                    placeholder="0.00"
                    value={item.amount}
                    onChange={(e) => updateItem(idx, { amount: e.target.value })}
                  />
                </div>
                {items.length > 1 && (
                  <button
                    onClick={() => removeRow(idx)}
                    className="p-1.5 text-ink-600 hover:text-red-400 transition-colors flex-shrink-0"
                    title="Remove item"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Participant chips — tap to toggle */}
              <div className="flex flex-wrap gap-1.5">
                <span className="text-[10px] text-ink-500 uppercase tracking-widest pt-1.5">For:</span>
                {members.map((m, mi) => {
                  const active = item.member_ids.includes(m.id)
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggleParticipant(idx, m.id)}
                      className={clsx(
                        'text-xs font-medium px-2.5 py-1 rounded-full border transition-all',
                        active
                          ? 'border-lime-400/40 bg-lime-400/10 text-lime-400'
                          : 'border-ink-700 text-ink-500 hover:border-ink-500 hover:text-ink-300',
                      )}
                    >
                      {m.name}
                      {active && item.member_ids.length > 1 && (
                        <span className="ml-1 text-ink-500">
                          (½ {item.member_ids.length === 2 ? '' : `of ${item.member_ids.length}`})
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          <button
            onClick={addRow}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg
                       border border-dashed border-ink-700 text-ink-400 text-sm
                       hover:border-lime-400/40 hover:text-lime-400 transition-all"
          >
            <Plus size={13} />
            Add another item
          </button>

          {/* Running total + match status */}
          <div className={clsx(
            'rounded-lg px-3 py-2 flex items-center gap-2 text-xs',
            matches ? 'bg-lime-400/8 border border-lime-400/25 text-lime-400'
              : overdrawn ? 'bg-red-500/8 border border-red-500/30 text-red-400'
              : 'bg-amber-400/5 border border-amber-400/25 text-amber-400'
          )}>
            {matches ? <CheckCircle size={12} /> : <AlertTriangle size={12} />}
            <span className="font-mono">
              Items {fmt(itemsTotal)} {matches ? '=' : 'vs'} {fmt(totalAmount)}
              {!matches && (
                <> · <strong>{remaining > 0 ? `${fmt(remaining)} unaccounted` : `${fmt(-remaining)} over`}</strong></>
              )}
            </span>
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-3 border-t border-ink-800 flex-shrink-0">
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => { setError(''); save.mutate() }}
            disabled={!canSave}
          >
            {save.isPending ? <Loader size={13} className="animate-spin" /> : 'Save items'}
          </button>
          {/* Show 'Clear items' only when there are saved items already (editing mode) */}
          {transaction?.items_json && transaction.items_json.length > 0 && (
            <button
              className="btn-ghost"
              onClick={() => clearItemization.mutate()}
              disabled={clearItemization.isPending}
              title="Revert to a single shared amount"
            >
              Clear
            </button>
          )}
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
