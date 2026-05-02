import { useState, useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { buildPaymentOptions } from '../lib/paymentLinks'
import { Wallet, Copy, CheckCircle, X, Edit3, ExternalLink, Info } from 'lucide-react'
import clsx from 'clsx'

/**
 * Renders a row of one-tap "Pay $X via Venmo / Cash App / PayPal" buttons
 * plus a Zelle copy-helper, based on the payee's saved handles.
 *
 * Props:
 *   payee      Member object — needs .payment_handles
 *   amount     USD value to pre-fill into the deep link
 *   memo       Pre-filled note shown in Venmo (others ignore the memo field)
 *
 * If the payee has no handles set, we render a quiet hint pointing the
 * trip owner / payee to the editor so the next settlement is one tap.
 */
export function PayButtons({ payee, amount, memo }) {
  const options = buildPaymentOptions({
    handles: payee?.payment_handles,
    amount,
    memo,
  })

  if (options.length === 0) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-ink-500">
        <Info size={11} />
        <span>{payee?.name} hasn't added a payment handle yet</span>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((opt) => (
        opt.app === 'zelle'
          ? <ZelleHelper key={opt.app} option={opt} payee={payee} />
          : <PayLinkButton key={opt.app} option={opt} />
      ))}
    </div>
  )
}

// ── Single deep-link button (Venmo / Cash App / PayPal) ─────────────────────
// Each app gets its own brand colour so the button is unmistakable on a
// crowded settlement page.
const APP_STYLES = {
  venmo:   { bg: 'bg-[#3D95CE]/10 border-[#3D95CE]/40 text-[#5fb3e7] hover:bg-[#3D95CE]/20' },
  cashapp: { bg: 'bg-[#00C244]/10 border-[#00C244]/40 text-[#3ee47a] hover:bg-[#00C244]/20' },
  paypal:  { bg: 'bg-[#0079C1]/10 border-[#0079C1]/40 text-[#4ea2da] hover:bg-[#0079C1]/20' },
}

function PayLinkButton({ option }) {
  const style = APP_STYLES[option.app] || { bg: 'bg-ink-800 border-ink-700 text-ink-300 hover:bg-ink-700' }
  return (
    <a
      href={option.url}
      // Open in a new tab on desktop. On mobile the OS handles app routing.
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all',
        style.bg
      )}
      title={`Pay via ${option.label}`}
    >
      <ExternalLink size={11} strokeWidth={2.5} />
      {option.label}
    </a>
  )
}

// ── Zelle-specific helper (no deep link exists) ─────────────────────────────
// Tapping copies the recipient's email/phone to the clipboard and tells the
// user to open their bank app. Realistically: this is the best we can do
// until Zelle releases an actual API.
function ZelleHelper({ option, payee }) {
  const [copied, setCopied] = useState(false)

  function copyAndAdvise() {
    navigator.clipboard?.writeText(option.copyValue)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  return (
    <button
      onClick={copyAndAdvise}
      className={clsx(
        'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all',
        copied
          ? 'bg-green-400/15 border-green-400/40 text-green-400'
          : 'bg-purple-500/10 border-purple-500/40 text-purple-300 hover:bg-purple-500/20'
      )}
      title={`Copy ${payee?.name}'s Zelle handle, then open your bank app`}
    >
      {copied ? <CheckCircle size={11} strokeWidth={2.5} /> : <Copy size={11} strokeWidth={2.5} />}
      {copied ? 'Zelle copied — open your bank app' : 'Zelle'}
    </button>
  )
}

// ── Editor — full sheet/modal for managing your handles ─────────────────────
// Mounted on the Settlement page. Authorisation is enforced server-side:
// the user can only edit a member's handles if they own the trip OR they've
// claimed that member slot via an invite link.
export function PaymentHandlesEditor({ member, onClose }) {
  const qc = useQueryClient()
  const initial = member?.payment_handles || {}
  const [venmo, setVenmo] = useState(initial.venmo || '')
  const [cashapp, setCashapp] = useState(initial.cashapp || '')
  const [paypal, setPaypal] = useState(initial.paypal || '')
  const [zelle, setZelle] = useState(initial.zelle || '')
  const [error, setError] = useState('')

  // Reset local state when switching members
  useEffect(() => {
    const h = member?.payment_handles || {}
    setVenmo(h.venmo || '')
    setCashapp(h.cashapp || '')
    setPaypal(h.paypal || '')
    setZelle(h.zelle || '')
  }, [member?.id])

  const save = useMutation({
    mutationFn: () => api.updatePaymentHandles(member.id, {
      venmo: venmo || null,
      cashapp: cashapp || null,
      paypal: paypal || null,
      zelle: zelle || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries(['group', String(member.group_id)])
      qc.invalidateQueries(['groups'])
      onClose()
    },
    onError: (err) => setError(err?.message || 'Could not save'),
  })

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

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Wallet size={16} className="text-lime-400" />
            <h2 className="font-display text-lg font-semibold text-ink-50">
              {member?.name}'s payment handles
            </h2>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 text-ink-500 hover:text-ink-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 overflow-y-auto">
          <p className="text-xs text-ink-400 leading-relaxed">
            Add the handles where {member?.name} likes to be paid. We'll show one-tap pay
            buttons on every settlement so paying back takes seconds, not minutes of typing.
            We never see or store the actual payment.
          </p>

          <Field
            label="Venmo username"
            prefix="@"
            placeholder="anthony-w"
            helper="Find it on your Venmo profile (e.g. @anthony-w)"
            value={venmo}
            onChange={setVenmo}
          />
          <Field
            label="Cash App $cashtag"
            prefix="$"
            placeholder="anthonyw"
            helper="Your Cash App $cashtag without the $ sign"
            value={cashapp}
            onChange={setCashapp}
          />
          <Field
            label="PayPal handle or email"
            placeholder="anthony@example.com"
            helper="paypal.me/<handle> or the email on your PayPal account"
            value={paypal}
            onChange={setPaypal}
          />
          <Field
            label="Zelle email or phone"
            placeholder="anthony@example.com or 555-123-4567"
            helper="Zelle has no link API — we'll copy this so you can open your bank app"
            value={zelle}
            onChange={setZelle}
          />

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2 px-6 py-4 border-t border-ink-800 flex-shrink-0">
          <button
            className="btn-primary flex-1 justify-center"
            onClick={() => { setError(''); save.mutate() }}
            disabled={save.isPending}
          >
            {save.isPending ? 'Saving…' : 'Save handles'}
          </button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, prefix, placeholder, helper, value, onChange }) {
  return (
    <div>
      <label className="block text-xs text-ink-300 font-medium mb-1.5">{label}</label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 font-mono text-sm pointer-events-none">
            {prefix}
          </span>
        )}
        <input
          type="text"
          autoComplete="off"
          spellCheck={false}
          className={clsx('input', prefix ? 'pl-7' : '')}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      {helper && <p className="text-[11px] text-ink-500 mt-1 leading-relaxed">{helper}</p>}
    </div>
  )
}

// ── Tiny "edit handles" pill — drop into a member chip ──────────────────────
export function EditHandlesButton({ member, onClick }) {
  const hasAny = member?.payment_handles && Object.values(member.payment_handles).some(Boolean)
  return (
    <button
      onClick={onClick}
      className={clsx(
        'flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border transition-all',
        hasAny
          ? 'border-lime-400/30 text-lime-400 hover:bg-lime-400/10'
          : 'border-ink-600 text-ink-400 hover:border-ink-400 hover:text-ink-200'
      )}
      title={hasAny ? `Edit ${member.name}'s payment handles` : `Add ${member.name}'s payment handles`}
    >
      {hasAny ? <Edit3 size={10} /> : <Wallet size={10} />}
      {hasAny ? 'Edit pay' : 'Add pay'}
    </button>
  )
}
