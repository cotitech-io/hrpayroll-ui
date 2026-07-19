import { Modal } from '../ui/modal'
import type { EmployerCampaign } from '../../hooks/useEmployerCampaigns'
import { withFacadeAddress } from '../../lib/claimPackage'
import { ClaimPackagesTable } from './ClaimPackagesTable'

export function ExportClaimPackagesModal({
  campaign,
  onClose,
}: {
  campaign: EmployerCampaign | null
  onClose: () => void
}) {
  return (
    <Modal
      open={!!campaign}
      onClose={onClose}
      title={`Claim packages — ${campaign?.campaignName ?? ''}`}
      width="720px"
    >
      {campaign && (
        <ClaimPackagesTable
          packages={campaign.packages.map((pkg) => withFacadeAddress(pkg, campaign.facadeAddress))}
          campaignName={campaign.campaignName}
        />
      )}
    </Modal>
  )
}
