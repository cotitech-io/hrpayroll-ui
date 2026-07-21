import { useState } from 'react'
import { NavLink } from '@/lib/router-compat'
import { cn } from '../lib/utils'
import { LayoutDashboard, List, Plus, Gem } from 'lucide-react'
import { useOrganizationCampaigns } from '../hooks/useOrganizationCampaigns'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { CampaignDeployedSummary } from '../components/payroll/CampaignDeployedSummary'
import { CampaignOwnerCheck } from '../components/payroll/CampaignOwnerCheck'
import { CreatePayroll } from '../components/payroll/CreatePayroll'
import { DeployProgressModal } from '../components/payroll/DeployProgressModal'
import { ListPayroll } from '../components/payroll/ListPayroll'
import { useCreateCampaign, type CreateCampaignResult } from '../hooks/useCreateCampaign'

const ORG_TABS = [
  { to: '/organization', end: true, label: 'Overview', icon: LayoutDashboard },
  { to: '/organization/runs', end: false, label: 'Payroll runs', icon: List },
  { to: '/organization/create', end: false, label: 'Create payroll', icon: Plus },
  { to: '/organization/needs-funding', end: false, label: 'Needs funding', icon: Gem, badge: true as const },
]

export function OrganizationTabs() {
  const { data: campaigns } = useOrganizationCampaigns()
  const needsFundingCount =
    campaigns?.filter((c) => !c.hasExpired && !c.hasReceivedFunds).length ?? 0
  return (
    <nav className="flex flex-wrap gap-1 rounded-2xl border border-white/5 bg-white/[0.03] p-1">
      {ORG_TABS.map(({ to, end, label, icon: Icon, badge }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors',
              isActive
                ? 'bg-[#FF9100]/15 text-[#FF9100]'
                : 'text-white/60 hover:bg-white/5 hover:text-white',
            )
          }
        >
          <Icon className="h-4 w-4" />
          <span>{label}</span>
          {badge && needsFundingCount > 0 && (
            <span className="ml-1 rounded-full bg-[#FF2D78] px-2 py-0.5 text-[10px] font-semibold leading-none text-white">
              {needsFundingCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  )
}

export function OrganizationCreate() {
  const { isUnlocked, requireUnlock } = usePrivateUnlock()
  const [result, setResult] = useState<CreateCampaignResult | null>(null)
  const [deployedName, setDeployedName] = useState('')
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false)
  const [deployStages, setDeployStages] = useState<string[]>([])
  const createCampaign = useCreateCampaign((s) => setDeployStages((prev) => [...prev, s]))

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Create payroll</h1>
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
            // Deploying needs the session AES key — if private access isn't
            // unlocked yet, requireUnlock runs the unlock flow first (silently
            // when possible) and only then runs the deploy, instead of making
            // the user unlock from the sidebar and click Deploy again.
            void requireUnlock(() => {
              setDeployStages([])
              setIsDeployModalOpen(true)
              setDeployedName(campaignName)
              createCampaign.mutate({ roster, campaignName }, { onSuccess: (data) => setResult(data) })
            })
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
          onClose={() => setResult(null)}
        />
      )}
    </div>
  )
}

export function OrganizationRuns() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Payroll runs</h1>
        <p className="mt-1 text-sm text-slate-500">
          All payroll campaigns you deployed from this wallet.
        </p>
      </div>
      <ListPayroll />
    </div>
  )
}
