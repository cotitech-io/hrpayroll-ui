import type { ReactNode } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Lock, Unlock } from 'lucide-react'
import { useAccount } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { CustomConnectButton } from './CustomConnectButton'
import { OrganizationSidebar } from './organization/OrganizationSidebar'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '../lib/utils'

function ViewToggle() {
  const { pathname } = useLocation()
  const organizationActive = pathname.startsWith('/organization')
  const employeeActive = pathname.startsWith('/employee')

  return (
    <div className="inline-flex rounded-full bg-slate-100/90 p-1 ring-1 ring-slate-200/80">
      <NavLink
        to="/employee"
        className={cn(
          'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
          employeeActive
            ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5'
            : 'text-slate-500 hover:text-slate-800',
        )}
      >
        Employee
      </NavLink>
      <NavLink
        to="/organization"
        className={cn(
          'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
          organizationActive
            ? 'bg-white text-slate-900 shadow-sm ring-1 ring-black/5'
            : 'text-slate-500 hover:text-slate-800',
        )}
      >
        Organization
      </NavLink>
    </div>
  )
}

function UnlockPrivateAccessButton() {
  const { isConnected } = useAccount()
  const { isUnlocked, isUnlocking, unlock, lock } = usePrivateUnlock()

  if (!isConnected) return null

  return (
    <button
      type="button"
      onClick={isUnlocked ? lock : unlock}
      disabled={isUnlocking}
      className={cn(
        'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-opacity disabled:opacity-60',
        isUnlocked
          ? 'bg-emerald-600 hover:bg-emerald-600/90'
          : 'bg-[#6D28D9] hover:bg-[#6D28D9]/90',
      )}
    >
      {isUnlocked ? <Unlock className="h-4 w-4 text-amber-200" /> : <Lock className="h-4 w-4 text-amber-300" />}
      {isUnlocking ? 'Unlocking…' : isUnlocked ? 'Private access unlocked' : 'Unlock private access'}
    </button>
  )
}

function CompactSidebar({ title, links }: { title: string; links: { to: string; label: string; end?: boolean }[] }) {
  return (
    <aside className="flex w-[240px] shrink-0 flex-col bg-[#071530] text-white">
      <div className="flex items-center gap-3 px-5 pb-6 pt-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#7C3AED] text-lg font-bold">
          C
        </div>
        <div className="leading-tight">
          <div className="text-base font-semibold tracking-tight">COTI Payroll</div>
          <div className="text-xs text-white/50">Avalanche · Fuji</div>
        </div>
      </div>
      <div className="px-4">
        <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/40">
          {title}
        </p>
        <nav className="flex flex-col gap-1">
          {links.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#1E29F6] text-white shadow-lg shadow-[#1E29F6]/30'
                    : 'text-white/70 hover:bg-white/5 hover:text-white',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="mt-auto p-4">
        <ThemeToggle />
      </div>
    </aside>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const isOrganization = pathname.startsWith('/organization')

  return (
    <div className="flex min-h-screen bg-[#F4F6FB] text-slate-900">
      {isOrganization ? (
        <OrganizationSidebar />
      ) : (
        <CompactSidebar
          title={pathname.startsWith('/employee') ? 'Employee' : 'App'}
          links={
            pathname.startsWith('/employee')
              ? [{ to: '/employee', label: 'My claims', end: true }]
              : [
                  { to: '/', label: 'Activity', end: true },
                  { to: '/employee', label: 'Employee' },
                  { to: '/organization', label: 'Organization' },
                ]
          }
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-slate-200/80 bg-white/80 px-6 py-3 backdrop-blur">
          <ViewToggle />
          <div className="flex items-center gap-3">
            <UnlockPrivateAccessButton />
            <CustomConnectButton />
            {isOrganization && <ThemeToggle />}
          </div>
        </header>
        <main className="flex-1 overflow-auto p-6 md:p-8">{children}</main>
      </div>
    </div>
  )
}
