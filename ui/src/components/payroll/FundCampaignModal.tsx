import { Modal } from '../ui/modal'
import type { OrganizationCampaign } from '../../hooks/useOrganizationCampaigns'
import { FundCampaignForm } from './FundCampaignForm'

export function FundCampaignModal({
  campaign,
  onClose,
}: {
  campaign: OrganizationCampaign | null
  onClose: () => void
}) {
  return (
    <Modal open={!!campaign} onClose={onClose} title={`Fund ${campaign?.campaignName ?? ''}`}>
      {campaign && <FundCampaignForm facadeAddress={campaign.facadeAddress} onSuccess={onClose} />}
    </Modal>
  )
}
