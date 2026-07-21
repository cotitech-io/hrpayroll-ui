import { useState } from 'react'
import { Link } from '@/lib/router-compat'
import { useAccount, useReadContract } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { Lock } from 'lucide-react'
import { ConnectPrompt } from '../components/ConnectPrompt'
import { Button } from '../components/ui/button'
import { ClaimAction } from '../components/claim/ClaimAction'
import { ClaimDetails } from '../components/claim/ClaimDetails'
import { ClaimPackageInput } from '../components/claim/ClaimPackageInput'
import { MyClaims } from '../components/claim/MyClaims'
import { PTokenBalance } from '../components/claim/PTokenBalance'
import { avaxContracts, AVAX_CHAIN_ID } from '../config/contracts'
import type { ClaimPackage } from '../lib/claimPackage'

export function EmployeePage() {
  const { isConnected } = useAccount()
  const { isUnlocked, unlock } = usePrivateUnlock()
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [pkg, setPkg] = useState<ClaimPackage | null>(null)

  const { data: alreadyClaimed } = useReadContract({
    address: pkg?.facadeAddress,
    abi: avaxContracts.payrollCampaignFacade.abi,
    functionName: 'hasClaimed',
    args: pkg ? [BigInt(pkg.index)] : undefined,
    chainId: AVAX_CHAIN_ID,
    query: { enabled: !!pkg?.facadeAddress && showAdvanced },
  })

  if (!isConnected) {
    return <ConnectPrompt message="Connect a wallet to claim your payroll." />
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Your claims</h1>
        <p className="mt-1 text-sm text-slate-500">
          Claim encrypted payroll payouts registered to your wallet.
        </p>
      </div>

      {!isUnlocked && (
        <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-[#151828] p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/20 to-orange-500/5 text-orange-400">
              <Lock className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white">Unlock private access</p>
              <p className="text-xs text-slate-400">
                Required before claiming — your claim amount is encrypted with your key.
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            className="rounded-xl bg-orange-500 px-4 text-white hover:bg-orange-500/90"
            onClick={unlock}
          >
            Unlock
          </Button>
        </div>
      )}

      {isUnlocked && (
        <div className="rounded-2xl border border-white/5 bg-[#151828] p-5 text-sm text-slate-300">
          <PTokenBalance />
        </div>
      )}

      <MyClaims unlocked={isUnlocked} />

      <p className="text-xs text-slate-500">
        Claim / payout events also show on{' '}
        <Link to="/" className="text-white hover:text-orange-400">
          Activity
        </Link>
        .
      </p>

      <details
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
        className="rounded-2xl border border-white/5 bg-[#151828] p-5"
      >
        <summary className="cursor-pointer text-sm font-semibold text-white">
          Advanced: paste claim-package JSON
        </summary>
        <p className="mt-2 text-xs text-slate-400">
          Only needed if you received a JSON file from your organization. Normal claims use the
          list above — wallet + amount, no JSON.
        </p>
        <div className="mt-4 space-y-3 text-sm text-slate-300">
          <ClaimPackageInput onChange={(next) => setPkg(next)} />
          {pkg && (
            <div className="space-y-3">
              <ClaimDetails pkg={pkg} alreadyClaimed={alreadyClaimed} />
              <ClaimAction pkg={pkg} disabled={!isUnlocked || alreadyClaimed === true} />
            </div>
          )}
        </div>
      </details>
    </div>
  )
}
