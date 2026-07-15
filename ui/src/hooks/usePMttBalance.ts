import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { usePrivacyBridgeUnlock, usePrivateTokenBalance } from '@coti-io/coti-wallet-plugin'
import { AVAX_CHAIN_ID, avaxContracts } from '../config/contracts'

// Fetches once as soon as private access unlocks (not continuously polled) — the balance only
// changes after a claim or fund action, not on a timer — plus an on-demand refresh.
export function usePMttBalance() {
  const { address } = useAccount()
  const { sessionAesKey } = usePrivacyBridgeUnlock()
  const { fetchPrivateBalance } = usePrivateTokenBalance()
  const [balance, setBalance] = useState<string | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function refresh() {
    if (!address || !sessionAesKey || isFetching) return
    setIsFetching(true)
    setError(null)
    // pMTT uses 18 decimals. Passing AVAX_CHAIN_ID forces a plain RPC read (withRpcFallback)
    // instead of routing through window.ethereum directly — without it, this call silently
    // depends on whatever network the wallet extension currently has *selected*, independent
    // of what our own UI/NetworkGuard shows, and returns "0.00" with no error if that's wrong.
    fetchPrivateBalance(address, sessionAesKey, avaxContracts.pToken.address, 256, 18, AVAX_CHAIN_ID)
      .then(setBalance)
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setIsFetching(false))
  }

  useEffect(() => {
    if (!address || !sessionAesKey) {
      setBalance(null)
      setError(null)
      return
    }
    let cancelled = false
    setIsFetching(true)
    setError(null)
    fetchPrivateBalance(address, sessionAesKey, avaxContracts.pToken.address, 256, 18, AVAX_CHAIN_ID)
      .then((result) => {
        if (!cancelled) setBalance(result)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setIsFetching(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, sessionAesKey])

  return { balance, isFetching, error, refresh, isUnlocked: !!sessionAesKey }
}
