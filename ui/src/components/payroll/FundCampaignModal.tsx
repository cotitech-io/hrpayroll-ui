import { Modal } from '../ui/modal'
import type { EmployerCampaign } from '../../hooks/useEmployerCampaigns'
import { FundCampaignForm } from './FundCampaignForm'

export function FundCampaignModal({
  campaign,
  onClose,
}: {
  campaign: EmployerCampaign | null
  onClose: () => void
}) {
  return (
    <Modal open={!!campaign} onClose={onClose} title={`Fund ${campaign?.campaignName ?? ''}`}>
      {campaign && <FundCampaignForm facadeAddress={campaign.facadeAddress} onSuccess={onClose} />}
    </Modal>
  )
}
