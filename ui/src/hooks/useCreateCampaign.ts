import { useMutation } from '@tanstack/react-query'
import { parseEventLogs, type Hex } from 'viem'
import {
  useAccount,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from 'wagmi'
import { usePrivacyBridgeUnlock } from '@coti-io/coti-wallet-plugin'
import { AVAX_CHAIN_ID, COTI_TESTNET_CHAIN_ID, avaxContracts, cotiTestnetContracts } from '../config/contracts'
import { buildRegisterLeafIt } from '../lib/buildPayrollIt'
import { saveCampaign } from '../lib/campaignStorage'
import { toClaimPackage } from '../lib/claimPackage'
import { buildPayrollMerkleTree, type PayrollMerkleTree, type RosterEntry } from '../lib/merkle'
import { COTI_REGISTER_LEAF_GAS } from '../lib/podFees'

export type CreateCampaignParams = {
  roster: RosterEntry[]
  campaignName: string
  /** Unix seconds. Defaults to ~1 minute ago so the campaign is immediately claimable. */
  campaignStartTime?: number
  /** Unix seconds, 0 = no expiration. */
  expiration?: number
  minFeeUSD?: bigint
}

export type CreateCampaignResult = {
  facadeAddress: Hex
  runId: bigint
  tree: PayrollMerkleTree
}

const LOG_PREFIX = '[useCreateCampaign]'

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, new Date().toISOString(), ...args)
}

async function logSwitchChain(
  switchChainAsync: ReturnType<typeof useSwitchChain>['switchChainAsync'],
  chainId: number,
) {
  const start = Date.now()
  log('switchChainAsync requested', { chainId })
  await switchChainAsync({ chainId })
  log('switchChainAsync resolved', { chainId, elapsedMs: Date.now() - start })
}

export function useCreateCampaign(onStage?: (stage: string) => void) {
  const { address } = useAccount()
  const { sessionAesKey } = usePrivacyBridgeUnlock()
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync } = useWriteContract()
  const { switchChainAsync } = useSwitchChain()
  const fujiClient = usePublicClient({ chainId: AVAX_CHAIN_ID })
  const cotiClient = usePublicClient({ chainId: COTI_TESTNET_CHAIN_ID })

  return useMutation({
    mutationFn: async (params: CreateCampaignParams): Promise<CreateCampaignResult> => {
      const stage = (s: string) => {
        log('stage:', s)
        onStage?.(s)
      }

      log('starting', { campaignName: params.campaignName, rosterSize: params.roster.length })

      if (!address) throw new Error('Connect a wallet first.')
      if (!sessionAesKey) throw new Error('Unlock private access first.')
      if (!fujiClient || !cotiClient) throw new Error('Missing chain clients.')
      if (params.roster.length === 0) throw new Error('Add at least one roster entry.')

      // The Fuji-side factory is permissionless, but the COTI-side registerRun/registerLeaf
      // below are still onlyOwner on PrivatePayrollCoti — gate up front on that owner so we
      // don't create an on-chain campaign whose roster we then can't register.
      stage('Checking campaign owner…')
      const cotiOwner = await cotiClient.readContract({
        ...cotiTestnetContracts.privatePayrollCoti,
        functionName: 'owner',
      })
      if (cotiOwner.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`Only the PrivatePayrollCoti owner (${cotiOwner}) can create campaigns.`)
      }

      stage('Building merkle tree…')
      const tree = buildPayrollMerkleTree(params.roster, sessionAesKey)

      const now = Math.floor(Date.now() / 1000)
      const campaignStartTime = params.campaignStartTime ?? now - 60
      const expiration = params.expiration ?? 0
      const minFeeUSD = params.minFeeUSD ?? 0n

      // One tx replaces the old facade-deploy + vault.createRun + facade.wirePayroll
      // sequence — the factory does all three. No fees are stored anywhere; fund/claim/
      // clawback pass live inbox/pToken quotes (podFees.ts) as wei on each send (iter10).
      stage('Creating campaign via factory…')
      const createHash = await writeContractAsync({
        ...avaxContracts.payrollCampaignFactory,
        functionName: 'createCampaign',
        args: [
          address,
          tree.root,
          avaxContracts.pToken.address,
          campaignStartTime,
          expiration,
          params.campaignName,
          minFeeUSD,
        ],
        chainId: AVAX_CHAIN_ID,
      })
      log('createCampaign tx submitted', { createHash })
      const createReceipt = await fujiClient.waitForTransactionReceipt({ hash: createHash })
      log('createCampaign tx mined', { status: createReceipt.status })
      if (createReceipt.status !== 'success') throw new Error(`createCampaign reverted (tx ${createHash}).`)
      const [campaignCreated] = parseEventLogs({
        abi: avaxContracts.payrollCampaignFactory.abi,
        eventName: 'CampaignCreated',
        logs: createReceipt.logs,
      })
      if (!campaignCreated) throw new Error('CampaignCreated event not found in the createCampaign receipt.')
      const facadeAddress = campaignCreated.args.facade
      const runId = campaignCreated.args.runId
      log('campaign created', { facadeAddress, runId: runId.toString() })

      // registerRun/registerLeaf validate against the roster on COTI itself — the wallet
      // must submit transactions there, which the NetworkGuard (hardcoded to Fuji as the
      // app's target network) doesn't know about. Expect a brief "wrong network" overlay
      // during this section; it clears once we switch back to Fuji below.
      // Re-asserted before every wallet write below, not just once up front — some wallets
      // silently drift back to the previously-active chain between prompts (e.g. after a
      // signMessageAsync round trip), and switchChainAsync is a no-op if already on target.
      stage('Switching to COTI testnet…')
      await logSwitchChain(switchChainAsync, COTI_TESTNET_CHAIN_ID)

      stage('Registering run on COTI…')
      await logSwitchChain(switchChainAsync, COTI_TESTNET_CHAIN_ID)
      const registerRunHash = await writeContractAsync({
        ...cotiTestnetContracts.privatePayrollCoti,
        functionName: 'registerRun',
        args: [runId, tree.root],
        chainId: COTI_TESTNET_CHAIN_ID,
      })
      log('registerRun tx submitted', { registerRunHash })
      const registerRunReceipt = await cotiClient.waitForTransactionReceipt({ hash: registerRunHash })
      log('registerRun tx mined', { status: registerRunReceipt.status })
      if (registerRunReceipt.status !== 'success') throw new Error(`registerRun reverted (tx ${registerRunHash}).`)

      for (const pkg of tree.packages) {
        stage(`Registering leaf ${pkg.index + 1}/${tree.packages.length} on COTI…`)
        const itAmount = await buildRegisterLeafIt({
          amount: pkg.amount,
          aesKey: sessionAesKey,
          signerAddress: address,
          signMessageAsync,
        })
        await logSwitchChain(switchChainAsync, COTI_TESTNET_CHAIN_ID)
        const registerLeafHash = await writeContractAsync({
          ...cotiTestnetContracts.privatePayrollCoti,
          functionName: 'registerLeaf',
          args: [runId, BigInt(pkg.index), pkg.recipient, pkg.amountCommitment, itAmount],
          chainId: COTI_TESTNET_CHAIN_ID,
          gas: COTI_REGISTER_LEAF_GAS,
        })
        log('registerLeaf (COTI) tx submitted', { index: pkg.index, registerLeafHash })
        const registerLeafReceipt = await cotiClient.waitForTransactionReceipt({ hash: registerLeafHash })
        log('registerLeaf (COTI) tx mined', { index: pkg.index, status: registerLeafReceipt.status })
        if (registerLeafReceipt.status !== 'success') {
          throw new Error(`registerLeaf on COTI reverted for index ${pkg.index} (tx ${registerLeafHash}).`)
        }
      }

      stage('Switching back to Avalanche Fuji…')
      await logSwitchChain(switchChainAsync, AVAX_CHAIN_ID)

      for (const pkg of tree.packages) {
        stage(`Registering leaf ${pkg.index + 1}/${tree.packages.length} on facade…`)
        await logSwitchChain(switchChainAsync, AVAX_CHAIN_ID)
        const registerFacadeHash = await writeContractAsync({
          address: facadeAddress,
          abi: avaxContracts.payrollCampaignFacade.abi,
          functionName: 'registerLeaf',
          args: [BigInt(pkg.index), pkg.recipient, pkg.amountCommitment],
          chainId: AVAX_CHAIN_ID,
        })
        log('registerLeaf (facade) tx submitted', { index: pkg.index, registerFacadeHash })
        const registerFacadeReceipt = await fujiClient.waitForTransactionReceipt({ hash: registerFacadeHash })
        log('registerLeaf (facade) tx mined', { index: pkg.index, status: registerFacadeReceipt.status })
        if (registerFacadeReceipt.status !== 'success') {
          throw new Error(`registerLeaf on facade reverted for index ${pkg.index} (tx ${registerFacadeHash}).`)
        }
      }

      // Persisted locally because nothing on-chain stores the roster/amounts — without this,
      // claim packages could only ever be exported once, in this same browser session.
      saveCampaign({
        facadeAddress,
        campaignName: params.campaignName,
        runId: runId.toString(),
        packages: tree.packages.map((pkg) => toClaimPackage(pkg, facadeAddress)),
      })
      log('done', { facadeAddress, runId: runId.toString() })

      return { facadeAddress, runId, tree }
    },
    onError: (error) => {
      log('mutation failed', error instanceof Error ? error.message : error)
    },
  })
}
