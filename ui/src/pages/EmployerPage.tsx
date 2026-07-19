import { useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { ConnectPrompt } from '../components/ConnectPrompt'
import { CampaignDeployedSummary } from '../components/payroll/CampaignDeployedSummary'
import { CampaignOwnerCheck } from '../components/payroll/CampaignOwnerCheck'
import { CreatePayroll } from '../components/payroll/CreatePayroll'
import { DeployProgressModal } from '../components/payroll/DeployProgressModal'
import { ListPayroll } from '../components/payroll/ListPayroll'
import { EmployerNeedsFunding } from '../components/employer/EmployerNeedsFunding'
import { EmployerOverview } from '../components/employer/EmployerOverview'
import { useCreateCampaign, type CreateCampaignResult } from '../hooks/useCreateCampaign'

function EmployerCreate() {
  const { isUnlocked } = usePrivateUnlock()
  const [result, setResult] = useState<CreateCampaignResult | null>(null)
  const [deployedName, setDeployedName] = useState('')
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false)
  const [deployStages, setDeployStages] = useState<string[]>([])
  const createCampaign = useCreateCampaign((s) => setDeployStages((prev) => [...prev, s]))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Create payroll</h1>
        <p className="mt-1 text-sm text-slate-500">
          Deploy a new payroll run and register employee commitments on-chain.
        </p>
      </div>

      <CampaignOwnerCheck />

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

function EmployerRuns() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Payroll runs</h1>
        <p className="mt-1 text-sm text-slate-500">
          All payroll campaigns you deployed from this wallet.
        </p>
      </div>
      <ListPayroll />
    </div>
  )
}

export function EmployerPage() {
  const { isConnected } = useAccount()
  const { pathname } = useLocation()

  if (!isConnected) {
    return <ConnectPrompt message="Connect a wallet to create or fund a payroll." />
  }

  // Nested routes via Outlet when using React Router nested setup; also support
  // direct path matching so a single parent route can render section pages.
  if (pathname === '/employer' || pathname === '/employer/') {
    return <EmployerOverview />
  }
  if (pathname.startsWith('/employer/runs')) {
    return <EmployerRuns />
  }
  if (pathname.startsWith('/employer/create')) {
    return <EmployerCreate />
  }
  if (pathname.startsWith('/employer/needs-funding')) {
    return <EmployerNeedsFunding />
  }

  return <Outlet />
}
