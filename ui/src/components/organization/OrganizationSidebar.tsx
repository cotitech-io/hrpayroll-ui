import { NavLink } from '@/lib/router-compat'
import { LayoutDashboard, List, Plus, Gem } from 'lucide-react'
import { useAccount, useBalance } from 'wagmi'
import { avalancheFuji } from 'viem/chains'
import { cn } from '../../lib/utils'
import { shortAddr } from '../../lib/format'
import { useOrganizationCampaigns } from '../../hooks/useOrganizationCampaigns'

const navItems: {
  to: string
  end: boolean
  label: string
  icon: typeof LayoutDashboard
  badge?: boolean
}[] = [
  { to: '/organization', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/organization/runs', end: false, label: 'Payroll runs', icon: List },
  { to: '/organization/create', end: false, label: 'Create payroll', icon: Plus },
  { to: '/organization/needs-funding', end: false, label: 'Needs funding', icon: Gem, badge: true },
]

export function OrganizationSidebar() {
  const { address, isConnected } = useAccount()
  const { data: balance } = useBalance({ address, chainId: avalancheFuji.id })
  const { data: campaigns } = useOrganizationCampaigns()

  const needsFundingCount =
    campaigns?.filter((c) => !c.hasExpired && !c.hasReceivedFunds).length ?? 0

  const balanceLabel = balance
    ? `${Number.parseFloat(balance.formatted).toFixed(2)} ${balance.symbol}`
    : '—'

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
          Organization
        </p>
        <nav className="flex flex-col gap-1">
          {navItems.map(({ to, end, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#1E29F6] text-white shadow-lg shadow-[#1E29F6]/30'
                    : 'text-white/70 hover:bg-white/5 hover:text-white',
                )
              }
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="flex-1">{label}</span>
              {badge && needsFundingCount > 0 && (
                <span className="rounded-full bg-[#FF2D78] px-2 py-0.5 text-[11px] font-semibold leading-none text-white">
                  {needsFundingCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-4">
        <div className="rounded-2xl bg-white/[0.06] px-4 py-3 ring-1 ring-white/10">
          <p className="text-xs text-white/45">Wallet balance</p>
          <p className="mt-1 text-lg font-semibold tracking-tight">
            {isConnected ? balanceLabel : 'Connect wallet'}
          </p>
          {address && (
            <p className="mt-0.5 text-xs text-white/40">{shortAddr(address)}</p>
          )}
        </div>
      </div>
    </aside>
  )
}
