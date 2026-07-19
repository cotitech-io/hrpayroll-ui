import { useState } from 'react'
import { useAccount } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { ConnectPrompt } from '../components/ConnectPrompt'
import { CampaignDeployedSummary } from '../components/payroll/CampaignDeployedSummary'
import { CampaignOwnerCheck } from '../components/payroll/CampaignOwnerCheck'
import { CreatePayroll } from '../components/payroll/CreatePayroll'
import { DeployProgressModal } from '../components/payroll/DeployProgressModal'
import { ListPayroll } from '../components/payroll/ListPayroll'
import { useCreateCampaign, type CreateCampaignResult } from '../hooks/useCreateCampaign'

export function EmployerPage() {
  const { isConnected } = useAccount()
  const { isUnlocked } = usePrivateUnlock()

  const [result, setResult] = useState<CreateCampaignResult | null>(null)
  const [deployedName, setDeployedName] = useState('')
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false)
  const [deployStages, setDeployStages] = useState<string[]>([])
  const createCampaign = useCreateCampaign((s) => setDeployStages((prev) => [...prev, s]))

  if (!isConnected) {
    return <ConnectPrompt message="Connect a wallet to create or fund a payroll." />
  }

  return (
    <div>
      <CampaignOwnerCheck />

      <ListPayroll />

      {/* Kept mounted (hidden) while the result panel shows so the roster and name
          survive "Start another campaign", matching the previous page-level state. */}
      <div hidden={!!result}>
        <CreatePayroll
          canDeploy={isUnlocked}
          isDeploying={createCampaign.isPending}
          onDeploy={({ roster, campaignName }) => {
            setDeployStages([])
            setIsDeployModalOpen(true)
            setDeployedName(campaignName)
            createCampaign.mutate({ roster, campaignName }, { onSuccess: (data) => setResult(data) })
          }}
        />
      </div>

      <DeployProgressModal
        open={isDeployModalOpen && !result}
        onClose={() => setIsDeployModalOpen(false)}
        stages={deployStages}
        isPending={createCampaign.isPending}
        error={createCampaign.error}
      />

      {result && (
        <CampaignDeployedSummary
          result={result}
          campaignName={deployedName}
          canFund={true}
          onReset={() => setResult(null)}
        />
      )}
    </div>
  )
}
