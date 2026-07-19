import { useState } from 'react'
import { Button } from '../ui/button'
import { copyClaimPackage, downloadClaimPackage, type ClaimPackage } from '../../lib/claimPackage'
import { formatPMtt } from '../../lib/format'

/** Index/recipient/amount rows with copy + download, shared by export modal and post-deploy. */
export function ClaimPackagesTable({
  packages,
  campaignName,
  hasClaimedByIndex,
}: {
  packages: ClaimPackage[]
  campaignName: string
  hasClaimedByIndex?: Record<number, boolean>
}) {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Index</th>
          <th style={{ textAlign: 'left' }}>Recipient</th>
          <th style={{ textAlign: 'left' }}>Amount</th>
          {hasClaimedByIndex && <th style={{ textAlign: 'left' }}>hasClaimed</th>}
          <th />
        </tr>
      </thead>
      <tbody>
        {packages.map((pkg) => (
          <tr key={pkg.index}>
            <td>{pkg.index}</td>
            <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{pkg.recipient}</td>
            <td>{formatPMtt(pkg.amount)} pMTT</td>
            {hasClaimedByIndex && <td>{String(hasClaimedByIndex[pkg.index] ?? false)}</td>}
            <td style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={async () => {
                  await copyClaimPackage(pkg)
                  setCopiedIndex(pkg.index)
                }}
              >
                {copiedIndex === pkg.index ? 'Copied' : 'Copy JSON'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => downloadClaimPackage(pkg, campaignName)}
              >
                Download
              </Button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
