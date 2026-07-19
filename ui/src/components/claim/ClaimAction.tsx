import { useState } from 'react'
import { useClaimFlow } from '../../hooks/useClaimFlow'
import type { ClaimPackage } from '../../lib/claimPackage'
import { InlineError } from '../InlineError'

/** Optional payout-to input + claim button + claim status feedback. */
export function ClaimAction({ pkg, disabled }: { pkg: ClaimPackage; disabled: boolean }) {
  const [payoutTo, setPayoutTo] = useState('')
  const claim = useClaimFlow()

  return (
    <>
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
        disabled={disabled || claim.isPending}
        onClick={() => claim.mutate({ pkg, payoutTo: (payoutTo.trim() || undefined) as `0x${string}` | undefined })}
        style={{ marginTop: '0.75rem' }}
      >
        {claim.isPending ? 'Claiming…' : 'Claim'}
      </button>

      {claim.error && <InlineError>{(claim.error as Error).message}</InlineError>}
      {claim.data?.status === 'completed' && <p style={{ color: 'green' }}>Claim completed.</p>}
      {claim.data?.status === 'pending' && <p style={{ color: 'orange' }}>{claim.data.message}</p>}
    </>
  )
}
