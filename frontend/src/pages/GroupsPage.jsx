import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { trackTripCreated } from '../lib/analytics'
import OnboardingModal from '../components/OnboardingModal'
import {
  Users, Plus, Trash2, UserPlus,
  ChevronRight, X, Check, Calendar,
} from 'lucide-react'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Format two ISO date strings (e.g. "2026-01-05", "2026-01-19") into
 * a human-readable range like "Jan 5 – Jan 19, 2026".
 */
function formatDateRange(start, end) {
  const fmt = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const [y] = end.split('-').map(Number)
  return `${fmt(start)} – ${fmt(end)}, ${y}`
}

// ── Category color map ───────────────────────────────────────────────────────
const MEMBER_COLORS = [
  'bg-lime-400 text-ink-950',
  'bg-green-400 text-ink-950',
  'bg-amber-400 text-ink-950',
  'bg-red-400 text-white',
  'bg-blue-400 text-white',
]

function MemberAvatar({ name, index }) {
  const colorClass = MEMBER_COLORS[index % MEMBER_COLORS.length]
  const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
  return (
    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${colorClass}`}>
      {initials}
    </div>
  )
}

function AddMemberInline({ groupId, onDone }) {
  const [name, setName] = useState('')
  const qc = useQueryClient()

  const mut = useMutation({
    mutationFn: (n) => api.addMember(groupId, n),
    onSuccess: () => {
      qc.invalidateQueries(['groups'])
      qc.invalidateQueries(['group', String(groupId)])
      setName('')
      onDone?.()
    },
  })

  const submit = (e) => {
    e.preventDefault()
    if (name.trim()) mut.mutate(name.trim())
  }

  return (
    <form onSubmit={submit} className="flex gap-2 mt-2">
      <input
        className="input flex-1 text-sm py-1.5"
        placeholder="Member name…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <button type="submit" className="btn-primary py-1.5 px-3" disabled={!name.trim() || mut.isPending}>
        <Check size={14} />
      </button>
      <button type="button" className="btn-ghost py-1.5 px-2" onClick={onDone}>
        <X size={14} />
      </button>
    </form>
  )
}

function GroupCard({ group }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [addingMember, setAddingMember] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const deleteMember = useMutation({
    mutationFn: (id) => api.deleteMember(id),
    onSuccess: () => qc.invalidateQueries(['groups']),
  })

  const deleteGroup = useMutation({
    mutationFn: () => api.deleteGroup(group.id),
    onSuccess: () => qc.invalidateQueries(['groups']),
  })

  return (
    <div className="card animate-slide-up">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3
            className="font-display text-xl font-semibold text-ink-50 hover:text-lime-400 transition-colors cursor-pointer"
            onClick={() => navigate(`/groups/${group.id}`)}
          >{group.name}</h3>
          <p className="text-xs text-ink-500 font-mono mt-0.5">
            {group.members.length} member{group.members.length !== 1 ? 's' : ''}
          </p>
          {/* Show trip date range if set */}
          {group.start_date && group.end_date && (
            <p className="text-xs text-lime-400/80 font-mono mt-1 flex items-center gap-1">
              <Calendar size={10} />
              {formatDateRange(group.start_date, group.end_date)}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!confirmDelete ? (
            <button
              className="btn-ghost p-2 text-ink-500 hover:text-red-400"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-xs text-ink-400">Delete?</span>
              <button className="btn-danger py-1 px-2 text-xs" onClick={() => deleteGroup.mutate()}>Yes</button>
              <button className="btn-ghost py-1 px-2 text-xs" onClick={() => setConfirmDelete(false)}>No</button>
            </div>
          )}
        </div>
      </div>

      {/* Members list */}
      <div className="space-y-2 mb-4">
        {group.members.length === 0 && (
          <p className="text-sm text-ink-500 italic">No members yet — add some below</p>
        )}
        {group.members.map((m, i) => (
          <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-ink-800/50 group">
            <MemberAvatar name={m.name} index={i} />
            <span className="flex-1 text-sm text-ink-200 font-medium">{m.name}</span>
            <button
              className="text-ink-500 hover:text-red-400 transition-all sm:opacity-0 sm:group-hover:opacity-100"
              onClick={() => deleteMember.mutate(m.id)}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Add member */}
      {addingMember ? (
        <AddMemberInline groupId={group.id} onDone={() => setAddingMember(false)} />
      ) : (
        <button
          className="btn-ghost w-full justify-center py-2 border border-dashed border-ink-700"
          onClick={() => setAddingMember(true)}
        >
          <UserPlus size={14} />
          Add member
        </button>
      )}

      {/* Action button — always goes to the trip overview */}
      {group.members.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ink-800">
          <button
            className="btn-primary w-full justify-center text-sm"
            onClick={() => navigate(`/groups/${group.id}`)}
          >
            Open Trip
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}

// All supported currencies with their display labels
// These are the same currencies available in the expense entry form
const CURRENCIES = [
  { code: 'USD', label: 'USD — US Dollar' },
  { code: 'AUD', label: 'AUD — Australian Dollar' },
  { code: 'NZD', label: 'NZD — New Zealand Dollar' },
  { code: 'JPY', label: 'JPY — Japanese Yen' },
  { code: 'GBP', label: 'GBP — British Pound' },
  { code: 'EUR', label: 'EUR — Euro' },
  { code: 'CAD', label: 'CAD — Canadian Dollar' },
  { code: 'SGD', label: 'SGD — Singapore Dollar' },
  { code: 'HKD', label: 'HKD — Hong Kong Dollar' },
  { code: 'THB', label: 'THB — Thai Baht' },
]

function CreateGroupForm({ onDone }) {
  const [name, setName] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [baseCurrency, setBaseCurrency] = useState('USD')  // default to USD
  const qc = useQueryClient()

  const create = useMutation({
    mutationFn: () => api.createGroup(
      name.trim(),
      startDate || null,   // pass null if empty (backend accepts null for "no date range")
      endDate || null,
      baseCurrency,        // settlement currency for this trip
    ),
    onSuccess: () => {
      qc.invalidateQueries(['groups'])
      setName('')
      setStartDate('')
      setEndDate('')
      setBaseCurrency('USD')
      // Track the new trip event — tells us how many trips active users create
      trackTripCreated()
      onDone?.()
    },
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate() }}
      className="card border-lime-400/30 animate-slide-up"
    >
      <h3 className="font-display text-lg font-semibold text-ink-50 mb-3">New Trip</h3>

      {/* Trip name */}
      <input
        className="input mb-3"
        placeholder="e.g. Japan 2026, Ski Trip, The Apartment…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />

      {/* Settlement currency — what currency do you want all expenses tracked in? */}
      <div className="mb-4">
        <label className="block text-xs text-ink-400 mb-1.5">
          Settlement currency
        </label>
        <p className="text-xs text-ink-600 mb-2">
          All expenses in other currencies will be converted to this for the final split
        </p>
        <select
          className="select w-full text-sm"
          value={baseCurrency}
          onChange={(e) => setBaseCurrency(e.target.value)}
        >
          {CURRENCIES.map(c => (
            <option key={c.code} value={c.code}>{c.label}</option>
          ))}
        </select>
      </div>

      {/* Optional trip date range */}
      <div className="mb-4">
        <label className="block text-xs text-ink-400 mb-1.5 flex items-center gap-1.5">
          <Calendar size={11} />
          Trip dates <span className="text-ink-600">(optional)</span>
        </label>
        <p className="text-xs text-ink-600 mb-2">
          Transactions outside this range will be auto-excluded on import
        </p>
        <div className="flex gap-2">
          <input
            type="date"
            className="input flex-1 text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className="text-ink-500 self-center text-sm">–</span>
          <input
            type="date"
            className="input flex-1 text-sm"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={!name.trim() || create.isPending}>
          <Plus size={14} />
          {create.isPending ? 'Creating…' : 'Create Trip'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

export default function GroupsPage() {
  const [creating, setCreating] = useState(false)
  const navigate = useNavigate()

  // Show onboarding modal to first-time users.
  // Once they dismiss it, localStorage tracks that they've seen it.
  const [showOnboarding, setShowOnboarding] = useState(false)
  useEffect(() => {
    if (!localStorage.getItem('autosplit_onboarded')) {
      // Small delay so the page loads first before the modal pops up
      const t = setTimeout(() => setShowOnboarding(true), 600)
      return () => clearTimeout(t)
    }
  }, [])

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  })

  // After Google OAuth, the user lands here. If they had a pending invite,
  // redirect them back to complete the join flow.
  useEffect(() => {
    const pendingJoin = sessionStorage.getItem('pendingJoin')
    if (pendingJoin) {
      sessionStorage.removeItem('pendingJoin')
      navigate(`/join/${pendingJoin}`, { replace: true })
    }
  }, [navigate])

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-8 gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-semibold text-ink-50 tracking-tight">Trips</h1>
          <p className="text-ink-400 text-sm mt-1">
            Manage your expense-sharing trips and households
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(!creating)}>
          <Plus size={15} />
          New Trip
        </button>
      </div>

      {/* Create form */}
      {creating && (
        <div className="mb-6">
          <CreateGroupForm onDone={() => setCreating(false)} />
        </div>
      )}

      {/* Groups grid */}
      {isLoading ? (
        <div className="text-ink-500 text-sm animate-pulse-soft">Loading groups…</div>
      ) : groups.length === 0 && !creating ? (
        <div className="space-y-6 max-w-xl mx-auto">
          {/* Main CTA card */}
          <div className="card text-center py-12">
            <div className="w-14 h-14 rounded-2xl bg-lime-400/10 border border-lime-400/20 flex items-center justify-center mx-auto mb-5">
              <Users size={24} className="text-lime-400" />
            </div>
            <p className="font-display text-2xl text-ink-100 mb-2">Create your first trip</p>
            <p className="text-ink-400 text-sm mb-6 leading-relaxed max-w-xs mx-auto">
              Add your travel companions, upload your credit card statements, and AutoSplit figures out who owes whom.
            </p>
            <button className="btn-primary mx-auto" onClick={() => setCreating(true)}>
              <Plus size={14} />
              New Trip
            </button>
          </div>

          {/* How it works — 3-step mini guide */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { step: '1', title: 'Create a trip', desc: 'Name it, add your travel dates and who\'s coming' },
              { step: '2', title: 'Import statements', desc: 'Upload PDF or CSV from Chase, Amex, BofA, and more' },
              { step: '3', title: 'Settle up', desc: 'AutoSplit calculates the fairest way to balance everything' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="card-sm text-center">
                <div className="w-7 h-7 rounded-full bg-ink-700 border border-ink-600 flex items-center justify-center mx-auto mb-3">
                  <span className="text-xs font-bold font-mono text-lime-400">{step}</span>
                </div>
                <p className="text-sm font-medium text-ink-200 mb-1">{title}</p>
                <p className="text-xs text-ink-500 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {groups.map((g, i) => (
            <div key={g.id} style={{ animationDelay: `${i * 60}ms` }}>
              <GroupCard group={g} />
            </div>
          ))}
        </div>
      )}

      {/* Onboarding modal — shown once to first-time users */}
      {showOnboarding && <OnboardingModal onClose={() => setShowOnboarding(false)} />}
    </div>
  )
}
