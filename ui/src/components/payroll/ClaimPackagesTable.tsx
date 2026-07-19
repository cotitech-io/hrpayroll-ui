import { Button } from '../ui/button'
import { downloadClaimPackage, type ClaimPackage } from '../../lib/claimPackage'
import { formatPMtt } from '../../lib/format'

/** Index/recipient/amount rows with per-package download, shared by the export modal and the post-deploy step. */
export function ClaimPackagesTable({
  packages,
  campaignName,
}: {
  packages: ClaimPackage[]
  campaignName: string
}) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left' }}>Index</th>
          <th style={{ textAlign: 'left' }}>Recipient</th>
          <th style={{ textAlign: 'left' }}>Amount</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {packages.map((pkg) => (
          <tr key={pkg.index}>
            <td>{pkg.index}</td>
            <td>{pkg.recipient}</td>
            <td>{formatPMtt(pkg.amount)}</td>
            <td>
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
