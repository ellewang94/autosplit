/**
 * SplitCalculatorPage — a fully public, no-login-required expense calculator.
 *
 * WHY THIS EXISTS:
 *   1. SEO: Targets "trip expense calculator" search queries — a high-intent keyword.
 *   2. Funnel: People doing rough calculations here are our ideal AutoSplit user.
 *      The CTA at the bottom converts them to sign up once they see how tedious
 *      manual entry is vs uploading a statement.
 *
 * HOW IT WORKS:
 *   - Entirely client-side. No backend calls, no authentication required.
 *   - User adds members (up to 10), then adds expense rows.
 *   - The settlement algorithm (same logic as the backend) runs live in the browser.
 *   - Results update instantly as the user types — no submit button.
 *
 * ALGORITHM:
 *   Greedy debt minimization. Builds a balance map (who's owed what),
 *   then matches creditors with debtors to minimize total transfers.
 *   This is the same approach used by Splitwise, Venmo, etc.
 */
import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  Plus, X, Zap, ArrowRight, CheckCircle, Users,
  Receipt, Calculator, Trash2, ChevronDown,
} from 'lucide-react'

// ── Settlement algorithm ──────────────────────────────────────────────────────
// Pure JavaScript — no network calls. Takes member names and expense objects,
// returns an array of { from, to, amount } transfer objects.

function computeSettlement(members, expenses) {
  // Build a balance map: member name → net balance
  // Positive balance = this person is owed money
  // Negative balance = this person owes money
  const balances = {}
  members.forEach(m => { balances[m] = 0 })

  expenses.forEach(exp => {
    // Skip incomplete rows
    if (!exp.paidBy || !exp.splitBetween?.length || !exp.amount) return
    const share = exp.amount / exp.splitBetween.length

    // The person who paid gets credited the full amount
    balances[exp.paidBy] = (balances[exp.paidBy] || 0) + exp.amount

    // Each participant is debited their share (including the payer)
    exp.splitBetween.forEach(m => {
      balances[m] = (balances[m] || 0) - share
    })
  })

  // Separate into creditors (are owed money) and debtors (owe money)
  // We use 0.005 as a threshold to avoid floating-point noise (e.g. 0.0000001)
  const cred = Object.entries(balances)
    .filter(([, b]) => b > 0.005)
    .sort(([, a], [, b]) => b - a)   // largest credit first
    .map(([name, bal]) => ({ name, bal }))

  const debt = Object.entries(balances)
    .filter(([, b]) => b < -0.005)
    .sort(([, a], [, b]) => a - b)   // largest debt first
    .map(([name, bal]) => ({ name, bal: Math.abs(bal) }))

  // Greedy matching: pair the biggest creditor with the biggest debtor
  const transfers = []
  let i = 0, j = 0

  while (i < cred.length && j < debt.length) {
    // The transfer amount is the minimum of what's owed and what's due
    const amount = Math.min(cred[i].bal, debt[j].bal)
    if (amount > 0.005) {
      transfers.push({
        from: debt[j].name,
        to: cred[i].name,
        amount: Math.round(amount * 100) / 100,
      })
    }
    cred[i].bal -= amount
    debt[j].bal -= amount
    // Advance past any balance that's been fully resolved
    if (cred[i].bal < 0.005) i++
    if (debt[j].bal < 0.005) j++
  }

  return transfers
}

// ── Per-person spending summary ───────────────────────────────────────────────
// Shows total expenses, how much each person paid, and their share

function computePersonTotals(members, expenses) {
  const paid = {}     // how much each person paid out-of-pocket
  const owes = {}     // how much each person's share totals up to
  members.forEach(m => { paid[m] = 0; owes[m] = 0 })

  let total = 0
  expenses.forEach(exp => {
    if (!exp.paidBy || !exp.splitBetween?.length || !exp.amount) return
    total += exp.amount
    paid[exp.paidBy] = (paid[exp.paidBy] || 0) + exp.amount
    const share = exp.amount / exp.splitBetween.length
    exp.splitBetween.forEach(m => {
      owes[m] = (owes[m] || 0) + share
    })
  })

  return { total, paid, owes }
}

// ── Empty expense row factory ─────────────────────────────────────────────────
let nextExpenseId = 1
function makeExpense(members) {
  return {
    id: nextExpenseId++,
    description: '',
    amount: '',
    paidBy: members[0] || '',
    splitBetween: [...members],   // default: split between everyone
  }
}

// ── Format a dollar amount ────────────────────────────────────────────────────
function fmt(n) {
  return `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// ── Member pill component ─────────────────────────────────────────────────────
// Displays a member's name as a removable chip
function MemberPill({ name, onRemove, canRemove }) {
  return (
    <div className="flex items-center gap-1.5 bg-ink-800 border border-ink-700 rounded-full px-3 py-1.5 text-sm text-ink-200 font-medium">
      {name}
      {canRemove && (
        <button
          onClick={onRemove}
          className="text-ink-500 hover:text-red-400 transition-colors ml-0.5"
          title={`Remove ${name}`}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

// ── Expense row component ─────────────────────────────────────────────────────
// One row in the expenses list. Each row has: description, amount, paidBy, splitBetween.
function ExpenseRow({ expense, members, onChange, onRemove }) {
  const [showSplit, setShowSplit] = useState(false)

  function toggleSplitMember(member) {
    const current = expense.splitBetween
    if (current.includes(member)) {
      // Don't allow deselecting the last member
      if (current.length <= 1) return
      onChange({ ...expense, splitBetween: current.filter(m => m !== member) })
    } else {
      onChange({ ...expense, splitBetween: [...current, member] })
    }
  }

  // Check if the split is "everyone" so we can show a summary
  const isAllMembers = members.length > 0 && members.every(m => expense.splitBetween.includes(m))
  const splitSummary = isAllMembers
    ? 'Everyone'
    : expense.splitBetween.length > 0
      ? expense.splitBetween.join(', ')
      : 'No one'

  return (
    <div className="bg-ink-800/50 border border-ink-700 rounded-xl p-4 space-y-3 animate-slide-up">
      {/* Top row: description + amount + delete */}
      <div className="flex gap-2 items-start">
        <input
          type="text"
          placeholder="What was this for?"
          value={expense.description}
          onChange={e => onChange({ ...expense, description: e.target.value })}
          className="input flex-1 text-sm"
        />
        <div className="relative w-28 flex-shrink-0">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-500 text-sm pointer-events-none">$</span>
          <input
            type="number"
            placeholder="0.00"
            min="0"
            step="0.01"
            value={expense.amount}
            onChange={e => onChange({ ...expense, amount: parseFloat(e.target.value) || '' })}
            className="input w-full text-sm pl-7 font-mono"
          />
        </div>
        <button
          onClick={onRemove}
          className="p-2 rounded-lg text-ink-600 hover:text-red-400 hover:bg-red-400/8 transition-colors flex-shrink-0"
          title="Remove this expense"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Bottom row: paid by + split between */}
      <div className="flex gap-2 flex-wrap">
        {/* Who paid */}
        <div className="relative">
          <select
            value={expense.paidBy}
            onChange={e => onChange({ ...expense, paidBy: e.target.value })}
            className="select text-xs py-1.5 pr-7 appearance-none"
          >
            <option value="">Paid by…</option>
            {members.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-500 pointer-events-none" />
        </div>

        {/* Split between — collapsible checkboxes */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowSplit(!showSplit)}
            className="flex items-center gap-1.5 text-xs text-ink-400 hover:text-ink-200 border border-ink-700 rounded-lg px-3 py-1.5 bg-ink-800 transition-colors"
          >
            Split: {splitSummary}
            <ChevronDown size={10} className={`transition-transform ${showSplit ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown checkboxes for split participants */}
          {showSplit && (
            <div className="absolute top-full left-0 mt-1 z-10 bg-ink-800 border border-ink-700 rounded-xl p-3 shadow-xl min-w-[160px] animate-slide-up">
              <div className="text-[10px] text-ink-500 mb-2 font-mono uppercase tracking-wide">Split between</div>
              {members.map(m => (
                <label key={m} className="flex items-center gap-2 py-1 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={expense.splitBetween.includes(m)}
                    onChange={() => toggleSplitMember(m)}
                    className="w-3.5 h-3.5 rounded border-ink-600 bg-ink-700 accent-lime-400"
                  />
                  <span className="text-xs text-ink-200 group-hover:text-ink-50 transition-colors">{m}</span>
                </label>
              ))}
              <button
                onClick={() => setShowSplit(false)}
                className="mt-2 text-[10px] text-lime-400 hover:text-lime-300 w-full text-right"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Results panel ─────────────────────────────────────────────────────────────
// Shows live settlement results, per-person breakdown, and total
function ResultsPanel({ members, expenses }) {
  const validMembers = members.filter(m => m.trim())
  const validExpenses = expenses.filter(e => e.amount && e.paidBy && e.splitBetween?.length)

  const hasEnoughData = validMembers.length >= 2 && validExpenses.length >= 1

  if (!hasEnoughData) {
    return (
      <div className="bg-ink-900 border border-ink-700 rounded-2xl p-6 text-center">
        <Calculator size={32} className="text-ink-700 mx-auto mb-3" strokeWidth={1.5} />
        <p className="text-sm text-ink-500 leading-relaxed">
          Add at least 2 members and 1 expense to see results
        </p>
        <p className="text-xs text-ink-600 mt-2 font-mono">Results update as you type</p>
      </div>
    )
  }

  const transfers = computeSettlement(validMembers, validExpenses)
  const { total, paid, owes } = computePersonTotals(validMembers, validExpenses)

  return (
    <div className="space-y-4">
      {/* Total */}
      <div className="bg-ink-900 border border-ink-700 rounded-2xl p-5">
        <div className="text-xs text-ink-500 mb-1 font-mono uppercase tracking-wide">Total expenses</div>
        <div className="font-mono text-3xl font-bold text-lime-400">{fmt(total)}</div>
        <div className="text-xs text-ink-600 mt-1">{validExpenses.length} expense{validExpenses.length !== 1 ? 's' : ''}</div>
      </div>

      {/* Who owes whom */}
      <div className="bg-ink-900 border border-ink-700 rounded-2xl p-5">
        <h3 className="text-xs text-ink-500 font-mono uppercase tracking-wide mb-4">Who pays whom</h3>

        {transfers.length === 0 ? (
          /* All settled — everyone is even */
          <div className="text-center py-4">
            <CheckCircle size={24} className="text-green-400 mx-auto mb-2" strokeWidth={1.5} />
            <p className="text-sm font-medium text-ink-200">All settled up!</p>
            <p className="text-xs text-ink-500 mt-1">No transfers needed</p>
          </div>
        ) : (
          <div className="space-y-2">
            {transfers.map((t, i) => (
              <div
                key={i}
                className="flex items-center gap-2 bg-ink-800/50 border border-ink-700 rounded-xl px-4 py-3 animate-slide-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <span className="text-sm font-medium text-ink-200 truncate flex-1">{t.from}</span>
                <ArrowRight size={12} className="text-ink-500 flex-shrink-0" />
                <span className="text-sm font-medium text-ink-200 truncate flex-1 text-right">{t.to}</span>
                <span className="font-mono text-base font-bold text-lime-400 ml-2 flex-shrink-0">{fmt(t.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Per-person breakdown */}
      <div className="bg-ink-900 border border-ink-700 rounded-2xl p-5">
        <h3 className="text-xs text-ink-500 font-mono uppercase tracking-wide mb-4">Per-person breakdown</h3>
        <div className="space-y-3">
          {validMembers.map((m, i) => {
            const netBalance = (paid[m] || 0) - (owes[m] || 0)
            const isEven = Math.abs(netBalance) < 0.01
            const isOwed = netBalance > 0.01
            return (
              <div key={m} className="flex items-center gap-3">
                {/* Avatar circle */}
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  ['bg-lime-400 text-ink-950', 'bg-green-400 text-ink-950', 'bg-amber-400 text-ink-950', 'bg-red-400 text-white', 'bg-blue-400 text-white'][i % 5]
                }`}>
                  {m.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-ink-200 font-medium truncate">{m}</div>
                  <div className="text-xs text-ink-500 font-mono">Paid {fmt(paid[m] || 0)} · Owes {fmt(owes[m] || 0)}</div>
                </div>
                <div className={`font-mono text-sm font-bold flex-shrink-0 ${isEven ? 'text-ink-500' : isOwed ? 'text-green-400' : 'text-red-400'}`}>
                  {isEven ? 'Even' : isOwed ? `+${fmt(netBalance)}` : `-${fmt(Math.abs(netBalance))}`}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function SplitCalculatorPage() {
  // Update the document title for SEO — search engines read this
  useEffect(() => {
    document.title = 'Trip Expense Calculator — AutoSplit'
    return () => { document.title = 'AutoSplit' }
  }, [])

  // Members state — array of name strings
  // Default to two placeholder entries so the form doesn't look empty
  const [members, setMembers] = useState(['Person 1', 'Person 2'])
  const [newMemberName, setNewMemberName] = useState('')
  const [memberError, setMemberError] = useState(null)

  // Expenses state — array of expense objects
  const [expenses, setExpenses] = useState(() => [makeExpense(['Person 1', 'Person 2'])])

  // Add a new member
  function addMember() {
    const name = newMemberName.trim()
    if (!name) return
    if (members.length >= 10) {
      setMemberError('Maximum 10 members')
      return
    }
    if (members.includes(name)) {
      setMemberError(`"${name}" is already in the group`)
      return
    }
    const newMembers = [...members, name]
    setMembers(newMembers)
    // Update all existing expenses to include the new member in their split
    setExpenses(prev => prev.map(e => ({
      ...e,
      splitBetween: [...e.splitBetween, name],
    })))
    setNewMemberName('')
    setMemberError(null)
  }

  function handleMemberKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); addMember() }
  }

  // Remove a member and clean up references in expenses
  function removeMember(name) {
    if (members.length <= 2) return  // need at least 2
    const newMembers = members.filter(m => m !== name)
    setMembers(newMembers)
    // Remove this member from all expense splitBetween arrays + paidBy
    setExpenses(prev => prev.map(e => ({
      ...e,
      paidBy: e.paidBy === name ? (newMembers[0] || '') : e.paidBy,
      splitBetween: e.splitBetween.filter(m => m !== name).length > 0
        ? e.splitBetween.filter(m => m !== name)
        : newMembers,  // fallback: if nobody is left, split among everyone
    })))
  }

  // Add a blank expense row
  function addExpense() {
    setExpenses(prev => [...prev, makeExpense(members)])
  }

  // Update a specific expense by its id
  function updateExpense(id, updated) {
    setExpenses(prev => prev.map(e => e.id === id ? updated : e))
  }

  // Remove an expense by id
  function removeExpense(id) {
    setExpenses(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="min-h-screen bg-ink-950 text-ink-50">

      {/* Lime atmospheric glow at the top */}
      <div className="pointer-events-none fixed inset-0 z-0" style={{
        background: 'radial-gradient(ellipse 60% 35% at 50% -8%, rgba(200,241,53,0.09) 0%, transparent 60%)',
      }} />

      {/* ── Navigation ────────────────────────────────────────────────── */}
      <nav className="relative z-10 max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-lime-400 flex items-center justify-center shadow-md shadow-lime-400/25">
            <Zap size={15} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <span className="font-display text-xl font-semibold text-ink-50 tracking-tight">AutoSplit</span>
        </Link>
        <Link
          to="/signup"
          className="text-sm text-lime-400 hover:text-lime-300 font-medium transition-colors"
        >
          Sign up free →
        </Link>
      </nav>

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pb-20">

        {/* ── Page header ─────────────────────────────────────────────── */}
        <div className="mb-10 animate-fade-in">
          <div className="inline-flex items-center gap-2 bg-lime-400/10 border border-lime-400/25 rounded-full px-3 py-1 mb-4">
            <Calculator size={11} className="text-lime-400" />
            <span className="text-xs text-lime-400 font-semibold font-mono">Free trip expense calculator</span>
          </div>
          <h1 className="font-display font-semibold leading-tight tracking-tight mb-3 text-ink-50"
              style={{ fontSize: 'clamp(2rem, 5vw, 3rem)' }}>
            Split expenses,{' '}
            <span className="text-lime-400">instantly.</span>
          </h1>
          <p className="text-base text-ink-400 max-w-lg leading-relaxed">
            Enter your group&apos;s expenses and see exactly who owes whom — and how to settle with the fewest transfers.
            No sign-up required.
          </p>
        </div>

        {/* ── Two-column layout: input left, results right ─────────────── */}
        <div className="grid lg:grid-cols-2 gap-8 items-start">

          {/* ── LEFT: Input panel ──────────────────────────────────────── */}
          <div className="space-y-6">

            {/* Members section */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Users size={15} className="text-lime-400" />
                <h2 className="font-display text-lg font-semibold text-ink-100">Who&apos;s on this trip?</h2>
                <span className="text-xs text-ink-600 font-mono ml-auto">{members.length}/10</span>
              </div>

              {/* Current members as removable pills */}
              <div className="flex flex-wrap gap-2 mb-4">
                {members.map((m, i) => (
                  <MemberPill
                    key={i}
                    name={m}
                    onRemove={() => removeMember(m)}
                    canRemove={members.length > 2}
                  />
                ))}
              </div>

              {/* Add new member */}
              {memberError && (
                <p className="text-xs text-red-400 mb-2">{memberError}</p>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Add a person (press Enter)"
                  value={newMemberName}
                  onChange={e => setNewMemberName(e.target.value)}
                  onKeyDown={handleMemberKeyDown}
                  className="input flex-1 text-sm"
                  maxLength={40}
                />
                <button
                  onClick={addMember}
                  disabled={!newMemberName.trim() || members.length >= 10}
                  className="btn-primary px-3 py-2 disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Expenses section */}
            <div className="card">
              <div className="flex items-center gap-2 mb-4">
                <Receipt size={15} className="text-lime-400" />
                <h2 className="font-display text-lg font-semibold text-ink-100">Expenses</h2>
              </div>

              <div className="space-y-3 mb-4">
                {expenses.map(exp => (
                  <ExpenseRow
                    key={exp.id}
                    expense={exp}
                    members={members}
                    onChange={updated => updateExpense(exp.id, updated)}
                    onRemove={() => removeExpense(exp.id)}
                  />
                ))}
              </div>

              <button
                onClick={addExpense}
                className="btn-ghost w-full justify-center border border-dashed border-ink-700 py-2.5"
              >
                <Plus size={14} />
                Add expense
              </button>
            </div>

          </div>

          {/* ── RIGHT: Results panel ───────────────────────────────────── */}
          <div className="lg:sticky lg:top-8">
            <ResultsPanel members={members} expenses={expenses} />
          </div>

        </div>

        {/* ── CTA: Convert calculator users to AutoSplit signups ──────── */}
        <div className="mt-12 bg-ink-900/80 border border-lime-400/20 rounded-2xl p-8 animate-slide-up">
          <div className="grid sm:grid-cols-2 gap-6 items-center">
            <div>
              <h2 className="font-display text-2xl font-semibold text-ink-50 mb-2 leading-tight">
                Doing this for real?
              </h2>
              <p className="text-sm text-ink-400 leading-relaxed mb-1">
                AutoSplit automatically calculates this from your credit card statement — no manual entry needed.
              </p>
              <p className="text-sm text-ink-500">
                Upload a PDF or CSV and your whole trip is imported in seconds.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Link
                to="/signup"
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-lime-400 text-ink-950 text-sm font-bold hover:bg-lime-500 transition-colors shadow-lg shadow-lime-400/15"
              >
                <Zap size={15} strokeWidth={2.5} />
                Try AutoSplit free
              </Link>
              <p className="text-center text-xs text-ink-600 font-mono">
                First trip free · No credit card needed
              </p>
            </div>
          </div>
        </div>

        {/* ── SEO text — small, subtle, for search engines ────────────── */}
        {/* This is intentionally low-profile — it's for SEO, not for reading. */}
        <div className="mt-12 pt-8 border-t border-ink-800/50">
          <p className="text-xs text-ink-700 leading-relaxed max-w-2xl">
            A free trip expense calculator. Enter your group&apos;s expenses to find out who owes what and minimize
            the number of transfers. Works for trips, dinners, roommates, and any shared expense situation.
            No sign-up required. Supports up to 10 people and any number of expenses. The settlement algorithm
            minimizes the total number of transfers, so everyone makes as few payments as possible.
          </p>
        </div>

      </div>
    </div>
  )
}
