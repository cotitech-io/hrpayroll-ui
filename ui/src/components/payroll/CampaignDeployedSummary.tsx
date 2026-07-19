import { Button } from '../ui/button'
import type { CreateCampaignResult } from '../../hooks/useCreateCampaign'
import { toClaimPackage } from '../../lib/claimPackage'
import { PTOKEN_DECIMALS } from '../../lib/format'
import { ClaimPackagesTable } from './ClaimPackagesTable'
import { FundCampaignForm } from './FundCampaignForm'

/** Post-deploy panel: facade details, fund step, and claim-package export. */
export function CampaignDeployedSummary({
  result,
  campaignName,
  canFund,
  onReset,
}: {
  result: CreateCampaignResult
  campaignName: string
  /** Private access unlocked — funding builds an encrypted ack IT. */
  canFund: boolean
  onReset: () => void
}) {
  const totalAmount = result.tree.packages.reduce((sum, pkg) => sum + pkg.amount, 0n)

  return (
    <div>
      <h2>Campaign deployed</h2>
      <dl>
        <dt>Facade address</dt>
        <dd>{result.facadeAddress}</dd>
        <dt>Run ID</dt>
        <dd>{result.runId.toString()}</dd>
        <dt>Merkle root</dt>
        <dd>{result.tree.root}</dd>
      </dl>

      <h2>3. Fund campaign</h2>
      <FundCampaignForm
        facadeAddress={result.facadeAddress}
        placeholder={(Number(totalAmount) / 10 ** PTOKEN_DECIMALS).toString()}
        disabled={!canFund}
        successMessage="Facade funded."
      />

      <h2>4. Export claim packages</h2>
      <ClaimPackagesTable
        packages={result.tree.packages.map((pkg) => toClaimPackage(pkg, result.facadeAddress))}
        campaignName={campaignName}
      />

      <Button type="button" variant="secondary" onClick={onReset} className="mt-4">
        Start another campaign
      </Button>
    </div>
  )
}
