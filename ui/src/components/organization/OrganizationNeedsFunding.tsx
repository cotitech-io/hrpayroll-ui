import { useState } from 'react'
import { useAccount } from 'wagmi'
import { Wallet, Clock, Calendar, Hash } from 'lucide-react'
import { AddressLink } from '../AddressLink'
import { InlineError } from '../InlineError'
import { ConnectPrompt } from '../ConnectPrompt'
import { Button } from '../ui/button'
import { useOrganizationCampaigns, type OrganizationCampaign } from '../../hooks/useOrganizationCampaigns'
import { FundCampaignModal } from '../payroll/FundCampaignModal'

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

function NeedsFundingCard({ campaign, onFund }: { campaign: OrganizationCampaign; onFund: () => void }) {
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
          <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-400">
            Active
          </span>
          <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-xs font-medium text-orange-400">
            Not funded
          </span>
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
              style={{ width: '0%' }}
            />
          </div>
          <p className="mt-1.5 text-xs text-slate-400">
            Funded: <span className="font-semibold text-white">0%</span>
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          className="shrink-0 rounded-xl bg-orange-500 px-4 text-white hover:bg-orange-500/90"
          onClick={onFund}
        >
          Fund
        </Button>
      </div>
    </div>
  )
}

export function OrganizationNeedsFunding() {
  const { isConnected } = useAccount()
  const { data: campaigns, isLoading, error } = useOrganizationCampaigns()
  const [fundingFor, setFundingFor] = useState<OrganizationCampaign | null>(null)

  if (!isConnected) {
    return <ConnectPrompt message="Connect a wallet to fund a payroll." />
  }
  if (isLoading) return <p className="text-sm text-slate-400">Loading runs that need funding…</p>
  if (error) return <InlineError>{(error as Error).message}</InlineError>

  const needsFunding = (campaigns ?? []).filter((c) => !c.hasExpired && !c.hasReceivedFunds)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Needs funding</h1>
        <p className="mt-1 text-sm text-slate-500">
          Active runs that have not received pToken yet. Fund them so employees can claim.
        </p>
      </div>

      {needsFunding.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#151828] px-5 py-10 text-center text-sm text-slate-300">
          No active runs need funding right now.
        </div>
      ) : (
        <>
          <div className="mb-4">
            <p className="text-sm text-slate-400">
              {needsFunding.length} run{needsFunding.length === 1 ? '' : 's'} need{needsFunding.length === 1 ? 's' : ''} funding on{' '}
              <span className="inline-flex items-center gap-1.5 text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                Avalanche Fuji
              </span>
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {needsFunding.map((c) => (
              <NeedsFundingCard key={c.facadeAddress} campaign={c} onFund={() => setFundingFor(c)} />
            ))}
          </div>
        </>
      )}

      <FundCampaignModal campaign={fundingFor} onClose={() => setFundingFor(null)} />
    </div>
  )
}
