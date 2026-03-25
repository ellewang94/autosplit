import { useState, useEffect } from 'react'
import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  Users, Upload, List, TrendingUp, ChevronRight, Zap, LayoutDashboard, Menu, X,
} from 'lucide-react'
import clsx from 'clsx'

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
function SidebarContent({ groupId, onNavigate }) {
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
      <div className="px-4 py-3 border-t border-ink-800">
        <p className="text-xs text-ink-600 font-mono">No auth · No cloud</p>
        <p className="text-xs text-ink-600 font-mono">Your data stays local</p>
      </div>
    </>
  )
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const location = useLocation()

  // Extract groupId from URL like /groups/3/transactions
  const match = location.pathname.match(/\/groups\/(\d+)/)
  const groupId = match ? match[1] : null

  // Close mobile sidebar whenever the route changes
  // (user tapped a nav link — we're done with the drawer)
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
        <SidebarContent groupId={groupId} onNavigate={closeSidebar} />
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
    </div>
  )
}
