import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import {
  Users, Plus, Trash2, UserPlus, Upload, TrendingUp,
  ChevronRight, X, Check, Edit2,
} from 'lucide-react'

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
          <h3 className="font-display text-xl font-semibold text-ink-50">{group.name}</h3>
          <p className="text-xs text-ink-500 font-mono mt-0.5">
            {group.members.length} member{group.members.length !== 1 ? 's' : ''}
          </p>
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
              className="opacity-0 group-hover:opacity-100 text-ink-500 hover:text-red-400 transition-all"
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

      {/* Action buttons */}
      {group.members.length > 0 && (
        <div className="mt-4 pt-4 border-t border-ink-800 flex gap-2">
          <button
            className="btn-secondary flex-1 justify-center text-xs"
            onClick={() => navigate(`/groups/${group.id}/upload`)}
          >
            <Upload size={13} />
            Import PDF
          </button>
          <button
            className="btn-primary flex-1 justify-center text-xs"
            onClick={() => navigate(`/groups/${group.id}/settlement`)}
          >
            <TrendingUp size={13} />
            Settlement
          </button>
        </div>
      )}
    </div>
  )
}

function CreateGroupForm({ onDone }) {
  const [name, setName] = useState('')
  const qc = useQueryClient()

  const create = useMutation({
    mutationFn: (n) => api.createGroup(n),
    onSuccess: () => {
      qc.invalidateQueries(['groups'])
      setName('')
      onDone?.()
    },
  })

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(name.trim()) }}
      className="card border-lime-400/30 animate-slide-up"
    >
      <h3 className="font-display text-lg font-semibold text-ink-50 mb-3">New Group</h3>
      <input
        className="input mb-3"
        placeholder="e.g. The Apartment, Ski Trip 2026…"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <div className="flex gap-2">
        <button type="submit" className="btn-primary" disabled={!name.trim() || create.isPending}>
          <Plus size={14} />
          {create.isPending ? 'Creating…' : 'Create Group'}
        </button>
        <button type="button" className="btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  )
}

export default function GroupsPage() {
  const [creating, setCreating] = useState(false)
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['groups'],
    queryFn: api.getGroups,
  })

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title">Groups</h1>
          <p className="text-ink-400 text-sm mt-1">
            Manage your expense-sharing households and trips
          </p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(!creating)}>
          <Plus size={15} />
          New Group
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
        <div className="card text-center py-16">
          <Users size={40} className="text-ink-600 mx-auto mb-4" />
          <p className="font-display text-2xl text-ink-300 mb-2">No groups yet</p>
          <p className="text-ink-500 text-sm mb-6">Create your first group to start splitting expenses</p>
          <button className="btn-primary mx-auto" onClick={() => setCreating(true)}>
            <Plus size={14} />
            Create a Group
          </button>
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
    </div>
  )
}
