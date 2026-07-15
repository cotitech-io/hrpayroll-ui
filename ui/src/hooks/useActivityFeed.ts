import { useQuery } from '@tanstack/react-query'
import { getAbiItem } from 'viem'
import { getLogsChunked } from '../lib/getLogsChunked'
import { avaxContracts } from '../config/contracts'

export type ActivityEvent =
  | { type: 'RunCreated'; blockNumber: bigint; logIndex: number; runId: bigint; eligibilityRoot: `0x${string}`; payoutToken: `0x${string}` }
  | { type: 'PayoutRequested'; blockNumber: bigint; logIndex: number; requestId: `0x${string}`; runId: bigint; index: bigint }
  | { type: 'PayoutCompleted'; blockNumber: bigint; logIndex: number; requestId: `0x${string}`; runId: bigint; index: bigint; to: `0x${string}` }
  | { type: 'PayoutFailed'; blockNumber: bigint; logIndex: number; requestId: `0x${string}`; runId: bigint; index: bigint; errorCode: bigint }
  | { type: 'ClaimInstant'; blockNumber: bigint; logIndex: number; index: bigint; recipient: `0x${string}`; amountCommitment: `0x${string}`; to: `0x${string}` }
  | { type: 'Clawback'; blockNumber: bigint; logIndex: number; admin: `0x${string}`; to: `0x${string}` }

// Reads the vault + facade event logs (no plaintext amounts anywhere — ClaimInstant only
// carries a commitment hash) and merges them into one chronological feed. Claims go through
// an async state machine: PayoutRequested fires when the claim tx mines, but the payout only
// really completes once PayoutCompleted (or PayoutFailed) fires from the COTI verify callback.
export function useActivityFeed() {
  return useQuery({
    queryKey: ['activity-feed', avaxContracts.payrollVault.address, avaxContracts.payrollCampaignFacade.address],
    queryFn: async (): Promise<ActivityEvent[]> => {
      const { payrollVault, payrollCampaignFacade } = avaxContracts

      const [runCreated, payoutRequested, payoutCompleted, payoutFailed, claimInstant, clawback] = await Promise.all([
        getLogsChunked({ address: payrollVault.address, event: getAbiItem({ abi: payrollVault.abi, name: 'RunCreated' }) }),
        getLogsChunked({ address: payrollVault.address, event: getAbiItem({ abi: payrollVault.abi, name: 'PayoutRequested' }) }),
        getLogsChunked({ address: payrollVault.address, event: getAbiItem({ abi: payrollVault.abi, name: 'PayoutCompleted' }) }),
        getLogsChunked({ address: payrollVault.address, event: getAbiItem({ abi: payrollVault.abi, name: 'PayoutFailed' }) }),
        getLogsChunked({ address: payrollCampaignFacade.address, event: getAbiItem({ abi: payrollCampaignFacade.abi, name: 'ClaimInstant' }) }),
        getLogsChunked({ address: payrollCampaignFacade.address, event: getAbiItem({ abi: payrollCampaignFacade.abi, name: 'Clawback' }) }),
      ])

      const events: ActivityEvent[] = [
        ...runCreated.map((l: any) => ({ type: 'RunCreated' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
        ...payoutRequested.map((l: any) => ({ type: 'PayoutRequested' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
        ...payoutCompleted.map((l: any) => ({ type: 'PayoutCompleted' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
        ...payoutFailed.map((l: any) => ({ type: 'PayoutFailed' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
        ...claimInstant.map((l: any) => ({ type: 'ClaimInstant' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
        ...clawback.map((l: any) => ({ type: 'Clawback' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
      ]

      events.sort((a, b) => (b.blockNumber === a.blockNumber ? b.logIndex - a.logIndex : b.blockNumber > a.blockNumber ? 1 : -1))
      return events
    },
  })
}
