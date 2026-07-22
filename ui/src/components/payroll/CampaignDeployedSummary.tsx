import { Button } from '../ui/button'
import { Modal } from '../ui/modal'
import type { CreateCampaignResult } from '../../hooks/useCreateCampaign'
import { toClaimPackage } from '../../lib/claimPackage'
import { PTOKEN_DECIMALS } from '../../lib/format'
import { ClaimPackagesTable } from './ClaimPackagesTable'
import { FundCampaignForm } from './FundCampaignForm'

/** Post-deploy modal: facade details, fund step, and claim-package export. */
export function CampaignDeployedSummary({
  result,
  campaignName,
  canFund,
  onClose,
}: {
  result: CreateCampaignResult
  campaignName: string
  /** Private access unlocked — funding builds an encrypted ack IT. */
  canFund: boolean
  onClose: () => void
}) {
  const totalAmount = result.tree.packages.reduce((sum, pkg) => sum + pkg.amount, 0n)

  return (
    <Modal open title="Payroll deployed" onClose={onClose} width="640px">
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">Facade address</dt>
        <dd className="font-mono">{result.facadeAddress}</dd>
        <dt className="text-muted-foreground">Run ID</dt>
        <dd className="font-mono">{result.runId.toString()}</dd>
        <dt className="text-muted-foreground">Merkle root</dt>
        <dd className="break-all font-mono">{result.tree.root}</dd>
      </dl>

      <h3 className="mb-2 mt-6 font-semibold">3. Fund payroll</h3>
      <FundCampaignForm
        facadeAddress={result.facadeAddress}
        placeholder={(Number(totalAmount) / 10 ** PTOKEN_DECIMALS).toString()}
        disabled={!canFund}
        successMessage="Facade funded."
      />

      <h3 className="mb-2 mt-6 font-semibold">4. Export claim packages</h3>
      <ClaimPackagesTable
        packages={result.tree.packages.map((pkg) => toClaimPackage(pkg, result.facadeAddress))}
        campaignName={campaignName}
      />

      <Button type="button" variant="secondary" onClick={onClose} className="mt-4">
        Start a new payroll
      </Button>
    </Modal>
  )
}
