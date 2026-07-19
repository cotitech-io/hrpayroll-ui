import { useState } from 'react'
import { useAccount } from 'wagmi'
import { AddressLink } from '../AddressLink'
import { InlineError } from '../InlineError'
import { ConnectPrompt } from '../ConnectPrompt'
import { Button } from '../ui/button'
import { useEmployerCampaigns, type EmployerCampaign } from '../../hooks/useEmployerCampaigns'
import { FundCampaignModal } from '../payroll/FundCampaignModal'

export function EmployerNeedsFunding() {
  const { isConnected } = useAccount()
  const { data: campaigns, isLoading, error } = useEmployerCampaigns()
  const [fundingFor, setFundingFor] = useState<EmployerCampaign | null>(null)

  if (!isConnected) {
    return <ConnectPrompt message="Connect a wallet to fund a payroll." />
  }
  if (isLoading) return <p className="text-sm text-slate-500">Loading runs that need funding…</p>
  if (error) return <InlineError>{(error as Error).message}</InlineError>

  const needsFunding = (campaigns ?? []).filter((c) => !c.hasExpired && !c.hasReceivedFunds)

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Needs funding</h1>
        <p className="mt-1 text-sm text-slate-500">
          Active runs that have not received pToken yet. Fund them so employees can claim.
        </p>
      </div>

      {needsFunding.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
          No active runs need funding right now.
        </div>
      ) : (
        <div className="space-y-2.5">
          {needsFunding.map((c) => (
            <div
              key={c.facadeAddress}
              className="flex items-center gap-4 rounded-2xl border border-black/[0.04] bg-white px-4 py-3.5 shadow-[0_1px_3px_rgba(15,23,42,0.04)]"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-700">
                #{c.runId.toString()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-900">{c.campaignName}</p>
                <p className="truncate text-xs text-slate-400">
                  <AddressLink address={c.facadeAddress} />
                </p>
              </div>
              <span className="hidden rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-600 sm:inline">
                Not funded
              </span>
              <Button type="button" size="sm" className="rounded-xl px-4" onClick={() => setFundingFor(c)}>
                Fund
              </Button>
            </div>
          ))}
        </div>
      )}

      <FundCampaignModal campaign={fundingFor} onClose={() => setFundingFor(null)} />
    </div>
  )
}
