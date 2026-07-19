import { useQuery } from '@tanstack/react-query'
import { useAccount, usePublicClient } from 'wagmi'
import { getAbiItem, zeroAddress, type Hex } from 'viem'
import { AVAX_CHAIN_ID, avaxContracts } from '../config/contracts'
import { loadCampaign } from '../lib/campaignStorage'
import { withFacadeAddress, type ClaimPackage } from '../lib/claimPackage'
import { getLogsChunked } from '../lib/getLogsChunked'

export type EmployerCampaign = {
  runId: bigint
  facadeAddress: Hex
  campaignName: string
  startTime: number
  expiration: number
  hasExpired: boolean
  // Whether at least one pToken transfer has ever landed on the facade — a real on-chain
  // signal (Transfer.to), unlike "funded" itself which would require decrypting an encrypted
  // balance we have no key for.
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
export function useEmployerCampaigns() {
  const { address } = useAccount()
  const publicClient = usePublicClient({ chainId: AVAX_CHAIN_ID })

  return useQuery({
    queryKey: ['employer-campaigns', avaxContracts.payrollVault.address, address],
    enabled: !!publicClient && !!address,
    queryFn: async (): Promise<EmployerCampaign[]> => {
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
          ]),
        ),
      )

      // One scan for every facade at once — pToken is a single shared contract across all
      // campaigns, and Transfer.to is indexed, so this is cheap regardless of campaign count.
      const transferLogs = await getLogsChunked({
        address: avaxContracts.pToken.address,
        event: getAbiItem({ abi: avaxContracts.pToken.abi, name: 'Transfer' }),
      })
      const fundedFacades = new Set(
        transferLogs.map((log) => (log as unknown as { args: { to: Hex } }).args.to.toLowerCase()),
      )

      const campaigns: EmployerCampaign[] = []
      runs.forEach(({ runId, facade, startTime, expiration }, i) => {
        const [admin, campaignName, hasExpired] = details[i]
        if (admin.toLowerCase() !== address.toLowerCase()) return
        campaigns.push({
          runId,
          facadeAddress: facade,
          campaignName,
          startTime,
          expiration,
          hasExpired,
          hasReceivedFunds: fundedFacades.has(facade.toLowerCase()),
          packages: (loadCampaign(facade)?.packages ?? []).map((pkg) => withFacadeAddress(pkg, facade)),
        })
      })

      return campaigns.sort((a, b) => (a.runId > b.runId ? -1 : 1))
    },
  })
}
