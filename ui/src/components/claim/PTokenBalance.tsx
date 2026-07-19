import { useState } from 'react'
import { useAccount } from 'wagmi'
import { usePrivacyBridgeUnlock, usePrivateTokenBalance } from '@coti-io/coti-wallet-plugin'
import { avaxContracts, AVAX_CHAIN_ID } from '../../config/contracts'

export function PTokenBalance() {
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
      // pMTT uses 18 decimals; 256-bit ciphertext storage matches the ctUint256 balance type
      // used throughout the payroll/pToken contracts. Passing AVAX_CHAIN_ID forces a plain RPC
      // read instead of routing through window.ethereum directly — without it, this call
      // silently depends on whatever network the wallet extension currently has *selected*
      // and returns "0.00" with no error if that's not Fuji.
      const result = await fetchPrivateBalance(address, sessionAesKey, avaxContracts.pToken.address, 256, 18, AVAX_CHAIN_ID)
      setBalance(result)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsFetching(false)
    }
  }

  return (
    <p style={{ marginBottom: '1rem' }}>
      <a
        href={`https://testnet.snowtrace.io/address/${avaxContracts.pToken.address}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        pMTT
      </a>{' '}
      balance: <strong>{balance ?? '—'}</strong>{' '}
      <button type="button" onClick={refresh} disabled={!sessionAesKey || isFetching}>
        {isFetching ? 'Refreshing…' : 'Refresh balance'}
      </button>
      {error && <span style={{ color: 'crimson' }}> {error}</span>}
    </p>
  )
}
