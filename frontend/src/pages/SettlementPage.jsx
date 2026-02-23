import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  TrendingUp, ArrowRight, Download, Copy, CheckCircle,
  Users, DollarSign, AlertTriangle, ChevronDown,
} from 'lucide-react'
import clsx from 'clsx'

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
function BalanceCard({ balance, index }) {
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
              ? `Is owed $${balance.balance.toFixed(2)}`
              : `Owes $${Math.abs(balance.balance).toFixed(2)}`}
        </div>
      </div>
      <div className={clsx(
        'font-mono text-xl font-bold',
        isZero ? 'text-ink-400' : isOwed ? 'text-green-400' : 'text-red-400'
      )}>
        {isZero ? '—' : `${isOwed ? '+' : '–'}$${Math.abs(balance.balance).toFixed(2)}`}
      </div>
    </div>
  )
}

// ── Transfer card ─────────────────────────────────────────────────────────────
function TransferCard({ transfer, index }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className="card-sm animate-slide-up"
      style={{ animationDelay: `${index * 80}ms` }}
    >
      <div className="flex items-center gap-3">
        {/* From → To */}
        <div className="flex-1 flex items-center gap-2">
          <span className="font-medium text-ink-100">{transfer.from_member_name}</span>
          <ArrowRight size={14} className="text-ink-500 flex-shrink-0" />
          <span className="font-medium text-ink-100">{transfer.to_member_name}</span>
        </div>

        {/* Amount */}
        <div className="font-mono text-xl font-bold text-lime-400">
          ${transfer.amount.toFixed(2)}
        </div>

        {/* Expand payment request */}
        <button
          className="btn-ghost py-1 px-2"
          onClick={() => setExpanded(!expanded)}
          title="Payment request message"
        >
          <ChevronDown
            size={14}
            className={clsx('transition-transform', expanded && 'rotate-180')}
          />
        </button>
      </div>

      {/* Expanded payment request */}
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

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SettlementPage() {
  const { groupId } = useParams()
  const navigate = useNavigate()
  const [payerMemberId, setPayerMemberId] = useState('')
  const [statementId, setStatementId] = useState('')
  const [settlement, setSettlement] = useState(null)
  const [error, setError] = useState(null)

  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
  })

  const { data: statements = [] } = useQuery({
    queryKey: ['statements', groupId],
    queryFn: () => api.getStatements(groupId),
  })

  const members = group?.members || []

  const compute = useMutation({
    mutationFn: () => api.computeSettlement(
      groupId,
      parseInt(payerMemberId),
      statementId ? parseInt(statementId) : null
    ),
    onSuccess: (data) => {
      setSettlement(data)
      setError(null)
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const totalOwed = settlement?.transfers.reduce((s, t) => s + t.amount, 0) || 0

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="section-title">Settlement</h1>
        <p className="text-ink-400 text-sm mt-1">
          See who owes whom and generate payment requests
        </p>
      </div>

      {/* Config card */}
      <div className="card mb-6">
        <h2 className="font-display text-lg font-semibold text-ink-100 mb-4">Compute Settlement</h2>

        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* Card holder picker */}
          <div>
            <label className="label">Who paid the credit card?</label>
            <select
              className="select"
              value={payerMemberId}
              onChange={(e) => setPayerMemberId(e.target.value)}
            >
              <option value="">Select card holder…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          {/* Statement picker */}
          <div>
            <label className="label">Statement (optional)</label>
            <select
              className="select"
              value={statementId}
              onChange={(e) => setStatementId(e.target.value)}
            >
              <option value="">All statements</option>
              {statements.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.period_start} – {s.period_end} ({s.transaction_count} txns)
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          className="btn-primary"
          onClick={() => compute.mutate()}
          disabled={!payerMemberId || compute.isPending}
        >
          <TrendingUp size={14} />
          {compute.isPending ? 'Computing…' : 'Compute Settlement'}
        </button>

        {error && (
          <div className="mt-3 flex gap-2 items-start text-sm text-red-400">
            <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
      </div>

      {/* Results */}
      {settlement && (
        <div className="animate-slide-up">
          {/* Summary bar */}
          <div className="card mb-6 bg-gradient-to-r from-ink-900 to-ink-800 border-ink-600">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-ink-400 mb-1">Total shared expenses</p>
                <p className="font-mono text-3xl font-bold text-lime-400">
                  ${settlement.total_shared_expenses.toFixed(2)}
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
                  ${totalOwed.toFixed(2)}
                </p>
              </div>
            </div>
          </div>

          {/* Export buttons */}
          <div className="flex gap-2 mb-6">
            <button
              className="btn-secondary text-xs"
              onClick={() => api.exportCSV(groupId, parseInt(payerMemberId), statementId ? parseInt(statementId) : null)}
            >
              <Download size={12} />
              Export CSV
            </button>
            <button
              className="btn-secondary text-xs"
              onClick={() => api.exportJSON(groupId, parseInt(payerMemberId), statementId ? parseInt(statementId) : null)}
            >
              <Download size={12} />
              Export JSON
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6">
            {/* Balances */}
            <div>
              <h2 className="font-display text-xl font-semibold text-ink-100 mb-3 flex items-center gap-2">
                <Users size={16} className="text-ink-400" />
                Net Balances
              </h2>
              <div className="space-y-2">
                {settlement.balances.map((b, i) => (
                  <BalanceCard key={b.member_id} balance={b} index={i} />
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
                    <TransferCard key={i} transfer={t} index={i} />
                  ))}
                </div>
              )}

              {/* All messages copy */}
              {settlement.transfers.length > 0 && (
                <div className="mt-4">
                  <CopyButton
                    text={settlement.transfers.map(t => t.payment_request).join('\n\n')}
                  />
                  <span className="text-xs text-ink-500 ml-2">Copy all messages</span>
                </div>
              )}
            </div>
          </div>

          {/* Unreviewed warning */}
          {settlement.balances.some(b => Math.abs(b.balance) < 0.01) && (
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
                to review them.
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
            Select the card holder and click Compute Settlement
          </p>
        </div>
      )}
    </div>
  )
}
