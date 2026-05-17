import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import {
  Users, X, Plus, Check, UserCheck, Wallet, Link2, Copy,
  CheckCircle, MessageCircle, Loader, Hourglass, Clock,
} from 'lucide-react'
import clsx from 'clsx'

/**
 * PeopleSheet — the unified Add People + Invite surface.
 *
 * Consolidates everything related to managing trip members behind one
 * sheet so the user doesn't have to mentally model "Add by name" vs
 * "Send invite link" vs "Edit payment handles" as separate flows.
 *
 * Sections, top to bottom:
 *   1. Members already on the trip (with payment-handle dot, joined badge)
 *   2. Quick-add chips from your past trips (Splitwise's "friends" idea)
 *   3. Add by name input
 *   4. Or share an invite link with an "expecting N people" count selector
 *
 * Mounted as a bottom sheet on mobile, centered modal on tablet/desktop.
 * Owner-only for invite generation; trip members can see the list and add
 * names but the count slider + share buttons hide for non-owners.
 */
export default function PeopleSheet({ group, members, isOwner, onClose, onEditHandles }) {
  const groupId = group?.id
  const qc = useQueryClient()
  const { user } = useAuth()
  // Has the current signed-in user already claimed a member slot in this trip?
  // If not, the next "Add someone new" defaults to "this is me" so the trip
  // owner naturally gets linked when they add themselves first (which they
  // almost always do, per "Add yourself first, then your friends").
  const userClaimed = user?.id && members.some((m) => m.user_id === user.id)

  // ── Quick-add suggestions ────────────────────────────────────────────────
  // These are people the owner has collaborated with on prior trips. We fetch
  // even for non-owners so members can suggest names from their own history.
  const { data: recent = [] } = useQuery({
    // Include groupId in the key so the cache doesn't bleed between trips.
    queryKey: ['recent-collaborators', groupId],
    queryFn: () => api.getRecentCollaborators(groupId),
    staleTime: 5 * 60_000,
  })

  // Names already on the trip — used to dim history chips that would dup.
  const onTripNames = new Set(members.map((m) => (m.name || '').toLowerCase()))
  const onTripUserIds = new Set(members.map((m) => m.user_id).filter(Boolean))

  // ── Mutations ────────────────────────────────────────────────────────────
  const addByHistory = useMutation({
    mutationFn: ({ name, user_id, payment_handles }) =>
      api.addMember(groupId, name, { user_id, payment_handles }),
    onSuccess: () => {
      qc.invalidateQueries(['group', String(groupId)])
      qc.invalidateQueries(['groups'])
    },
  })

  const addByName = useMutation({
    mutationFn: ({ name, claimAsSelf }) =>
      api.addMember(groupId, name, claimAsSelf && user?.id ? { user_id: user.id } : {}),
    onSuccess: () => {
      setNewName('')
      qc.invalidateQueries(['group', String(groupId)])
      qc.invalidateQueries(['groups'])
      qc.invalidateQueries(['my-balance', String(groupId)])
    },
  })

  const removeMember = useMutation({
    mutationFn: (id) => api.deleteMember(id),
    onSuccess: () => {
      qc.invalidateQueries(['group', String(groupId)])
      qc.invalidateQueries(['groups'])
    },
  })

  const claimSlot = useMutation({
    mutationFn: (id) => api.claimMemberSlot(id),
    onSuccess: () => {
      qc.invalidateQueries(['group', String(groupId)])
      qc.invalidateQueries(['groups'])
      qc.invalidateQueries(['my-balance', String(groupId)])
    },
  })

  // One universal invite link per group — no "how many?" prompt, no slot
  // reservation. Anyone with the link joins as a real member with their own
  // name. The backend re-uses the same invite_code on repeat calls so the
  // owner never accidentally rotates a link friends already have.
  const getInviteLink = useMutation({
    mutationFn: () => api.getInviteLink(groupId),
    onSuccess: (data) => {
      // Rebuild URL from the current browser origin — the backend's
      // invite_url may point to a stale Vercel preview domain, but the
      // invite_code is canonical and we own the host.
      setInviteUrl(`${window.location.origin}/join/${data.invite_code}`)
      qc.invalidateQueries(['group', String(groupId)])
      qc.invalidateQueries(['groups'])
    },
  })

  // ── Local state ──────────────────────────────────────────────────────────
  const [newName, setNewName] = useState('')

  // "This is me" toggle — auto-claims the new member as the current signed-in
  // user. Defaults true when the user hasn't yet claimed any slot in this
  // trip (almost always: "the trip owner adds themselves first"). Once
  // claimed, defaults false so subsequent friends are added as themselves.
  const [claimAsSelf, setClaimAsSelf] = useState(!userClaimed)

  const [inviteUrl, setInviteUrl] = useState(null)
  const [copied, setCopied] = useState(false)

  // Reset "copied!" indicator after 2.5s, with cleanup so unmounting
  // mid-toast doesn't trigger a setState-on-unmounted warning.
  useEffect(() => {
    if (!copied) return
    const id = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(id)
  }, [copied])

  // ── Handlers ─────────────────────────────────────────────────────────────
  function handleAddByName(e) {
    e?.preventDefault()
    if (!newName.trim()) return
    addByName.mutate(
      { name: newName.trim(), claimAsSelf },
      {
        // After claiming once, flip the toggle off so the next add is for a
        // friend (who isn't the signed-in user). User can re-check if they
        // accidentally added their friend first.
        onSuccess: () => { if (claimAsSelf) setClaimAsSelf(false) },
      }
    )
  }

  function handleQuickAdd(person) {
    addByHistory.mutate({
      name: person.name,
      user_id: person.user_id || null,
      payment_handles: person.payment_handles || null,
    })
  }

  async function handleGetInviteLink() {
    // One click — the backend either generates or returns the existing
    // invite_code. No slot reservation, no count prompt.
    await getInviteLink.mutateAsync()
  }

  function handleCopy() {
    if (!inviteUrl) return
    navigator.clipboard?.writeText(inviteUrl)
    setCopied(true)
    // Reset is handled by the useEffect above.
  }

  function shareWhatsApp() {
    if (!inviteUrl) return
    const text = encodeURIComponent(
      `Join our trip "${group?.name}" on AutoSplit — add your card statement so we can split expenses fairly: ${inviteUrl}`
    )
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }
  function shareMessages() {
    if (!inviteUrl) return
    const text = encodeURIComponent(
      `Join our trip "${group?.name}" on AutoSplit: ${inviteUrl}`
    )
    window.open(`sms:&body=${text}`, '_blank')
  }

  // ── Render helpers ───────────────────────────────────────────────────────
  const realMembers = members.filter((m) => !m.is_placeholder)
  const placeholders = members.filter((m) => m.is_placeholder)

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
        {/* Sheet grab handle on mobile */}
        <div className="md:hidden mx-auto mt-2 mb-1 w-10 h-1 rounded-full bg-ink-600 flex-shrink-0" />

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ink-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <Users size={16} className="text-lime-400" />
            <h2 className="font-display text-lg font-semibold text-ink-50">People</h2>
          </div>
          <button onClick={onClose} className="p-1 -mr-1 text-ink-500 hover:text-ink-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-6 overflow-y-auto">

          {/* ── Section 1: existing members ─────────────────────────────── */}
          <section>
            <h3 className="text-[11px] font-semibold text-ink-500 uppercase tracking-widest mb-2">
              On this trip
            </h3>
            <div className="space-y-1.5">
              {realMembers.map((m, i) => {
                const hasPay = m.payment_handles && Object.values(m.payment_handles).some(Boolean)
                const initials = (m.name || '?').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
                return (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-ink-800/50 group">
                    <div className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                      MEMBER_COLOR(i),
                    )}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink-100 truncate">{m.name}</div>
                      <div className="flex items-center gap-2 text-[10px] mt-0.5">
                        {/* Joined vs pending — same prominence, opposing colors
                            so it's instantly readable: green = they've clicked
                            the invite link and signed in; amber = waiting on them. */}
                        {m.has_account ? (
                          <span
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-green-400 bg-green-400/10 border border-green-400/20"
                            title="This person has clicked the invite link and signed in"
                          >
                            <UserCheck size={10} strokeWidth={2.5} />
                            <span className="font-semibold">Joined</span>
                          </span>
                        ) : (
                          <span
                            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-amber-400 bg-amber-400/10 border border-amber-400/20"
                            title="Waiting for them to click the invite link"
                          >
                            <Clock size={10} strokeWidth={2.5} />
                            <span className="font-semibold">Pending invite</span>
                          </span>
                        )}
                        <span
                          className={clsx('flex items-center gap-0.5', hasPay ? 'text-lime-400' : 'text-ink-600')}
                          title={hasPay ? 'Has payment handle saved' : 'No payment handle yet'}
                        >
                          <Wallet size={10} /> {hasPay ? 'Pay set' : 'No pay yet'}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {/* "Claim as me" — visible only when this member is
                          unclaimed AND the signed-in user hasn't already
                          taken another seat in this trip. Always visible
                          (no hover gate) so it's discoverable on touch. */}
                      {!m.user_id && user && !userClaimed && (
                        <button
                          onClick={() => claimSlot.mutate(m.id)}
                          className="text-[11px] font-semibold text-lime-400 hover:text-lime-300 px-2 py-1 rounded border border-lime-400/30 hover:bg-lime-400/10 transition-colors"
                          title="Link this member to your account"
                          disabled={claimSlot.isPending}
                        >
                          That's me
                        </button>
                      )}
                      {onEditHandles && (
                        <button
                          onClick={() => onEditHandles(m)}
                          className="text-xs text-ink-500 hover:text-lime-400 px-2 py-1 rounded transition-colors"
                          title={`Edit ${m.name}'s payment handles`}
                        >
                          Edit pay
                        </button>
                      )}
                      {/* Remove stays hover-gated on desktop — it's destructive,
                          and we don't want a stray tap to nuke a friend's seat. */}
                      {isOwner && (
                        <button
                          onClick={() => {
                            if (window.confirm(`Remove ${m.name} from this trip?`)) removeMember.mutate(m.id)
                          }}
                          className="text-ink-600 hover:text-red-400 p-1 rounded transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
                          title="Remove from trip"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              {placeholders.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  {placeholders.map((m, i) => (
                    <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-ink-800/30 border border-dashed border-ink-700">
                      <div className="w-8 h-8 rounded-full bg-ink-800 border border-dashed border-ink-600 flex items-center justify-center flex-shrink-0">
                        <Hourglass size={12} className="text-ink-500" />
                      </div>
                      <div className="flex-1 text-sm text-ink-500 italic">Pending invite #{i + 1}</div>
                      {isOwner && (
                        <button
                          onClick={() => removeMember.mutate(m.id)}
                          className="text-ink-600 hover:text-red-400 p-1 rounded transition-colors"
                          title="Cancel this slot"
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {realMembers.length === 0 && placeholders.length === 0 && (
                <div className="px-3 py-4 text-center text-xs text-ink-500 italic">
                  No one's on this trip yet — add yourself first.
                </div>
              )}
            </div>
          </section>

          {/* ── Section 2: quick-add chips from your trip history ────────── */}
          {recent.length > 0 && (
            <section>
              <h3 className="text-[11px] font-semibold text-ink-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                Quick add from past trips
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {recent.map((p, i) => {
                  const isAlreadyOnTrip =
                    onTripNames.has((p.name || '').toLowerCase()) ||
                    (p.user_id && onTripUserIds.has(p.user_id))
                  const initials = (p.name || '?').split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
                  return (
                    <button
                      key={`${p.name}-${i}`}
                      onClick={() => !isAlreadyOnTrip && handleQuickAdd(p)}
                      disabled={isAlreadyOnTrip || addByHistory.isPending}
                      className={clsx(
                        'flex items-center gap-1.5 pr-2.5 pl-1 py-1 rounded-full border text-xs transition-all',
                        isAlreadyOnTrip
                          ? 'border-ink-700 bg-ink-800/50 text-ink-600 cursor-not-allowed'
                          : 'border-lime-400/30 bg-lime-400/5 text-ink-200 hover:bg-lime-400/15 hover:border-lime-400/50',
                      )}
                      title={isAlreadyOnTrip ? `${p.name} is already on this trip` : `Add ${p.name} from ${p.last_trip_name}`}
                    >
                      <span className={clsx(
                        'w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold',
                        MEMBER_COLOR(i),
                        isAlreadyOnTrip && 'opacity-40',
                      )}>
                        {initials}
                      </span>
                      <span className="font-medium">{p.name}</span>
                      {isAlreadyOnTrip
                        ? <Check size={10} className="text-ink-600" />
                        : <Plus size={10} className="text-lime-400" />
                      }
                    </button>
                  )
                })}
              </div>
              <p className="text-[10px] text-ink-600 mt-2">
                Tap someone to add them. We'll {recent.some((p) => p.user_id) ? 'auto-link their account if they joined a previous trip and ' : ''}carry over their saved Venmo / Cash App handles.
              </p>
            </section>
          )}

          {/* ── Section 3: add by name ──────────────────────────────────── */}
          <section>
            <h3 className="text-[11px] font-semibold text-ink-500 uppercase tracking-widest mb-2">
              Add someone new
            </h3>
            <form onSubmit={handleAddByName} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1 text-sm"
                  placeholder={!userClaimed ? 'Your name (then add your friends below)' : 'Their name (e.g. Anthony)'}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  autoFocus={realMembers.length === 0}
                />
                <button
                  type="submit"
                  className="btn-primary py-2 px-3 text-sm"
                  disabled={!newName.trim() || addByName.isPending}
                >
                  {addByName.isPending
                    ? <Loader size={13} className="animate-spin" />
                    : <><Plus size={13} /> Add</>}
              </button>
              </div>
              {/* "This is me" — only meaningful while the user hasn't claimed
                  any slot in this trip. Defaulted on; if Elle is adding a
                  friend first, she just unchecks. */}
              {user && !userClaimed && (
                <label className="flex items-center gap-2 text-xs text-ink-400 cursor-pointer select-none ml-1">
                  <input
                    type="checkbox"
                    className="accent-lime-400 cursor-pointer"
                    checked={claimAsSelf}
                    onChange={(e) => setClaimAsSelf(e.target.checked)}
                  />
                  This is me — link this name to my account
                </label>
              )}
            </form>
          </section>

          {/* ── Section 4: invite link with "expecting N people" ────────── */}
          {isOwner && (
            <section className="border-t border-ink-800 pt-5">
              <h3 className="text-[11px] font-semibold text-ink-500 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Link2 size={11} /> Or send an invite link
              </h3>
              <p className="text-xs text-ink-400 leading-relaxed mb-3">
                Sending the link is faster — friends sign up in 30 seconds and can add their own statements.
              </p>

              {!inviteUrl ? (
                <button
                  onClick={handleGetInviteLink}
                  disabled={getInviteLink.isPending}
                  className="btn-primary w-full justify-center text-sm"
                >
                  {getInviteLink.isPending
                    ? <><Loader size={13} className="animate-spin" /> Generating link…</>
                    : <><Link2 size={13} /> Get invite link</>}
                </button>
              ) : (
                <div className="space-y-2">
                  {/* Link box */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-ink-800 border border-ink-700">
                    <Link2 size={12} className="text-ink-500 flex-shrink-0" />
                    <span className="text-xs text-ink-200 font-mono truncate flex-1 min-w-0">
                      {inviteUrl.replace(/^https?:\/\//, '')}
                    </span>
                    <button
                      onClick={handleCopy}
                      className={clsx(
                        'flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded transition-all',
                        copied
                          ? 'bg-lime-400/15 text-lime-400'
                          : 'bg-ink-700 hover:bg-ink-600 text-ink-200',
                      )}
                    >
                      {copied ? <CheckCircle size={11} /> : <Copy size={11} />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  {/* Quick share row */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-ink-600 mr-0.5">Send via</span>
                    <button
                      onClick={shareWhatsApp}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 transition-colors"
                    >
                      <MessageCircle size={11} /> WhatsApp
                    </button>
                    <button
                      onClick={shareMessages}
                      className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:bg-blue-500/20 transition-colors"
                    >
                      <MessageCircle size={11} /> iMessage
                    </button>
                  </div>

                  {/* Anyone with the link can join — no need to "regenerate"
                      it; the backend keeps the same code across calls. */}
                  <p className="text-[11px] text-ink-500 mt-1">
                    Anyone with this link can join — share it freely.
                  </p>
                </div>
              )}
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-ink-800 flex-shrink-0">
          <button onClick={onClose} className="btn-ghost w-full justify-center text-sm">
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

// Tailwind-friendly color rotation for member avatars. Kept inline so this
// component stays self-contained — both TripOverview and PeopleSheet would
// otherwise have to import the same constant.
const MEMBER_COLORS = [
  'bg-lime-400 text-ink-950',
  'bg-green-400 text-ink-950',
  'bg-amber-400 text-ink-950',
  'bg-red-400 text-white',
  'bg-ink-600 text-ink-50',
]
function MEMBER_COLOR(i) {
  return MEMBER_COLORS[i % MEMBER_COLORS.length]
}
