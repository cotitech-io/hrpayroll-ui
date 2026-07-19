import { useState } from 'react'
import { Button } from '../ui/button'
import { useEmployerCampaigns, type EmployerCampaign } from '../../hooks/useEmployerCampaigns'
import { ExportClaimPackagesModal } from './ExportClaimPackagesModal'
import { FundCampaignModal } from './FundCampaignModal'

/** The connected employer's previous campaigns, with fund and claim-package-export actions. */
export function ListPayroll() {
  const { data: campaigns, isLoading, error } = useEmployerCampaigns()
  const [fundingFor, setFundingFor] = useState<EmployerCampaign | null>(null)
  const [exportingFor, setExportingFor] = useState<EmployerCampaign | null>(null)

  if (isLoading) return <p style={{ opacity: 0.7 }}>Loading your previous campaigns…</p>
  if (error) return <p style={{ color: 'crimson' }}>{(error as Error).message}</p>
  if (!campaigns || campaigns.length === 0) return null

  return (
    <div className="bg-card border border-border rounded-lg p-4" style={{ marginBottom: '2rem' }}>
      <h2 className="font-bold" style={{ marginTop: 0, marginBottom: '1rem' }}>List Payroll</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Run ID</th>
            <th style={{ textAlign: 'left' }}>Name</th>
            <th style={{ textAlign: 'left' }}>Facade</th>
            <th style={{ textAlign: 'left' }}>Status</th>
            <th style={{ textAlign: 'left' }}>Funded</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.facadeAddress}>
              <td>{c.runId.toString()}</td>
              <td>{c.campaignName}</td>
              <td>
                <a
                  href={`https://testnet.snowtrace.io/address/${c.facadeAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {c.facadeAddress.slice(0, 6)}…{c.facadeAddress.slice(-4)}
                </a>
              </td>
              <td>{c.hasExpired ? 'Expired' : 'Active'}</td>
              <td>{c.hasReceivedFunds ? 'Funded' : 'Not funded'}</td>
              <td>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFundingFor(c)}
                  >
                    Fund
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={c.packages.length === 0}
                    title={c.packages.length === 0 ? 'Claim packages are only available in the browser that created this campaign.' : undefined}
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
