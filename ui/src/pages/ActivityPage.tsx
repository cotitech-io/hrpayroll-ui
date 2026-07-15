import { useReadContracts } from 'wagmi'
import { sepoliaContracts, SEPOLIA_CHAIN_ID } from '../config/contracts'

export function ActivityPage() {
  const { payrollCampaignFacade } = sepoliaContracts
  const { data, isLoading, error } = useReadContracts({
    contracts: [
      { ...payrollCampaignFacade, functionName: 'campaignName', chainId: SEPOLIA_CHAIN_ID },
      { ...payrollCampaignFacade, functionName: 'hasExpired', chainId: SEPOLIA_CHAIN_ID },
      { ...payrollCampaignFacade, functionName: 'CAMPAIGN_START_TIME', chainId: SEPOLIA_CHAIN_ID },
      { ...payrollCampaignFacade, functionName: 'EXPIRATION', chainId: SEPOLIA_CHAIN_ID },
      { ...payrollCampaignFacade, functionName: 'runId', chainId: SEPOLIA_CHAIN_ID },
    ],
  })

  return (
    <div>
      <h1>Activity</h1>
      <p>Live read from the deployed campaign facade on Sepolia — proves the provider/config wiring end to end.</p>
      {isLoading && <p>Loading campaign state…</p>}
      {error && <p style={{ color: 'crimson' }}>Error: {error.message}</p>}
      {data && (
        <dl>
          <dt>Campaign name</dt>
          <dd>{String(data[0].result ?? '—')}</dd>
          <dt>Expired</dt>
          <dd>{String(data[1].result ?? '—')}</dd>
          <dt>Start time</dt>
          <dd>{data[2].result ? new Date(Number(data[2].result) * 1000).toLocaleString() : '—'}</dd>
          <dt>Expiration</dt>
          <dd>{data[3].result ? new Date(Number(data[3].result) * 1000).toLocaleString() : '—'}</dd>
          <dt>Run ID</dt>
          <dd>{String(data[4].result ?? '—')}</dd>
        </dl>
      )}
      <p style={{ opacity: 0.7 }}>
        Full activity feed (claim events, funding history) is a Phase 1 item — this page currently just
        proves the read path works.
      </p>
    </div>
  )
}
