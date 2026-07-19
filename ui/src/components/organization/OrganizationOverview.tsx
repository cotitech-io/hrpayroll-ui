import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { AddressLink } from '../AddressLink'
import { InlineError } from '../InlineError'
import { Button } from '../ui/button'
import { ConnectPrompt } from '../ConnectPrompt'
import { useAccount } from 'wagmi'
import { useOrganizationCampaigns, type OrganizationCampaign } from '../../hooks/useOrganizationCampaigns'
import { FundCampaignModal } from '../payroll/FundCampaignModal'
import { cn } from '../../lib/utils'

function StatCard({
  label,
  value,
  hint,
  valueClassName,
}: {
  label: string
  value: number | string
  hint: string
  valueClassName?: string
}) {
  return (
    <div className="rounded-2xl border border-black/[0.04] bg-white px-5 py-4 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <p className="text-sm text-slate-500">{label}</p>
      <p className={cn('mt-1 text-3xl font-bold tracking-tight', valueClassName)}>{value}</p>
      <p className="mt-1 text-xs text-slate-400">{hint}</p>
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
    <div className="flex items-center gap-4 rounded-2xl border border-black/[0.04] bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">
        #{campaign.runId.toString()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-slate-900">{campaign.campaignName}</p>
        <p className="truncate text-xs text-slate-400">
          <AddressLink address={campaign.facadeAddress} />
        </p>
      </div>
      <div className="hidden items-center gap-2 sm:flex">
        <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
          Active
        </span>
        <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-600">
          Not funded
        </span>
      </div>
      <Button type="button" size="sm" className="rounded-xl px-4" onClick={onFund}>
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
    return <p className="text-sm text-slate-500">Loading your payroll runs…</p>
  }

  if (error) {
    return <InlineError>{(error as Error).message}</InlineError>
  }

  const all = campaigns ?? []
  const active = all.filter((c) => !c.hasExpired)
  const needsFunding = active.filter((c) => !c.hasReceivedFunds)
  const funded = all.filter((c) => c.hasReceivedFunds)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Overview</h1>
        <p className="mt-1 text-sm text-slate-500">
          Monitor payroll runs and keep active runs funded.
        </p>
      </div>

      {needsFunding.length > 0 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-orange-200/80 bg-[#FFF6ED] px-4 py-3.5 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <p className="text-sm text-slate-700">
              <span className="font-semibold text-slate-900">
                {needsFunding.length} active run{needsFunding.length === 1 ? '' : 's'} needs funding
              </span>
              . Employees on these runs will not be paid until you fund them.
            </p>
          </div>
          <Button
            type="button"
            asChild
            size="sm"
            className="shrink-0 rounded-xl bg-orange-500 text-white hover:bg-orange-500/90"
          >
            <Link to="/organization/needs-funding">Review runs</Link>
          </Button>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active runs"
          value={active.length}
          hint="live on-chain"
          valueClassName="text-emerald-600"
        />
        <StatCard
          label="Needs funding"
          value={needsFunding.length}
          hint="action required"
          valueClassName="text-orange-500"
        />
        <StatCard
          label="Funded runs"
          value={funded.length}
          hint="settled"
          valueClassName="text-[#1E29F6]"
        />
        <StatCard label="Total runs" value={all.length} hint="all time" valueClassName="text-slate-900" />
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Needs attention</h2>
          <Link
            to="/organization/runs"
            className="text-sm font-medium text-[#1E29F6] hover:underline"
          >
            View all payrolls →
          </Link>
        </div>

        {needsFunding.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-8 text-center text-sm text-slate-500">
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
