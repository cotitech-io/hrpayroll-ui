import { useState } from 'react'
import { useAccount, useReadContract } from 'wagmi'
import { usePrivateUnlock, usePrivacyBridgeUnlock, usePrivateTokenBalance } from '@coti-io/coti-wallet-plugin'
import { avaxContracts, AVAX_CHAIN_ID } from '../config/contracts'
import { parseClaimPackage, type ClaimPackage } from '../lib/claimPackage'
import { useClaimFlow } from '../hooks/useClaimFlow'

function PTokenBalance() {
  const { address } = useAccount()
  const { sessionAesKey } = usePrivacyBridgeUnlock()
  const { fetchPrivateBalance } = usePrivateTokenBalance()
  const [balance, setBalance] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    if (!address || !sessionAesKey) return
    setIsFetching(true)
    setError(null)
    try {
      // pPUSD uses 6 decimals per the payroll port's own docs; 256-bit ciphertext storage
      // matches the ctUint256 balance type used throughout the payroll/pToken contracts.
      const result = await fetchPrivateBalance(address, sessionAesKey, avaxContracts.pToken.address, 256, 6)
      setBalance(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <p>
      pPUSD balance: <strong>{balance ?? '—'}</strong>{' '}
      <button type="button" onClick={refresh} disabled={!sessionAesKey || isFetching}>
        {isFetching ? 'Refreshing…' : 'Refresh balance'}
      </button>
      {error && <span style={{ color: 'crimson' }}> {error}</span>}
    </p>
  )
}

export function EmployeePage() {
  const { isConnected } = useAccount()
  const { isUnlocked, unlock } = usePrivateUnlock()
  const [pkgText, setPkgText] = useState('')
  const [pkg, setPkg] = useState<ClaimPackage | null>(null)
  const [parseError, setParseError] = useState<string | null>(null)
  const [payoutTo, setPayoutTo] = useState('')
  const claim = useClaimFlow()

  const { data: alreadyClaimed } = useReadContract({
    ...avaxContracts.payrollCampaignFacade,
    functionName: 'hasClaimed',
    args: pkg ? [BigInt(pkg.index)] : undefined,
    chainId: AVAX_CHAIN_ID,
    query: { enabled: !!pkg },
  })

  function handlePkgChange(text: string) {
    setPkgText(text)
    if (!text.trim()) {
      setPkg(null)
      setParseError(null)
      return
    }
    try {
      setPkg(parseClaimPackage(text))
      setParseError(null)
    } catch (e) {
      setPkg(null)
      setParseError(e instanceof Error ? e.message : String(e))
    }
  }

  if (!isConnected) {
    return (
      <div>
        <p>Connect a wallet to claim your payroll.</p>
      </div>
    )
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

      <label>
        Paste your claim package (JSON from your employer)
        <textarea
          rows={6}
          style={{ width: '100%', fontFamily: 'monospace' }}
          value={pkgText}
          onChange={(e) => handlePkgChange(e.target.value)}
          placeholder='{"index":0,"recipient":"0x...","amount":"2500","amountCommitment":"0x...","proof":["0x...",...]}'
        />
      </label>
      {parseError && <p style={{ color: 'crimson' }}>{parseError}</p>}

      {pkg && (
        <div style={{ marginTop: '1rem' }}>
          <dl>
            <dt>Index</dt>
            <dd>{pkg.index}</dd>
            <dt>Recipient</dt>
            <dd>{pkg.recipient}</dd>
            <dt>Amount</dt>
            <dd>{pkg.amount}</dd>
            <dt>Already claimed?</dt>
            <dd>{String(alreadyClaimed ?? '—')}</dd>
          </dl>

          <label>
            Send to a different address (optional — leave blank to claim to your own wallet)
            <input
              type="text"
              style={{ width: '100%' }}
              value={payoutTo}
              onChange={(e) => setPayoutTo(e.target.value)}
              placeholder="0x…"
            />
          </label>

          <button
            type="button"
            disabled={!isUnlocked || alreadyClaimed === true || claim.isPending}
            onClick={() => claim.mutate({ pkg, payoutTo: (payoutTo.trim() || undefined) as `0x${string}` | undefined })}
            style={{ marginTop: '0.75rem' }}
          >
            {claim.isPending ? 'Claiming…' : 'Claim'}
          </button>

          {claim.error && <p style={{ color: 'crimson' }}>{(claim.error as Error).message}</p>}
          {claim.data?.status === 'completed' && <p style={{ color: 'green' }}>Claim completed.</p>}
          {claim.data?.status === 'pending' && <p style={{ color: 'orange' }}>{claim.data.message}</p>}
        </div>
      )}
    </div>
  )
}
