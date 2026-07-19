import { useState } from 'react'
import { useAccount } from 'wagmi'
import { InlineError } from '../InlineError'
import { Button } from '../ui/button'
import { useVaultCampaignRosters, type VaultCampaignRoster } from '../../hooks/useVaultCampaignRosters'
import type { ClaimPackage } from '../../lib/claimPackage'
import { formatPMtt, shortAddr } from '../../lib/format'
import { ClaimPackagesModal } from './ClaimPackagesModal'

/** Lists vault campaigns; opens a roster modal so the employee can copy claim-package JSON. */
export function ClaimPackageBrowser({
  onSelectPackage,
}: {
  onSelectPackage: (pkg: ClaimPackage) => void
}) {
  const { address } = useAccount()
  const rosters = useVaultCampaignRosters()
  const [selected, setSelected] = useState<VaultCampaignRoster | null>(null)
  const [mineOnly, setMineOnly] = useState(true)

  const campaigns = (rosters.data ?? []).filter((c) => {
    if (!mineOnly || !address) return true
    return c.rows.some((r) => r.recipient.toLowerCase() === address.toLowerCase())
  })

  return (
    <section style={{ margin: '1.25rem 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>Claim packages</h2>
        <label style={{ fontSize: '0.85rem', opacity: 0.8 }}>
          <input
            type="checkbox"
            checked={mineOnly}
            onChange={(e) => setMineOnly(e.target.checked)}
            style={{ marginRight: '0.35rem' }}
          />
          Only campaigns that include my address
        </label>
      </div>
      <p style={{ opacity: 0.75, fontSize: '0.9rem' }}>
        Open a campaign to see the roster and copy the claim-package JSON for your index.
      </p>

      {rosters.isLoading && <p>Loading campaigns…</p>}
      {rosters.error && <InlineError>{(rosters.error as Error).message}</InlineError>}
      {!rosters.isLoading && campaigns.length === 0 && (
        <p style={{ opacity: 0.7 }}>
          {mineOnly
            ? 'No vault campaigns register your connected address. Uncheck the filter to browse all.'
            : 'No campaigns with a registered roster found on this vault.'}
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignItems: 'flex-start' }}>
        {campaigns.map((c) => {
          const myRows = address
            ? c.rows.filter((r) => r.recipient.toLowerCase() === address.toLowerCase())
            : []
          const subtitle =
            myRows.length > 0
              ? `your index ${myRows.map((r) => r.index).join(', ')} · ${
                  myRows[0].amount !== undefined ? `${formatPMtt(myRows[0].amount)} pMTT` : 'amount unknown'
                }`
              : `${c.rows.length} recipient(s)`
          return (
            <Button
              key={c.facadeAddress}
              type="button"
              variant="outline"
              onClick={() => setSelected(c)}
            >
              runId {c.runId.toString()} ({shortAddr(c.facadeAddress)}) — {subtitle}
              {c.poolCreditedTotal > 0n ? ' · funded' : ''}
            </Button>
          )
        })}
      </div>

      <ClaimPackagesModal
        campaign={selected}
        onClose={() => setSelected(null)}
        highlightRecipient={address}
        onSelectPackage={(pkg) => {
          onSelectPackage(pkg)
          setSelected(null)
        }}
      />
    </section>
  )
}
