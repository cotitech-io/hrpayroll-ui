import { useState } from 'react'
import { parseUnits, type Hex } from 'viem'
import { Button } from '../ui/button'
import { useFundCampaign } from '../../hooks/useFundCampaign'
import { PTOKEN_DECIMALS } from '../../lib/format'

// 0.1 AVAX reserve for the facade's own future inbox fees (ack/clawback round trips).
const DEFAULT_FACADE_ETH_TOPUP_WEI = 100_000_000_000_000_000n

/** Amount input + fund button + stage/error feedback, shared by the list modal and the post-deploy step. */
export function FundCampaignForm({
  facadeAddress,
  placeholder = '2500',
  disabled = false,
  successMessage,
  onSuccess,
}: {
  facadeAddress: Hex
  placeholder?: string
  /** Extra gate on top of the form's own empty/pending checks (e.g. private access locked). */
  disabled?: boolean
  /** Shown after a successful fund when the form stays mounted. */
  successMessage?: string
  onSuccess?: () => void
}) {
  const [amount, setAmount] = useState('')
  const [stage, setStage] = useState<string | null>(null)
  const fundCampaign = useFundCampaign(setStage)

  return (
    <>
      <label>
        Amount (pMTT)
        <input
          type="text"
          style={{ width: '100%' }}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={placeholder}
        />
      </label>
      <Button
        type="button"
        className="mt-2"
        disabled={disabled || !amount.trim() || fundCampaign.isPending}
        onClick={() =>
          fundCampaign.mutate(
            {
              facadeAddress,
              amount: parseUnits(amount || '0', PTOKEN_DECIMALS),
              facadeEthTopUpWei: DEFAULT_FACADE_ETH_TOPUP_WEI,
            },
            { onSuccess },
          )
        }
      >
        {fundCampaign.isPending ? 'Funding…' : 'Fund campaign'}
      </Button>
      {fundCampaign.isPending && stage && <p style={{ opacity: 0.7 }}>{stage}</p>}
      {fundCampaign.error && <p style={{ color: 'crimson' }}>{(fundCampaign.error as Error).message}</p>}
      {successMessage && fundCampaign.isSuccess && <p style={{ color: 'green' }}>{successMessage}</p>}
    </>
  )
}
