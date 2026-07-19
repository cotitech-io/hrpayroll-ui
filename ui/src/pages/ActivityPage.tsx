import { useActivityFeed, type ActivityEvent } from '../hooks/useActivityFeed'

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function describeEvent(e: ActivityEvent): string {
  switch (e.type) {
    case 'RunCreated':
      return `Run #${e.runId} created (payout token ${shortAddr(e.payoutToken)})`
    case 'PayoutRequested':
      return `Claim submitted — run #${e.runId}, index ${e.index} (pending verify)`
    case 'PayoutCompleted':
      return `Payout completed — run #${e.runId}, index ${e.index}, to ${shortAddr(e.to)}`
    case 'PayoutFailed':
      return `Payout failed — run #${e.runId}, index ${e.index} (error code ${e.errorCode})`
    case 'ClaimInstant':
      // amountCommitment only — no plaintext salary is ever emitted on-chain.
      return `Claim recorded — ${shortAddr(e.facade)} index ${e.index}, recipient ${shortAddr(e.recipient)}${e.to !== e.recipient ? ` (sent to ${shortAddr(e.to)})` : ''}`
    case 'Clawback':
      return `Admin clawback on ${shortAddr(e.facade)} by ${shortAddr(e.admin)} to ${shortAddr(e.to)}`
  }
}

export function ActivityPage() {
  const feed = useActivityFeed()

  return (
    <div>
      <h1>Activity</h1>
      <p style={{ opacity: 0.75 }}>
        Vault-wide feed across every factory-created campaign facade (plus vault payout lifecycle events).
      </p>

      <h2>Recent activity</h2>
      {feed.isLoading && <p>Scanning recent blocks for events…</p>}
      {feed.error && <p style={{ color: 'crimson' }}>Error: {(feed.error as Error).message}</p>}
      {feed.data && feed.data.length === 0 && <p style={{ opacity: 0.7 }}>No events in the last ~100k blocks.</p>}
      {feed.data && feed.data.length > 0 && (
        <ul>
          {feed.data.map((e) => (
            <li key={`${e.type}-${e.blockNumber}-${e.logIndex}-${'facade' in e ? e.facade : ''}`}>
              <code>#{e.blockNumber.toString()}</code> — {describeEvent(e)}
            </li>
          ))}
        </ul>
      )}
      <p style={{ opacity: 0.6, fontSize: '0.85rem' }}>
        Only scans the most recent ~100k blocks (public RPCs cap a single eth_getLogs range —
        Fuji&apos;s public endpoint allows only 2,048 at a time; this fetches in parallel chunks).
        Fine for a brand-new campaign, not a general-purpose full history view.
      </p>
    </div>
  )
}
