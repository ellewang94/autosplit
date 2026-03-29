import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { api } from '../api/client'
import { useAuth } from '../contexts/AuthContext'
import {
  Users, Upload, List, TrendingUp, ChevronRight, Zap, LayoutDashboard, Menu, X,
  MessageSquare, CheckCircle, Bug, Lightbulb, HelpCircle, LogOut, User, Shield,
} from 'lucide-react'
import clsx from 'clsx'


// ── Feedback Modal ─────────────────────────────────────────────────────────────
// A small modal the user can open anytime to send a bug report or feature request.
// Keeps the feedback loop tight during early rollout.
function FeedbackModal({ onClose, currentPage }) {
  const [type, setType] = useState('feature')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const submit = useMutation({
    mutationFn: () => api.submitFeedback(type, message, email || null, currentPage),
    onSuccess: () => setSubmitted(true),
  })

  const TYPES = [
    { value: 'bug',     label: 'Bug',            icon: Bug },
    { value: 'feature', label: 'Feature Request', icon: Lightbulb },
    { value: 'other',   label: 'Other',           icon: HelpCircle },
  ]

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm bg-ink-900 border border-ink-700 rounded-2xl shadow-2xl overflow-hidden animate-slide-up">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ink-800">
          <div className="flex items-center gap-2">
            <MessageSquare size={15} className="text-lime-400" />
            <span className="font-display font-semibold text-ink-100 text-sm">Give Feedback</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-ink-500 hover:text-ink-200 hover:bg-ink-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {submitted ? (
          // Success state
          <div className="px-5 py-8 text-center">
            <CheckCircle size={32} className="text-lime-400 mx-auto mb-3" strokeWidth={1.5} />
            <p className="font-display font-semibold text-ink-100 mb-1">Thanks!</p>
            <p className="text-sm text-ink-400">Your feedback helps make AutoSplit better.</p>
            <button
              className="btn-secondary mt-5 mx-auto"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        ) : (
          <div className="px-5 py-4 space-y-4">

            {/* Type selector */}
            <div>
              <label className="label mb-2">What kind of feedback?</label>
              <div className="grid grid-cols-3 gap-2">
                {TYPES.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setType(value)}
                    className={clsx(
                      'flex flex-col items-center gap-1.5 py-3 rounded-xl border-2 text-xs font-medium transition-all',
                      type === value
                        ? 'border-lime-400/60 bg-lime-400/5 text-lime-400'
                        : 'border-ink-700 text-ink-400 hover:border-ink-500 hover:text-ink-200'
                    )}
                  >
                    <Icon size={16} strokeWidth={1.75} />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="label mb-1.5">Tell us more</label>
              <textarea
                className="input w-full resize-none text-sm"
                rows={4}
                placeholder={
                  type === 'bug'
                    ? 'What happened? What did you expect to happen?'
                    : type === 'feature'
                    ? "What would make AutoSplit more useful for you?"
                    : "What's on your mind?"
                }
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                autoFocus
              />
            </div>

            {/* Email (optional) */}
            <div>
              <label className="label mb-1.5">
                Email <span className="text-ink-600 font-normal">(optional)</span>
              </label>
              <input
                type="email"
                className="input w-full text-sm"
                placeholder="reply@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-xs text-ink-600 mt-1.5">Only if you'd like a response</p>
            </div>

            {/* Submit */}
            <button
              className="btn-primary w-full justify-center"
              onClick={() => submit.mutate()}
              disabled={!message.trim() || submit.isPending}
            >
              {submit.isPending ? 'Sending…' : 'Send Feedback'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// Top-level navigation items (group-agnostic)
const TOP_NAV = [
  { to: '/groups', icon: Users, label: 'Trips' },
]

// Group-scoped navigation (appears when inside a group)
function GroupNav({ groupId, onNavigate }) {
  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
    enabled: !!groupId,
  })

  const links = [
    { to: `/groups/${groupId}`, icon: LayoutDashboard, label: 'Overview', exact: true },
    { to: `/groups/${groupId}/upload`, icon: Upload, label: 'Import Statement' },
    { to: `/groups/${groupId}/transactions`, icon: List, label: 'Transactions' },
    { to: `/groups/${groupId}/settlement`, icon: TrendingUp, label: 'Settlement' },
  ]

  return (
    <div className="mt-2">
      {/* Breadcrumb — trip name is a clickable link to the overview */}
      {group && (
        <div className="px-4 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-ink-400">
            <Link to="/groups" className="hover:text-ink-200 transition-colors" onClick={onNavigate}>
              Trips
            </Link>
            <ChevronRight size={10} className="text-ink-600" />
            <Link
              to={`/groups/${groupId}`}
              className="text-lime-400 font-medium truncate hover:text-lime-300 transition-colors"
              onClick={onNavigate}
            >
              {group.name}
            </Link>
          </div>
        </div>
      )}

      {/* Group nav */}
      <div className="px-2 space-y-0.5">
        {links.map(({ to, icon: Icon, label, exact }) => (
          <NavLink
            key={to}
            to={to}
            end={exact}
            onClick={onNavigate}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive
                ? 'bg-lime-400/10 text-lime-400 border border-lime-400/20'
                : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
            )}
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}
      </div>
    </div>
  )
}

// The sidebar nav content — shared between desktop and mobile
function SidebarContent({ groupId, onNavigate, onFeedback }) {
  const { user, signOut } = useAuth()

  return (
    <>
      {/* Logo */}
      <div className="px-5 py-5 border-b border-ink-800">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-lime-400 flex items-center justify-center">
            <Zap size={14} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <div>
            <div className="font-display text-lg font-semibold text-ink-50 leading-none">AutoSplit</div>
            <div className="text-[10px] text-ink-500 font-mono tracking-wider mt-0.5">v1.0 MVP</div>
          </div>
        </div>
      </div>

      {/* Top nav */}
      <nav className="flex-1 px-2 py-3 space-y-0.5">
        {TOP_NAV.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
              isActive && !groupId
                ? 'bg-lime-400/10 text-lime-400 border border-lime-400/20'
                : 'text-ink-300 hover:bg-ink-800 hover:text-ink-100'
            )}
          >
            <Icon size={16} strokeWidth={1.75} />
            {label}
          </NavLink>
        ))}

        {/* Group-scoped nav — appears when inside a group */}
        {groupId && (
          <>
            <div className="pt-3 pb-1">
              <div className="h-px bg-ink-800 mx-1" />
            </div>
            <GroupNav groupId={groupId} onNavigate={onNavigate} />
          </>
        )}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-ink-800 space-y-1.5">

        {/* Feedback button */}
        <button
          onClick={onFeedback}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-ink-400 hover:text-lime-400 hover:bg-lime-400/5 border border-transparent hover:border-lime-400/20 transition-all duration-150"
        >
          <MessageSquare size={13} strokeWidth={1.75} />
          Give Feedback
        </button>

        {/* Legal links — small and unobtrusive but must be present */}
        <div className="flex items-center gap-1 px-3">
          <Shield size={10} className="text-ink-700 flex-shrink-0" />
          <Link to="/privacy" className="text-[10px] text-ink-700 hover:text-ink-500 transition-colors font-mono">Privacy</Link>
          <span className="text-ink-800 text-[10px]">·</span>
          <Link to="/terms" className="text-[10px] text-ink-700 hover:text-ink-500 transition-colors font-mono">Terms</Link>
        </div>

        {/* User info + sign-out */}
        {user && (
          <div className="flex items-center gap-2 px-2 py-1.5">
            {/* Avatar circle showing first letter of email */}
            <div className="w-6 h-6 rounded-full bg-lime-400/15 border border-lime-400/30 flex items-center justify-center flex-shrink-0">
              <User size={11} className="text-lime-400" />
            </div>
            {/* Email — truncated if too long */}
            <span className="text-[11px] text-ink-500 font-mono truncate flex-1 min-w-0">
              {user.email}
            </span>
            {/* Sign-out button */}
            <button
              onClick={signOut}
              title="Sign out"
              className="flex-shrink-0 p-1 rounded-md text-ink-600 hover:text-ink-300 hover:bg-ink-800 transition-colors"
            >
              <LogOut size={12} />
            </button>
          </div>
        )}

      </div>
    </>
  )
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const location = useLocation()

  // Extract groupId from URL like /groups/3/transactions
  const match = location.pathname.match(/\/groups\/(\d+)/)
  const groupId = match ? match[1] : null

  // Close mobile sidebar whenever the route changes
  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  const closeSidebar = () => setSidebarOpen(false)

  return (
    <div className="flex min-h-screen bg-ink-950">

      {/* ── Mobile top bar ────────────────────────────────────────────────────
          Only visible on small screens (hidden on md and above).
          Contains the logo and a hamburger button to open the sidebar drawer.
      */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-50 bg-ink-950/95 backdrop-blur-sm border-b border-ink-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-lime-400 flex items-center justify-center">
            <Zap size={14} className="text-ink-950" strokeWidth={2.5} />
          </div>
          <div className="font-display text-lg font-semibold text-ink-50">AutoSplit</div>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-1.5 rounded-lg text-ink-300 hover:text-ink-100 hover:bg-ink-800 transition-colors"
          aria-label="Toggle menu"
        >
          {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* ── Mobile backdrop ───────────────────────────────────────────────────
          Dark overlay behind the sidebar drawer. Tapping it closes the drawer.
      */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={closeSidebar}
        />
      )}

      {/* ── Sidebar ───────────────────────────────────────────────────────────
          Desktop: always visible, part of the normal page flow (md:static)
          Mobile: fixed overlay that slides in from the left

          The trick: `md:static` overrides `fixed` on desktop, putting it back
          into the document flow so the main content sits beside it naturally.
      */}
      <aside className={clsx(
        'w-56 flex-shrink-0 border-r border-ink-800 flex flex-col bg-ink-950',
        // Mobile positioning: fixed overlay with slide animation
        'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-in-out',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        // Desktop: back to normal flow, always visible
        'md:static md:translate-x-0',
      )}>
        <SidebarContent groupId={groupId} onNavigate={closeSidebar} onFeedback={() => { setSidebarOpen(false); setFeedbackOpen(true) }} />
      </aside>

      {/* ── Main content ──────────────────────────────────────────────────────
          pt-14 pushes content below the mobile top bar (which is 56px tall).
          md:pt-0 removes that padding on desktop where there's no top bar.
          min-w-0 prevents flex children from overflowing the container.
      */}
      <main className="flex-1 overflow-auto pt-14 md:pt-0 min-w-0">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8 animate-fade-in">
          <Outlet />
        </div>
      </main>

      {/* Feedback modal — rendered at root level so it overlays everything */}
      {feedbackOpen && (
        <FeedbackModal
          onClose={() => setFeedbackOpen(false)}
          currentPage={location.pathname}
        />
      )}
    </div>
  )
}
