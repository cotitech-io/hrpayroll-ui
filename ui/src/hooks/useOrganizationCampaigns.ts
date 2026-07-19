import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import { zeroAddress, type Hex } from 'viem'
import { AVAX_CHAIN_ID, avaxContracts } from '../config/contracts'
import { loadCampaign } from '../lib/campaignStorage'
import { withFacadeAddress, type ClaimPackage } from '../lib/claimPackage'

export type OrganizationCampaign = {
  runId: bigint
  facadeAddress: Hex
  campaignName: string
  startTime: number
  expiration: number
  hasExpired: boolean
  // True once COTI has credited the pool (iter08 public marker). Matches employee claim
  // gating on poolCreditedTotal — not a Transfer-log scan (that hammered Fuji's public RPC).
  hasReceivedFunds: boolean
  // Only populated if this campaign was created in this same browser (see campaignStorage.ts)
  // — nothing on-chain stores the roster, so an older/other-device campaign has none.
  packages: ClaimPackage[]
}

// PayrollVault only indexes runs by id (RunCreated doesn't emit the facade address), so we
// walk runs(0..nextRunId) directly and read each facade's admin() to keep just the campaigns
// the connected wallet deployed. Plain per-call readContract rather than multicall — the
// wallet plugin's custom Fuji chain definition doesn't declare a multicall3 address, and this
// is a small, testnet-scale list where a few extra RPC round trips don't matter.
export function useOrganizationCampaigns() {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: AVAX_CHAIN_ID })

  return useQuery({
    queryKey: ['organization-campaigns', avaxContracts.payrollVault.address, address],
    enabled: !!publicClient && !!address,
    staleTime: 30_000,
    queryFn: async (): Promise<OrganizationCampaign[]> => {
      if (!publicClient || !address) return []
      const { payrollVault, payrollCampaignFacade } = avaxContracts

      const nextRunId = await publicClient.readContract({ ...payrollVault, functionName: 'nextRunId' })
      if (nextRunId === 0n) return []

      const runIds = Array.from({ length: Number(nextRunId) }, (_, i) => BigInt(i))
      const runResults = await Promise.all(
        runIds.map((runId) => publicClient.readContract({ ...payrollVault, functionName: 'runs', args: [runId] })),
      )

      const runs = runIds
        .map((runId, i) => {
          const [, , facade, startTime, expiration, exists] = runResults[i]
          if (!exists || facade.toLowerCase() === zeroAddress) return null
          return { runId, facade, startTime, expiration }
        })
        .filter((r): r is NonNullable<typeof r> => r !== null)

      if (runs.length === 0) return []

      const details = await Promise.all(
        runs.map(({ facade }) =>
          Promise.all([
            publicClient.readContract({ address: facade, abi: payrollCampaignFacade.abi, functionName: 'admin' }),
            publicClient.readContract({
              address: facade,
              abi: payrollCampaignFacade.abi,
              functionName: 'campaignName',
            }),
            publicClient.readContract({ address: facade, abi: payrollCampaignFacade.abi, functionName: 'hasExpired' }),
            publicClient.readContract({
              address: facade,
              abi: payrollCampaignFacade.abi,
              functionName: 'poolCreditedTotal',
            }),
          ]),
        ),
      )

      const campaigns: OrganizationCampaign[] = []
      runs.forEach(({ runId, facade, startTime, expiration }, i) => {
        const [admin, campaignName, hasExpired, poolCreditedTotal] = details[i]
        if (admin.toLowerCase() !== address.toLowerCase()) return
        campaigns.push({
          runId,
          facadeAddress: facade,
          campaignName,
          startTime,
          expiration,
          hasExpired,
          hasReceivedFunds: poolCreditedTotal > 0n,
          packages: (loadCampaign(facade)?.packages ?? []).map((pkg) => withFacadeAddress(pkg, facade)),
        })
      })

      return campaigns.sort((a, b) => (a.runId > b.runId ? -1 : 1))
    },
  })
}
