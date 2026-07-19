import { useState } from 'react'
import { AddressLink } from '../AddressLink'
import { InlineError } from '../InlineError'
import { Button } from '../ui/button'
import { useEmployerCampaigns, type EmployerCampaign } from '../../hooks/useEmployerCampaigns'
import { ExportClaimPackagesModal } from './ExportClaimPackagesModal'
import { FundCampaignModal } from './FundCampaignModal'

/** The connected employer's previous campaigns, with fund and claim-package-export actions. */
export function ListPayroll() {
  const { data: campaigns, isLoading, error } = useEmployerCampaigns()
  const [fundingFor, setFundingFor] = useState<EmployerCampaign | null>(null)
  const [exportingFor, setExportingFor] = useState<EmployerCampaign | null>(null)

  if (isLoading) return <p className="text-sm text-slate-500">Loading your previous campaigns…</p>
  if (error) return <InlineError>{(error as Error).message}</InlineError>
  if (!campaigns || campaigns.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-10 text-center text-sm text-slate-500">
        No payroll runs yet. Create one to get started.
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-black/[0.04] bg-white shadow-[0_1px_3px_rgba(15,23,42,0.04)]">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3 font-medium">Run</th>
            <th className="px-4 py-3 font-medium">Name</th>
            <th className="px-4 py-3 font-medium">Facade</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Funded</th>
            <th className="px-4 py-3 font-medium" />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.facadeAddress} className="border-b border-slate-50 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-800">#{c.runId.toString()}</td>
              <td className="px-4 py-3 text-slate-800">{c.campaignName}</td>
              <td className="px-4 py-3 text-slate-500">
                <AddressLink address={c.facadeAddress} />
              </td>
              <td className="px-4 py-3">
                {c.hasExpired ? (
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                    Expired
                  </span>
                ) : (
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                    Active
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                {c.hasReceivedFunds ? (
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-[#1E29F6]">
                    Funded
                  </span>
                ) : (
                  <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-600">
                    Not funded
                  </span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    size="sm"
                    className="rounded-xl"
                    onClick={() => setFundingFor(c)}
                  >
                    Fund
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="rounded-xl"
                    disabled={c.packages.length === 0}
                    title={
                      c.packages.length === 0
                        ? 'Claim packages are only available in the browser that created this campaign.'
                        : undefined
                    }
                    onClick={() => setExportingFor(c)}
                  >
                    Export
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <FundCampaignModal campaign={fundingFor} onClose={() => setFundingFor(null)} />
      <ExportClaimPackagesModal campaign={exportingFor} onClose={() => setExportingFor(null)} />
    </div>
  )
}
