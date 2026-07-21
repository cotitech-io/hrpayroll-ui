import type { ReactNode } from 'react'
import { NavLink, useLocation } from '@/lib/router-compat'
import { Activity, Users, Building2, Lock, Unlock, ChevronRight } from 'lucide-react'
import { useAccount } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { CustomConnectButton } from './CustomConnectButton'
import { cn } from '../lib/utils'

type NavItem = { to: string; label: string; icon: typeof Activity; end?: boolean }

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Activity', icon: Activity, end: true },
  { to: '/employee', label: 'Employee', icon: Users },
  { to: '/organization', label: 'Organization', icon: Building2 },
]

function Sidebar() {
  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-white/5 bg-[#111422]">
      <div className="flex items-center gap-3 px-6 pt-6 pb-8">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-[#FF9100] to-[#FF5C00] shadow-[0_0_20px_rgba(255,145,0,0.35)]">
          <div className="h-3.5 w-3.5 rotate-45 border-2 border-white" />
        </div>
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight text-white">COTI Payroll</div>
          <div className="text-[11px] uppercase tracking-widest text-white/40">Avalanche · Fuji</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-4">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'relative flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-colors',
                isActive
                  ? 'text-white'
                  : 'text-white/60 hover:text-white hover:bg-white/[0.03]',
              )
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -skew-x-12 rounded-lg border-l-2 border-[#FF9100] bg-[#FF9100]/10"
                  />
                )}
                <Icon
                  className={cn('relative z-10 h-5 w-5', isActive ? 'text-[#FF9100]' : 'text-current')}
                />
                <span className="relative z-10">{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>

    </aside>
  )
}


function HeaderPrivateAccessSlot() {
  const { isConnected } = useAccount()
  const { isUnlocked, isUnlocking, unlock, lock } = usePrivateUnlock()

  if (!isConnected) {
    return (
      <div className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1.5 sm:flex">
        <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.7)]" />
        <span className="text-[11px] font-semibold uppercase tracking-wider text-white">
          Avalanche Fuji
        </span>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={isUnlocked ? lock : unlock}
      disabled={isUnlocking}
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-semibold uppercase tracking-wider transition-all disabled:opacity-60',
        isUnlocked
          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
          : 'border-[#FF9100]/30 bg-[#FF9100]/10 text-[#FF9100] hover:bg-[#FF9100]/20',
      )}
    >
      {isUnlocked ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
      {isUnlocking ? 'Unlocking…' : isUnlocked ? 'Private access on' : 'Private Access'}
    </button>
  )
}


function Breadcrumb() {
  const { pathname } = useLocation()
  const current =
    pathname === '/'
      ? 'All Activity'
      : pathname.startsWith('/employee')
        ? 'Employee'
        : pathname.startsWith('/organization')
          ? 'Organization'
          : 'Overview'

  return (
    <div className="flex items-center gap-2 text-sm text-white/50">
      <span className="cursor-default">Payroll</span>
      <ChevronRight className="h-4 w-4 opacity-50" />
      <span className="font-medium text-white">{current}</span>
    </div>
  )
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen w-full bg-[#0B0D17] text-white/70">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-20 items-center justify-between gap-4 border-b border-white/5 bg-[#0B0D17]/80 px-6 backdrop-blur-md md:px-8">
          <Breadcrumb />
          <div className="flex items-center gap-3">
            <HeaderPrivateAccessSlot />
            <CustomConnectButton />
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6 md:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  )
}
