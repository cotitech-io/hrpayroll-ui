import { useState } from 'react'
import { Link } from '@/lib/router-compat'
import {
  AlertTriangle,
  Wallet,
  Users,
  Zap,
  ArrowRight,
  Globe,
  Coins,
  Clock,
  Activity,
  CheckCircle2,
  ListChecks,
} from 'lucide-react'
import { AddressLink } from '../AddressLink'
import { InlineError } from '../InlineError'
import { Button } from '../ui/button'
import { ConnectPrompt } from '../ConnectPrompt'
import { useAccount } from 'wagmi'
import { useOrganizationCampaigns, type OrganizationCampaign } from '../../hooks/useOrganizationCampaigns'
import { FundCampaignModal } from '../payroll/FundCampaignModal'
import { cn } from '../../lib/utils'
import orbsBg from '../../assets/connect-orbs-bg.jpg'

/** Sablier-style hero stat card: icon badge top-left, big value, subtitle link/hint. */
function HeroStatCard({
  icon,
  value,
  hint,
  hintClassName,
}: {
  icon: React.ReactNode
  value: React.ReactNode
  hint: React.ReactNode
  hintClassName?: string
}) {
  return (
    <div className="relative flex min-h-[140px] flex-col justify-between overflow-hidden rounded-2xl border border-white/5 bg-[#151828] p-4 shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-white/90">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-black tracking-tight text-white">{value}</p>
        <p className={cn('mt-1 text-xs text-slate-400', hintClassName)}>{hint}</p>
      </div>
    </div>
  )
}

/** Sablier-style orb hero card with bottom action banner. */
function OrbHeroCard({
  message,
  to,
}: {
  message: string
  to: string
}) {
  return (
    <div className="relative min-h-[140px] overflow-hidden rounded-2xl border border-violet-500/25 bg-[#130d24] shadow-2xl shadow-violet-950/40 sm:col-span-2">
      <div
        className="pointer-events-none absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${orbsBg})` }}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#130d24]/80" />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 backdrop-blur-md">
          <Zap className="h-5 w-5 fill-white text-white" />
        </div>
        <Link
          to={to}
          className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-[#161225]/95 px-4 py-3 backdrop-blur-md transition-colors hover:bg-[#1c1730]/95"
        >
          <p className="flex-1 text-sm font-semibold leading-snug text-white sm:text-base">
            {message}
          </p>
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-600 text-white shadow-lg shadow-violet-600/30"
          >
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </div>
  )
}

/** Field cell used inside "Campaign" details grid: icon badge + label above value. */
function DetailField({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/5 bg-white/5 text-slate-300">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-400">{label}</p>
        <div className="mt-0.5 text-sm font-semibold text-white">{children}</div>
      </div>
    </div>
  )
}

function NeedsAttentionRow({
  campaign,
  onFund,
}: {
  campaign: OrganizationCampaign
  onFund: () => void
}) {
  return (
    <div className="flex items-center gap-4 rounded-2xl border border-white/5 bg-[#151828] px-4 py-3.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5 text-sm font-semibold text-slate-300">
        #{campaign.runId.toString()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-white">{campaign.campaignName}</p>
        <p className="truncate text-xs text-slate-500">
          <AddressLink address={campaign.facadeAddress} />
        </p>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
          Active
        </span>
        <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-400">
          Not funded
        </span>
      </div>
      <Button
        type="button"
        size="sm"
        className="rounded-xl bg-orange-500 px-4 text-white hover:bg-orange-500/90"
        onClick={onFund}
      >
        Fund
      </Button>
    </div>
  )
}

export function OrganizationOverview() {
  const { isConnected } = useAccount()
  const { data: campaigns, isLoading, error } = useOrganizationCampaigns()
  const [fundingFor, setFundingFor] = useState<OrganizationCampaign | null>(null)

  if (!isConnected) {
    return <ConnectPrompt message="Connect a wallet to create or fund a payroll." />
  }

  if (isLoading) {
    return <p className="text-sm text-slate-400">Loading your payroll runs…</p>
  }

  if (error) {
    return <InlineError>{(error as Error).message}</InlineError>
  }

  const all = campaigns ?? []
  const active = all.filter((c) => !c.hasExpired)
  const needsFunding = active.filter((c) => !c.hasReceivedFunds)
  const funded = all.filter((c) => c.hasReceivedFunds)
  const fundedPct = all.length === 0 ? 0 : Math.round((funded.length / all.length) * 100)

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Overview</h1>
        <p className="mt-1 text-sm text-slate-400">
          Monitor payroll runs and keep active runs funded.
        </p>
      </div>

      {/* Top hero row — mirrors Sablier's three-card banner */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <HeroStatCard
          icon={<Wallet className="h-6 w-6" />}
          value={<>Runs {all.length}</>}
          hint={active.length > 0 ? `${active.length} active on-chain` : 'no active runs'}
        />
        <HeroStatCard
          icon={<Users className="h-6 w-6" />}
          value={<>{funded.length} Funded</>}
          hint={
            <Link to="/organization/runs" className="hover:text-white hover:underline">
              View all payrolls ↗
            </Link>
          }
        />
        <OrbHeroCard
          message={
            needsFunding.length > 0
              ? `Review ${needsFunding.length} run${needsFunding.length === 1 ? '' : 's'} that need funding`
              : 'Create a new payroll run'
          }
          to={needsFunding.length > 0 ? '/organization/needs-funding' : '/organization/create'}
        />
      </div>

      {/* Two-column: Campaign details + Metrics sidebar */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="rounded-3xl border border-white/5 bg-[#151828] p-5 sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-white">Campaign</h2>
            <Link
              to="/organization/runs"
              className="text-sm font-medium text-white hover:text-orange-400 hover:underline"
            >
              Manage ↗
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField icon={<Globe className="h-5 w-5" />} label="Chain">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-orange-400" />
                Avalanche · Fuji
              </span>
            </DetailField>
            <DetailField icon={<Coins className="h-5 w-5" />} label="Token">
              pMTT (private)
            </DetailField>
            <DetailField icon={<Activity className="h-5 w-5" />} label="Active runs">
              <span className="text-emerald-400">{active.length}</span>
            </DetailField>
            <DetailField icon={<AlertTriangle className="h-5 w-5" />} label="Needs funding">
              <span className={needsFunding.length > 0 ? 'text-orange-400' : 'text-white'}>
                {needsFunding.length}
              </span>
            </DetailField>
            <DetailField icon={<CheckCircle2 className="h-5 w-5" />} label="Funded runs">
              <span className="text-indigo-300">{funded.length}</span>
            </DetailField>
            <DetailField icon={<ListChecks className="h-5 w-5" />} label="Total runs">
              {all.length}
            </DetailField>
          </div>
        </section>

        <aside className="rounded-3xl border border-white/5 bg-[#151828] p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-white">Metrics</h2>

          <div className="mt-5 grid grid-cols-2 gap-4">
            <div>
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" /> Active
              </p>
              <p className="mt-1 text-2xl font-bold text-white">{active.length}</p>
            </div>
            <div>
              <p className="flex items-center gap-1.5 text-xs text-slate-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Funded
              </p>
              <p className="mt-1 text-2xl font-bold text-white">{funded.length}</p>
            </div>
          </div>

          <div className="mt-6">
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400"
                style={{ width: `${fundedPct}%` }}
              />
            </div>
            <p className="mt-2 flex items-center justify-between text-xs text-slate-400">
              <span>Funded</span>
              <span className="font-semibold text-white">{fundedPct}%</span>
            </p>
          </div>
        </aside>
      </div>

      {/* Needs attention list */}
      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-white">Needs attention</h2>
          <Link
            to="/organization/runs"
            className="text-sm font-medium text-white hover:text-orange-400 hover:underline"
          >
            View all payrolls →
          </Link>
        </div>

        {needsFunding.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-[#151828] px-5 py-8 text-center text-sm text-slate-300">
            All active runs are funded. Nice work.
          </div>
        ) : (
          <div className="space-y-2.5">
            {needsFunding.map((c) => (
              <NeedsAttentionRow
                key={c.facadeAddress}
                campaign={c}
                onFund={() => setFundingFor(c)}
              />
            ))}
          </div>
        )}
      </section>

      <FundCampaignModal campaign={fundingFor} onClose={() => setFundingFor(null)} />
    </div>
  )
}
