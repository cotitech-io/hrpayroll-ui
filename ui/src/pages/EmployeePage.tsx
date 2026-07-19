import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount, useReadContract } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { ConnectPrompt } from '../components/ConnectPrompt'
import { ClaimAction } from '../components/claim/ClaimAction'
import { ClaimDetails } from '../components/claim/ClaimDetails'
import { ClaimPackageBrowser } from '../components/claim/ClaimPackageBrowser'
import { ClaimPackageInput } from '../components/claim/ClaimPackageInput'
import { PTokenBalance } from '../components/claim/PTokenBalance'
import { avaxContracts, AVAX_CHAIN_ID } from '../config/contracts'
import { claimPackageJson, type ClaimPackage } from '../lib/claimPackage'

export function EmployeePage() {
  const { isConnected } = useAccount()
  const { isUnlocked, unlock } = usePrivateUnlock()
  const [pkg, setPkg] = useState<ClaimPackage | null>(null)
  const [packageText, setPackageText] = useState('')

  const { data: alreadyClaimed } = useReadContract({
    address: pkg?.facadeAddress,
    abi: avaxContracts.payrollCampaignFacade.abi,
    functionName: 'hasClaimed',
    args: pkg ? [BigInt(pkg.index)] : undefined,
    chainId: AVAX_CHAIN_ID,
    query: { enabled: !!pkg?.facadeAddress },
  })

  function selectPackage(next: ClaimPackage) {
    const text = claimPackageJson(next)
    setPackageText(text)
    setPkg(next)
  }

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

      <ClaimPackageBrowser onSelectPackage={selectPackage} />

      <ClaimPackageInput value={packageText} onChange={(next, raw) => {
        setPkg(next)
        if (raw !== undefined) setPackageText(raw)
      }} />

      {pkg && (
        <div style={{ marginTop: '1rem' }}>
          <ClaimDetails pkg={pkg} alreadyClaimed={alreadyClaimed} />
          <p style={{ opacity: 0.75, fontSize: '0.9rem' }}>
            After claiming, vault-wide claim/payout events appear on{' '}
            <Link to="/">Activity</Link> (look for your address).
          </p>
          <ClaimAction pkg={pkg} disabled={!isUnlocked || alreadyClaimed === true} />
        </div>
      )}
    </div>
  )
}
