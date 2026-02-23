import { Outlet, NavLink, useParams, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import {
  Users, Upload, List, TrendingUp, ChevronRight, Zap,
} from 'lucide-react'
import clsx from 'clsx'

// Top-level navigation items (group-agnostic)
const TOP_NAV = [
  { to: '/groups', icon: Users, label: 'Groups' },
]

// Group-scoped navigation (appears when a group is selected)
function GroupNav({ groupId }) {
  const { data: group } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => api.getGroup(groupId),
    enabled: !!groupId,
  })

  const links = [
    { to: `/groups/${groupId}/upload`, icon: Upload, label: 'Import Statement' },
    { to: `/groups/${groupId}/transactions`, icon: List, label: 'Transactions' },
    { to: `/groups/${groupId}/settlement`, icon: TrendingUp, label: 'Settlement' },
  ]

  return (
    <div className="mt-2">
      {/* Group name breadcrumb */}
      {group && (
        <div className="px-4 mb-3">
          <div className="flex items-center gap-1.5 text-xs text-ink-400">
            <span>Groups</span>
            <ChevronRight size={10} className="text-ink-600" />
            <span className="text-lime-400 font-medium truncate">{group.name}</span>
          </div>
        </div>
      )}

      {/* Group nav */}
      <div className="px-2 space-y-0.5">
        {links.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
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

export default function Layout() {
  // Get groupId from URL params (nested routes expose this)
  const location = useLocation()
  // Extract groupId from URL like /groups/3/transactions
  const match = location.pathname.match(/\/groups\/(\d+)/)
  const groupId = match ? match[1] : null

  return (
    <div className="flex min-h-screen bg-ink-950">
      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside className="w-56 flex-shrink-0 border-r border-ink-800 flex flex-col">
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

          {/* Group-scoped nav */}
          {groupId && (
            <>
              <div className="pt-3 pb-1">
                <div className="h-px bg-ink-800 mx-1" />
              </div>
              <GroupNav groupId={groupId} />
            </>
          )}
        </nav>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-ink-800">
          <p className="text-xs text-ink-600 font-mono">No auth · No cloud</p>
          <p className="text-xs text-ink-600 font-mono">Your data stays local</p>
        </div>
      </aside>

      {/* ── Main content ───────────────────────────────────────── */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 animate-fade-in">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
