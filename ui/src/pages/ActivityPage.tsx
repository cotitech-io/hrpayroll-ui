import { useReadContracts } from 'wagmi'
import { sepoliaContracts, SEPOLIA_CHAIN_ID } from '../config/contracts'
import { useActivityFeed, type ActivityEvent } from '../hooks/useActivityFeed'

function describeEvent(e: ActivityEvent): string {
  switch (e.type) {
    case 'RunCreated':
      return `Run #${e.runId} created (payout token ${e.payoutToken})`
    case 'PayoutRequested':
      return `Claim submitted — run #${e.runId}, index ${e.index} (pending verify)`
    case 'PayoutCompleted':
      return `Payout completed — run #${e.runId}, index ${e.index}, to ${e.to}`
    case 'PayoutFailed':
      return `Payout failed — run #${e.runId}, index ${e.index} (error code ${e.errorCode})`
    case 'ClaimInstant':
      // amountCommitment only — no plaintext salary is ever emitted on-chain.
      return `Claim recorded — index ${e.index}, recipient ${e.recipient}${e.to !== e.recipient ? ` (sent to ${e.to})` : ''}`
    case 'Clawback':
      return `Admin clawback by ${e.admin} to ${e.to}`
  }
}

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
  const feed = useActivityFeed()

  return (
    <div>
      <h1>Activity</h1>
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

      <h2>Recent activity</h2>
      {feed.isLoading && <p>Scanning recent blocks for events…</p>}
      {feed.error && <p style={{ color: 'crimson' }}>Error: {(feed.error as Error).message}</p>}
      {feed.data && feed.data.length === 0 && <p style={{ opacity: 0.7 }}>No events in the last ~300k blocks.</p>}
      {feed.data && feed.data.length > 0 && (
        <ul>
          {feed.data.map((e) => (
            <li key={`${e.type}-${e.blockNumber}-${e.logIndex}`}>
              <code>#{e.blockNumber.toString()}</code> — {describeEvent(e)}
            </li>
          ))}
        </ul>
      )}
      <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
        Only scans the most recent ~300k blocks (public RPC caps a single eth_getLogs range at 50k;
        this fetches in chunks). Fine for a brand-new campaign, not a general-purpose full history view.
      </p>
    </div>
  )
}
