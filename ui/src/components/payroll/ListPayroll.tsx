import { useState } from 'react'
import { Wallet, Clock, Calendar, Hash } from 'lucide-react'
import { AddressLink } from '../AddressLink'
import { InlineError } from '../InlineError'
import { Button } from '../ui/button'
import { useOrganizationCampaigns, type OrganizationCampaign } from '../../hooks/useOrganizationCampaigns'
import { ExportClaimPackagesModal } from './ExportClaimPackagesModal'
import { FundCampaignModal } from './FundCampaignModal'

function Chip({ icon, children }: { icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/5 bg-white/[0.04] px-2.5 py-1 text-xs text-slate-300">
      {icon}
      <span className="truncate">{children}</span>
    </span>
  )
}

function formatDate(ts: number) {
  if (!ts) return '—'
  return new Date(ts * 1000).toLocaleDateString(undefined, {
    month: 'short',
    day: '2-digit',
    year: '2-digit',
  })
}

function CampaignCard({
  campaign,
  onFund,
  onExport,
}: {
  campaign: OrganizationCampaign
  onFund: () => void
  onExport: () => void
}) {
  const funded = campaign.hasReceivedFunds
  const expired = campaign.hasExpired
  const progress = funded ? 100 : 0

  return (
    <div className="flex flex-col rounded-2xl border border-white/5 bg-[#151828] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.4)]">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-violet-500/20 to-indigo-500/10 text-violet-300">
          <Wallet className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-slate-500">Payroll run</p>
          <p className="mt-0.5 truncate text-lg font-semibold text-white">
            {campaign.campaignName || `Run #${campaign.runId.toString()}`}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          {expired ? (
            <span className="rounded-full bg-slate-500/15 px-2.5 py-1 text-xs font-medium text-slate-300">
              Expired
            </span>
          ) : (
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
              Active
            </span>
          )}
          {funded ? (
            <span className="rounded-full bg-indigo-500/15 px-2.5 py-1 text-xs font-medium text-indigo-300">
              Funded
            </span>
          ) : (
            <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-400">
              Not funded
            </span>
          )}
        </div>
      </div>

      {/* Chips */}
      <div className="mt-5 flex flex-wrap gap-2">
        <Chip icon={<Hash className="h-3 w-3" />}>#{campaign.runId.toString()}</Chip>
        <Chip>
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          Avalanche · Fuji
        </Chip>
        <Chip>
          <AddressLink address={campaign.facadeAddress} />
        </Chip>
        <Chip icon={<Calendar className="h-3 w-3" />}>Created: {formatDate(campaign.startTime)}</Chip>
        <Chip icon={<Clock className="h-3 w-3" />}>
          {campaign.expiration ? `Ends: ${formatDate(campaign.expiration)}` : 'No deadline'}
        </Chip>
      </div>

      {/* Bottom bar */}
      <div className="mt-5 flex items-center gap-3 rounded-2xl border border-white/5 bg-[#0f1120] p-3">
        <div className="min-w-0 flex-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/5">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-violet-400 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Funded: <span className="font-semibold text-white">{progress}%</span>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            type="button"
            size="sm"
            className="rounded-xl bg-orange-500 px-4 text-white hover:bg-orange-500/90"
            onClick={onFund}
          >
            Fund
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="rounded-xl border-white/10 bg-transparent text-white hover:bg-white/5"
            disabled={campaign.packages.length === 0}
            title={
              campaign.packages.length === 0
                ? 'Claim packages are only available in the browser that created this campaign.'
                : undefined
            }
            onClick={onExport}
          >
            Export
          </Button>
        </div>
      </div>
    </div>
  )
}

/** The connected organization's previous campaigns, with fund and claim-package-export actions. */
export function ListPayroll() {
  const { data: campaigns, isLoading, error } = useOrganizationCampaigns()
  const [fundingFor, setFundingFor] = useState<OrganizationCampaign | null>(null)
  const [exportingFor, setExportingFor] = useState<OrganizationCampaign | null>(null)

  if (isLoading) return <p className="text-sm text-slate-400">Loading your previous campaigns…</p>
  if (error) return <InlineError>{(error as Error).message}</InlineError>
  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-[#151828] px-5 py-10 text-center text-sm text-slate-300">
        No payroll runs yet. Create one to get started.
      </div>
    )
  }

  return (
    <>
      <div className="mb-4">
        <p className="text-sm text-slate-400">
          {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'} on{' '}
          <span className="inline-flex items-center gap-1.5 text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
            Avalanche Fuji
          </span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {campaigns.map((c) => (
          <CampaignCard
            key={c.facadeAddress}
            campaign={c}
            onFund={() => setFundingFor(c)}
            onExport={() => setExportingFor(c)}
          />
        ))}
      </div>

      <FundCampaignModal campaign={fundingFor} onClose={() => setFundingFor(null)} />
      <ExportClaimPackagesModal campaign={exportingFor} onClose={() => setExportingFor(null)} />
    </>
  )
}
