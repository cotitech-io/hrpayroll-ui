import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { ConnectPrompt } from '../components/ConnectPrompt'
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
    <div>
      {!isUnlocked && (
        <p>
          <button type="button" onClick={unlock}>
            Unlock private access
          </button>{' '}
          — required before claiming (your claim amount is encrypted with your key).
        </p>
      )}

      {isUnlocked && <PTokenBalance />}

      <MyClaims unlocked={isUnlocked} />

      <p style={{ opacity: 0.75, fontSize: '0.9rem' }}>
        Claim / payout events also show on <Link to="/">Activity</Link>.
      </p>

      <details
        open={showAdvanced}
        onToggle={(e) => setShowAdvanced((e.target as HTMLDetailsElement).open)}
        style={{ marginTop: '1.5rem' }}
      >
        <summary style={{ cursor: 'pointer' }}>Advanced: paste claim-package JSON</summary>
        <p style={{ opacity: 0.75, fontSize: '0.85rem' }}>
          Only needed if you received a JSON file from your employer. Normal claims use the
          list above — wallet + amount, no JSON.
        </p>
        <ClaimPackageInput onChange={(next) => setPkg(next)} />
        {pkg && (
          <div style={{ marginTop: '1rem' }}>
            <ClaimDetails pkg={pkg} alreadyClaimed={alreadyClaimed} />
            <ClaimAction pkg={pkg} disabled={!isUnlocked || alreadyClaimed === true} />
          </div>
        )}
      </details>
    </div>
  )
}
