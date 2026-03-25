import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  TrendingUp, ArrowRight, Download, Copy, CheckCircle,
  Users, DollarSign, AlertTriangle, ChevronDown, Loader,
  CreditCard, Check, ExternalLink,
} from 'lucide-react'
import clsx from 'clsx'

/**
 * Format an ISO date string ("2026-01-05") into "Jan 5, 2026".
 * Returns null if the value is falsy.
 */
function fmtDate(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Format a statement period into something readable.
 * e.g. "Jan 5 – Apr 14, 2026"  or  "Imported Apr 14, 2026"  or  "Unknown period"
 */
function fmtPeriod(stmt) {
  if (stmt.period_start && stmt.period_end) {
    const start = fmtDate(stmt.period_start)
    const end = fmtDate(stmt.period_end)
    return `${start} – ${end}`
  }
  if (stmt.statement_date) {
    return `Statement date: ${fmtDate(stmt.statement_date)}`
  }
  return 'No date info'
}

// Currency symbol map — same as TransactionsPage
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

// ── Copy to clipboard with visual feedback ──────────────────────────────────
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={copy}
      className={clsx(
        'btn-ghost py-1 px-2 text-xs transition-colors',
        copied && 'text-lime-400'
      )}
    >
      {copied ? <CheckCircle size={12} /> : <Copy size={12} />}
      {copied ? 'Copied!' : 'Copy'}
    </button>
  )
}

// ── Balance card for one member ──────────────────────────────────────────────
function BalanceCard({ balance, index, currency = 'USD' }) {
  const isOwed = balance.balance >= 0
  const isZero = Math.abs(balance.balance) < 0.01
  const initials = balance.member_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  const colors = [
    'bg-lime-400 text-ink-950',
    'bg-green-400 text-ink-950',
    'bg-amber-400 text-ink-950',
    'bg-red-400 text-white',
    'bg-blue-400 text-white',
  ]

  return (
    <div className="card-sm flex items-center gap-4 animate-slide-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm flex-shrink-0 ${colors[index % colors.length]}`}>
        {initials}
      </div>
      <div className="flex-1">
        <div className="font-medium text-ink-100">{balance.member_name}</div>
        <div className={clsx(
          'text-xs font-mono mt-0.5',
          isZero ? 'text-ink-400' : isOwed ? 'text-green-400' : 'text-red-400'
        )}>
          {isZero
            ? 'Settled up'
            : isOwed
              ? `Is owed ${formatAmount(balance.balance, currency)}`
              : `Owes ${formatAmount(balance.balance, currency)}`}
        </div>
      </div>
      <div className={clsx(
        'font-mono text-xl font-bold',
        isZero ? 'text-ink-400' : isOwed ? 'text-green-400' : 'text-red-400'
      )}>
        {isZero ? '—' : `${isOwed ? '+' : '–'}${formatAmount(balance.balance, currency)}`}
      </div>
    </div>
  )
}

// ── Transfer card ─────────────────────────────────────────────────────────────
function TransferCard({ transfer, index, currency = 'USD' }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="card-sm animate-slide-up" style={{ animationDelay: `${index * 80}ms` }}>
      <div className="flex items-center gap-3">
        <div className="flex-1 flex items-center gap-2">
          <span className="font-medium text-ink-100">{transfer.from_member_name}</span>
          <ArrowRight size={14} className="text-ink-500 flex-shrink-0" />
          <span className="font-medium text-ink-100">{transfer.to_member_name}</span>
        </div>
        <div className="font-mono text-xl font-bold text-lime-400">
          {formatAmount(transfer.amount, currency)}
        </div>
        <button
          className="btn-ghost py-1 px-2"
          onClick={() => setExpanded(!expanded)}
          title="Payment request message"
        >
          <ChevronDown size={14} className={clsx('transition-transform', expanded && 'rotate-180')} />
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-ink-700 animate-slide-up">
          <div className="text-xs text-ink-400 mb-2 font-medium">Copyable payment request:</div>
          <div className="bg-ink-900 rounded-lg p-3 text-sm text-ink-200 leading-relaxed font-mono text-xs border border-ink-700">
            {transfer.payment_request}
          </div>
          <div className="flex gap-2 mt-2">
            <CopyButton text={transfer.payment_request} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Card holders summary ──────────────────────────────────────────────────────
// Shows who holds which card, with a warning for statements missing a card holder.
// This is the key UI for multi-card trips — replaces the confusing single dropdown.

function CardHoldersSummary({ statements, members, groupId }) {
  const navigate = useNavigate()

  // Build a name lookup: member_id → name
  const memberNames = Object.fromEntries(members.map(m => [m.id, m.name]))

  return (
    <div className="space-y-2">
      {statements.map(stmt => {
        const holderName = stmt.card_holder_member_id
          ? memberNames[stmt.card_holder_member_id]
          : null

        // Format the statement period nicely: "Mar 15 – Apr 14"
        const period = fmtPeriod(stmt)

        return (
          <div
            key={stmt.id}
            className={clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg border',
              holderName
                ? 'bg-ink-800/40 border-ink-700'
                : 'bg-amber-400/5 border-amber-400/25'
            )}
          >
            {/* Status icon */}
            {holderName
              ? <Check size={14} className="text-lime-400 flex-shrink-0" />
              : <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" />
            }

            {/* Card info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className={clsx(
                  'text-sm font-medium',
                  holderName ? 'text-ink-100' : 'text-amber-400'
                )}>
                  {holderName || 'No card holder set'}
                </span>
                <span className="text-xs text-ink-500">·</span>
                <span className="text-xs text-ink-500 font-mono truncate">{period}</span>
              </div>
              <div className="text-xs text-ink-600 mt-0.5">
                {stmt.transaction_count} transaction{stmt.transaction_count !== 1 ? 's' : ''}
              </div>
            </div>

            {/* Fix link for unassigned statements */}
            {!holderName && (
              <button
                className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1 flex-shrink-0 transition-colors"
                onClick={() => navigate(`/groups/${groupId}/upload`)}
              >
                Fix in Upload
                <ExternalLink size={10} />
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettlementPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()

  // fallbackPayerId: only used when some statements have no card holder.
  // If all statements are assigned, the backend ignores this value —
  // each transaction is credited to its statement's card holder directly.
  const [fallbackPayerId, setFallbackPayerId] = useState('')

  // Optional: filter settlement to just one statement
  const [statementId, setStatementId] = useState('')

  const [settlement, setSettlement] = useState(null)
  const [error, setError] = useState(null)

  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
  })

  const { data: allStatements = [] } = useQuery({
    queryKey: ['statements', groupId],
    queryFn: () => api.getStatements(groupId),
  })

  const members = group?.members || []
  const currency = group?.base_currency || 'USD'

  // ── Classify statements ────────────────────────────────────────────────────
  // The backend now sets is_manual=true for virtual "Manual Expenses" containers.
  // These are not real uploaded files — they're auto-created to hold manual entries.
  // We hide them from the settlement UI because they always have a card_holder set
  // (the payer) and never need configuration from the user.
  const realStatements = allStatements.filter(s => !s.is_manual)

  // Are all real statements fully configured with a card holder?
  const allAssigned = realStatements.length > 0 && realStatements.every(s => s.card_holder_member_id)

  // How many real statements are missing a card holder?
  const unassignedCount = realStatements.filter(s => !s.card_holder_member_id).length

  // ── Effective payer for backend ────────────────────────────────────────────
  // If every statement has a card holder set, the backend's `payer_member_id` param
  // is never actually used (all transactions are covered by statement_payers).
  // We still have to send *something* — just auto-pick the first member.
  const effectivePayerId = allAssigned
    ? (members[0]?.id ?? '')
    : parseInt(fallbackPayerId)

  // Can we compute settlement?
  // Yes if: there are members AND (all statements assigned OR user picked a fallback)
  const canCompute = members.length > 0 && (allAssigned || !!fallbackPayerId)

  const compute = useMutation({
    mutationFn: () => api.computeSettlement(
      groupId,
      effectivePayerId,
      statementId ? parseInt(statementId) : null
    ),
    onSuccess: (data) => { setSettlement(data); setError(null) },
    onError: (err) => setError(err.message),
  })

  const totalOwed = settlement?.transfers.reduce((s, t) => s + t.amount, 0) || 0

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink-50 tracking-tight">Settlement</h1>
        <p className="text-ink-400 text-sm mt-1">
          Who owes whom, and by how much
        </p>
      </div>

      {/* ── Configuration card ──────────────────────────────────────────────── */}
      <div className="card mb-6">
        <h2 className="font-display text-lg font-semibold text-ink-100 mb-4 flex items-center gap-2">
          <CreditCard size={16} className="text-ink-400" />
          Card Holders
        </h2>

        {realStatements.length === 0 ? (
          // No real statements uploaded yet
          <div className="text-center py-6">
            <p className="text-sm text-ink-400 mb-3">No statements imported yet</p>
            <button
              className="btn-secondary text-xs"
              onClick={() => navigate(`/groups/${groupId}/upload`)}
            >
              Import Statement
            </button>
          </div>
        ) : (
          <>
            {/*
              Show who holds which card.
              Green = card holder set (settlement will credit them automatically).
              Amber = no card holder set (will fall through to the fallback payer below).
            */}
            <CardHoldersSummary
              statements={realStatements}
              members={members}
              groupId={groupId}
            />

            {/* Explanation of how multi-card settlement works */}
            <div className="mt-3 px-3 py-2.5 rounded-lg bg-ink-800/60 border border-ink-700">
              <p className="text-xs text-ink-400 leading-relaxed">
                {allAssigned
                  ? `Each person will be credited for their own card's charges. No further setup needed — click Compute below.`
                  : `${unassignedCount} statement${unassignedCount !== 1 ? 's' : ''} ${unassignedCount !== 1 ? 'are' : 'is'} missing a card holder. Transactions from those statements will be attributed to the fallback payer you choose below.`
                }
              </p>
            </div>
          </>
        )}

        {/*
          Fallback payer — only needed when some statements have no card holder.
          If all statements are assigned, this section is hidden entirely.
        */}
        {!allAssigned && realStatements.length > 0 && (
          <div className="mt-4 pt-4 border-t border-ink-800">
            <label className="label">
              Fallback: who paid for unassigned statements?
            </label>
            <p className="text-xs text-ink-500 mb-2">
              Transactions from statements without a card holder will be credited to this person.
            </p>
            <select
              className="select"
              value={fallbackPayerId}
              onChange={(e) => setFallbackPayerId(e.target.value)}
            >
              <option value="">Select fallback payer…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}

        {/*
          Optional: filter to a single statement.
          Only shown when there are multiple real statements to choose from.
        */}
        {realStatements.length > 1 && (
          <div className="mt-4">
            <label className="label">
              Filter by statement <span className="text-ink-600 normal-case font-normal">(optional)</span>
            </label>
            <select
              className="select"
              value={statementId}
              onChange={(e) => setStatementId(e.target.value)}
            >
              <option value="">All statements (recommended)</option>
              {realStatements.map((s) => {
                const holder = members.find(m => m.id === s.card_holder_member_id)?.name
                return (
                  <option key={s.id} value={s.id}>
                    {holder ? `${holder}'s card` : 'Unassigned'} — {fmtPeriod(s)} ({s.transaction_count} txns)
                  </option>
                )
              })}
            </select>
          </div>
        )}

        {/* Compute button */}
        <div className="mt-5 flex items-center gap-3">
          <button
            className="btn-primary"
            onClick={() => compute.mutate()}
            disabled={!canCompute || compute.isPending}
          >
            {compute.isPending
              ? <><Loader size={14} className="animate-spin" /> Computing…</>
              : <><TrendingUp size={14} /> Compute Settlement</>
            }
          </button>
          {!canCompute && realStatements.length > 0 && (
            <span className="text-xs text-amber-400">
              Select a fallback payer to continue
            </span>
          )}
        </div>

        {error && (
          <div className="mt-3 flex gap-2 items-start px-3 py-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-sm text-red-400">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            <div>
              <div className="font-medium mb-0.5">Settlement failed</div>
              <div className="text-xs text-red-400/80">{error}</div>
            </div>
          </div>
        )}
      </div>

      {/* ── Results ─────────────────────────────────────────────────────────── */}
      {settlement && (
        <div className="animate-slide-up">
          {/* Summary bar */}
          <div className="card mb-6 bg-gradient-to-r from-ink-900 to-ink-800 border-ink-600">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <p className="text-xs text-ink-400 mb-1">Total shared expenses</p>
                <p className="font-mono text-3xl font-bold text-lime-400">
                  {formatAmount(settlement.total_shared_expenses, currency)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-400 mb-1">Transfers needed</p>
                <p className="font-mono text-3xl font-bold text-ink-100">
                  {settlement.transfers.length}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-ink-400 mb-1">Money moving</p>
                <p className="font-mono text-3xl font-bold text-amber-400">
                  {formatAmount(totalOwed, currency)}
                </p>
              </div>
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2 mb-6">
            <button
              className="btn-secondary text-xs"
              onClick={() => api.exportCSV(groupId, effectivePayerId, statementId ? parseInt(statementId) : null)}
            >
              <Download size={12} />
              Export CSV
            </button>
            <button
              className="btn-secondary text-xs"
              onClick={() => api.exportJSON(groupId, effectivePayerId, statementId ? parseInt(statementId) : null)}
            >
              <Download size={12} />
              Export JSON
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Balances */}
            <div>
              <h2 className="font-display text-xl font-semibold text-ink-100 mb-3 flex items-center gap-2">
                <Users size={16} className="text-ink-400" />
                Net Balances
              </h2>
              <div className="space-y-2">
                {settlement.balances.map((b, i) => (
                  <BalanceCard key={b.member_id} balance={b} index={i} currency={currency} />
                ))}
              </div>
            </div>

            {/* Transfers */}
            <div>
              <h2 className="font-display text-xl font-semibold text-ink-100 mb-3 flex items-center gap-2">
                <DollarSign size={16} className="text-ink-400" />
                Minimized Transfers
              </h2>
              {settlement.transfers.length === 0 ? (
                <div className="card-sm text-center py-6">
                  <CheckCircle size={24} className="text-green-400 mx-auto mb-2" />
                  <p className="text-sm text-ink-300">All settled up!</p>
                  <p className="text-xs text-ink-500 mt-1">No transfers needed</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {settlement.transfers.map((t, i) => (
                    <TransferCard key={i} transfer={t} index={i} currency={currency} />
                  ))}
                </div>
              )}

              {settlement.transfers.length > 0 && (
                <div className="mt-4">
                  <CopyButton text={settlement.transfers.map(t => t.payment_request).join('\n\n')} />
                  <span className="text-xs text-ink-500 ml-2">Copy all messages</span>
                </div>
              )}
            </div>
          </div>

          {/* Unreviewed warning */}
          {settlement.balances.some(b => Math.abs(b.balance) < 0.01) && settlement.transfers.length > 0 && (
            <div className="mt-6 card-sm border-amber-400/20 bg-amber-400/5 flex gap-2">
              <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-ink-300">
                Some transactions may still need participant assignment. Head to the{' '}
                <button
                  className="text-lime-400 underline"
                  onClick={() => navigate(`/groups/${groupId}/transactions`)}
                >
                  Transactions tab
                </button>{' '}
                to review them before finalizing.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!settlement && !compute.isPending && (
        <div className="card text-center py-12">
          <TrendingUp size={36} className="text-ink-600 mx-auto mb-3" />
          <p className="font-display text-xl text-ink-300 mb-2">Ready to settle up</p>
          <p className="text-sm text-ink-500">
            {realStatements.length === 0
              ? 'Import at least one statement to get started'
              : allAssigned
                ? 'All cards are set up — click Compute Settlement above'
                : 'Choose a fallback payer and click Compute Settlement'
            }
          </p>
        </div>
      )}
    </div>
  )
}
