import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { ConnectPrompt } from '../components/ConnectPrompt'
import { ClaimAction } from '../components/claim/ClaimAction'
import { ClaimDetails } from '../components/claim/ClaimDetails'
import { ClaimPackageInput } from '../components/claim/ClaimPackageInput'
import { PTokenBalance } from '../components/claim/PTokenBalance'
import { avaxContracts, AVAX_CHAIN_ID } from '../config/contracts'
import type { ClaimPackage } from '../lib/claimPackage'

export function EmployeePage() {
  const { isConnected } = useAccount()
  const { isUnlocked, unlock } = usePrivateUnlock()
  const [pkg, setPkg] = useState<ClaimPackage | null>(null)

  const { data: alreadyClaimed } = useReadContract({
    address: pkg?.facadeAddress,
    abi: avaxContracts.payrollCampaignFacade.abi,
    functionName: 'hasClaimed',
    args: pkg ? [BigInt(pkg.index)] : undefined,
    chainId: AVAX_CHAIN_ID,
    query: { enabled: !!pkg?.facadeAddress },
  })

  if (!isConnected) {
    return <ConnectPrompt message="Connect a wallet to claim your payroll." />
  }

  return (
    <div>
      {!isUnlocked && (
        <p>
          <button type="button" onClick={unlock}>
            Unlock private access
          </button>{' '}
          — required before claiming (your amount is encrypted with your own key).
        </p>
      )}

      {isUnlocked && <PTokenBalance />}

      <ClaimPackageInput onChange={setPkg} />

      {pkg && (
        <div style={{ marginTop: '1rem' }}>
          <ClaimDetails pkg={pkg} alreadyClaimed={alreadyClaimed} />
          <ClaimAction pkg={pkg} disabled={!isUnlocked || alreadyClaimed === true} />
        </div>
      )}
    </div>
  )
}
