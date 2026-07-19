import { useQuery } from '@tanstack/react-query'
import { usePublicClient } from 'wagmi'
import { zeroAddress, type Hex } from 'viem'
import { AVAX_CHAIN_ID, avaxContracts } from '../config/contracts'
import { loadCampaign } from '../lib/campaignStorage'
import { toClaimPackage, withFacadeAddress, type ClaimPackage } from '../lib/claimPackage'
import { rebuildClaimPackagesFromCommitments } from '../lib/merkle'

export type RosterRow = {
  index: number
  recipient: Hex
  amountCommitment: Hex
  hasClaimed: boolean
  /** Plaintext amount when known from browser-local packages (create/import). */
  amount?: string
  /** Full claim package when amount is known (proofs rebuilt from on-chain commitments). */
  package?: ClaimPackage
}

export type VaultCampaignRoster = {
  runId: bigint
  facadeAddress: Hex
  campaignName: string
  hasExpired: boolean
  poolCreditedTotal: bigint
  rows: RosterRow[]
}

const MAX_ROSTER_SCAN = 64

async function readFacadeRoster(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  facade: Hex,
): Promise<Omit<RosterRow, 'amount' | 'package'>[]> {
  const { payrollCampaignFacade } = avaxContracts
  const rows: Omit<RosterRow, 'amount' | 'package'>[] = []
  for (let index = 0; index < MAX_ROSTER_SCAN; index++) {
    const [recipient, amountCommitment, hasClaimed] = await Promise.all([
      publicClient.readContract({
        address: facade,
        abi: payrollCampaignFacade.abi,
        functionName: 'registeredRecipient',
        args: [BigInt(index)],
      }),
      publicClient.readContract({
        address: facade,
        abi: payrollCampaignFacade.abi,
        functionName: 'amountCommitment',
        args: [BigInt(index)],
      }),
      publicClient.readContract({
        address: facade,
        abi: payrollCampaignFacade.abi,
        functionName: 'hasClaimed',
        args: [BigInt(index)],
      }),
    ])
    if (recipient === zeroAddress) break
    rows.push({
      index,
      recipient,
      amountCommitment,
      hasClaimed,
    })
  }
  return rows
}

function attachPackages(facade: Hex, chainRows: Omit<RosterRow, 'amount' | 'package'>[]): RosterRow[] {
  const stored = loadCampaign(facade)
  const amountByIndex = new Map<number, bigint>()
  for (const pkg of stored?.packages ?? []) {
    const withFacade = withFacadeAddress(pkg, facade)
    amountByIndex.set(withFacade.index, BigInt(withFacade.amount))
  }

  const canRebuild =
    chainRows.length > 0 && chainRows.every((row) => amountByIndex.has(row.index))

  if (!canRebuild) {
    return chainRows.map((row) => {
      const amount = amountByIndex.get(row.index)
      return {
        ...row,
        amount: amount !== undefined ? amount.toString() : undefined,
        package: undefined,
      }
    })
  }

  const rebuilt = rebuildClaimPackagesFromCommitments(
    chainRows.map((row) => ({
      index: row.index,
      recipient: row.recipient,
      amountCommitment: row.amountCommitment,
      amount: amountByIndex.get(row.index)!,
    })),
  )

  return chainRows.map((row, i) => ({
    ...row,
    amount: rebuilt[i].amount.toString(),
    package: toClaimPackage(rebuilt[i], facade),
  }))
}

/** Every vault-linked campaign facade with its on-chain roster (+ local package amounts when present). */
export function useVaultCampaignRosters() {
  const publicClient = usePublicClient({ chainId: AVAX_CHAIN_ID })

  return useQuery({
    queryKey: ['vault-campaign-rosters', avaxContracts.payrollVault.address],
    enabled: !!publicClient,
    queryFn: async (): Promise<VaultCampaignRoster[]> => {
      if (!publicClient) return []
      const { payrollVault, payrollCampaignFacade } = avaxContracts

      const nextRunId = await publicClient.readContract({ ...payrollVault, functionName: 'nextRunId' })
      if (nextRunId === 0n) return []

      const runIds = Array.from({ length: Number(nextRunId) }, (_, i) => BigInt(i))
      const runResults = await Promise.all(
        runIds.map((runId) => publicClient.readContract({ ...payrollVault, functionName: 'runs', args: [runId] })),
      )

      const facades = runIds
        .map((runId, i) => {
          const [, , facade, , , exists] = runResults[i]
          if (!exists || facade.toLowerCase() === zeroAddress) return null
          return { runId, facade: facade as Hex }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      const campaigns = await Promise.all(
        facades.map(async ({ runId, facade }) => {
          const [campaignName, hasExpired, poolCreditedTotal, chainRows] = await Promise.all([
            publicClient.readContract({
              address: facade,
              abi: payrollCampaignFacade.abi,
              functionName: 'campaignName',
            }),
            publicClient.readContract({
              address: facade,
              abi: payrollCampaignFacade.abi,
              functionName: 'hasExpired',
            }),
            publicClient.readContract({
              address: facade,
              abi: payrollCampaignFacade.abi,
              functionName: 'poolCreditedTotal',
            }),
            readFacadeRoster(publicClient, facade),
          ])
          return {
            runId,
            facadeAddress: facade,
            campaignName,
            hasExpired,
            poolCreditedTotal,
            rows: attachPackages(facade, chainRows),
          }
        }),
      )

      return campaigns
        .filter((c) => c.rows.length > 0)
        .sort((a, b) => (a.runId > b.runId ? -1 : 1))
    },
  })
}
