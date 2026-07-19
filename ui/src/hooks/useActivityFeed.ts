import { useQuery } from '@tanstack/react-query'
import { createPublicClient, getAbiItem, http, zeroAddress, type Hex } from 'viem'
import { avalancheFuji } from 'viem/chains'
import { getLogsChunked } from '../lib/getLogsChunked'
import { avaxContracts } from '../config/contracts'

export type ActivityEvent =
  | { type: 'RunCreated'; blockNumber: bigint; logIndex: number; runId: bigint; eligibilityRoot: `0x${string}`; payoutToken: `0x${string}` }
  | { type: 'PayoutRequested'; blockNumber: bigint; logIndex: number; requestId: `0x${string}`; runId: bigint; index: bigint }
  | { type: 'PayoutCompleted'; blockNumber: bigint; logIndex: number; requestId: `0x${string}`; runId: bigint; index: bigint; to: `0x${string}`; amount?: bigint }
  | { type: 'PayoutFailed'; blockNumber: bigint; logIndex: number; requestId: `0x${string}`; runId: bigint; index: bigint; errorCode: bigint }
  | { type: 'ClaimInstant'; blockNumber: bigint; logIndex: number; facade: Hex; index: bigint; recipient: `0x${string}`; amountCommitment: `0x${string}`; to: `0x${string}` }
  | { type: 'Clawback'; blockNumber: bigint; logIndex: number; facade: Hex; admin: `0x${string}`; to: `0x${string}`; amount?: bigint }

async function listCampaignFacades(): Promise<Hex[]> {
  const { payrollVault } = avaxContracts
  // Same public Fuji RPC as getLogsChunked — avoid the wallet-plugin transport.
  const client = createPublicClient({
    chain: avalancheFuji,
    transport: http('https://api.avax-test.network/ext/bc/C/rpc'),
  })
  const nextRunId = await client.readContract({ ...payrollVault, functionName: 'nextRunId' })
  if (nextRunId === 0n) return []

  const runs = await Promise.all(
    Array.from({ length: Number(nextRunId) }, (_, i) =>
      client.readContract({ ...payrollVault, functionName: 'runs', args: [BigInt(i)] }),
    ),
  )

  return runs
    .map((run) => run[2] as Hex)
    .filter((facade) => facade.toLowerCase() !== zeroAddress)
}

// Reads the vault + every campaign facade's event logs (no plaintext amounts anywhere —
// ClaimInstant only carries a commitment hash) and merges them into one chronological feed.
// Claims go through an async state machine: PayoutRequested fires when the claim tx mines,
// but the payout only really completes once PayoutCompleted (or PayoutFailed) fires from the
// COTI verify callback.
export function useActivityFeed() {
  return useQuery({
    queryKey: ['activity-feed', avaxContracts.payrollVault.address],
    queryFn: async (): Promise<ActivityEvent[]> => {
      const { payrollVault, payrollCampaignFacade } = avaxContracts
      const facades = await listCampaignFacades()

      const [runCreated, payoutRequested, payoutCompleted, payoutFailed, ...facadeLogSets] = await Promise.all([
        getLogsChunked({ address: payrollVault.address, event: getAbiItem({ abi: payrollVault.abi, name: 'RunCreated' }) }),
        getLogsChunked({ address: payrollVault.address, event: getAbiItem({ abi: payrollVault.abi, name: 'PayoutRequested' }) }),
        getLogsChunked({ address: payrollVault.address, event: getAbiItem({ abi: payrollVault.abi, name: 'PayoutCompleted' }) }),
        getLogsChunked({ address: payrollVault.address, event: getAbiItem({ abi: payrollVault.abi, name: 'PayoutFailed' }) }),
        ...facades.flatMap((facade) => [
          getLogsChunked({
            address: facade,
            event: getAbiItem({ abi: payrollCampaignFacade.abi, name: 'ClaimInstant' }),
          }).then((logs) => ({ kind: 'ClaimInstant' as const, facade, logs })),
          getLogsChunked({
            address: facade,
            event: getAbiItem({ abi: payrollCampaignFacade.abi, name: 'Clawback' }),
          }).then((logs) => ({ kind: 'Clawback' as const, facade, logs })),
        ]),
      ])

      const events: ActivityEvent[] = [
        ...runCreated.map((l: any) => ({ type: 'RunCreated' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
        ...payoutRequested.map((l: any) => ({ type: 'PayoutRequested' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
        ...payoutCompleted.map((l: any) => ({ type: 'PayoutCompleted' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
        ...payoutFailed.map((l: any) => ({ type: 'PayoutFailed' as const, blockNumber: l.blockNumber, logIndex: l.logIndex, ...l.args })),
      ]

      for (const entry of facadeLogSets as Array<
        | { kind: 'ClaimInstant'; facade: Hex; logs: any[] }
        | { kind: 'Clawback'; facade: Hex; logs: any[] }
      >) {
        if (entry.kind === 'ClaimInstant') {
          for (const l of entry.logs) {
            events.push({
              type: 'ClaimInstant',
              facade: entry.facade,
              blockNumber: l.blockNumber,
              logIndex: l.logIndex,
              ...l.args,
            })
          }
        } else {
          for (const l of entry.logs) {
            events.push({
              type: 'Clawback',
              facade: entry.facade,
              blockNumber: l.blockNumber,
              logIndex: l.logIndex,
              ...l.args,
            })
          }
        }
      }

      events.sort((a, b) => (b.blockNumber === a.blockNumber ? b.logIndex - a.logIndex : b.blockNumber > a.blockNumber ? 1 : -1))
      return events
    },
  })
}
