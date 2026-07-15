import { useMutation } from '@tanstack/react-query'
import { parseEventLogs, type Hex } from 'viem'
import {
  useAccount,
  useDeployContract,
  usePublicClient,
  useSignMessage,
  useSwitchChain,
  useWriteContract,
} from 'wagmi'
import { usePrivacyBridgeUnlock } from '@coti-io/coti-wallet-plugin'
import { AVAX_CHAIN_ID, COTI_TESTNET_CHAIN_ID, avaxContracts, cotiTestnetContracts } from '../config/contracts'
import { PayrollCampaignFacadeBytecode } from '../abis/PayrollCampaignFacadeBytecode'
import { buildRegisterLeafIt } from '../lib/buildPayrollIt'
import { buildPayrollMerkleTree, type PayrollMerkleTree, type RosterEntry } from '../lib/merkle'
import { computePTokenTwoWayFees, computePayrollWireFees } from '../lib/podFees'

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

export function useCreateCampaign(onStage?: (stage: string) => void) {
  const { address } = useAccount()
  const { sessionAesKey } = usePrivacyBridgeUnlock()
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync } = useWriteContract()
  const { deployContractAsync } = useDeployContract()
  const { switchChainAsync } = useSwitchChain()
  const fujiClient = usePublicClient({ chainId: AVAX_CHAIN_ID })
  const cotiClient = usePublicClient({ chainId: COTI_TESTNET_CHAIN_ID })

  return useMutation({
    mutationFn: async (params: CreateCampaignParams): Promise<CreateCampaignResult> => {
      const stage = (s: string) => onStage?.(s)

      if (!address) throw new Error('Connect a wallet first.')
      if (!sessionAesKey) throw new Error('Unlock private access first.')
      if (!fujiClient || !cotiClient) throw new Error('Missing chain clients.')
      if (params.roster.length === 0) throw new Error('Add at least one roster entry.')

      stage('Checking campaign owner…')
      const vaultOwner = await fujiClient.readContract({ ...avaxContracts.payrollVault, functionName: 'owner' })
      if (vaultOwner.toLowerCase() !== address.toLowerCase()) {
        throw new Error(`Only the payroll vault owner (${vaultOwner}) can create campaigns.`)
      }

      stage('Building merkle tree…')
      const tree = buildPayrollMerkleTree(params.roster, sessionAesKey)

      const now = Math.floor(Date.now() / 1000)
      const campaignStartTime = params.campaignStartTime ?? now - 60
      const expiration = params.expiration ?? 0
      const minFeeUSD = params.minFeeUSD ?? 0n

      stage('Deploying campaign facade…')
      const deployHash = await deployContractAsync({
        abi: avaxContracts.payrollCampaignFacade.abi,
        bytecode: PayrollCampaignFacadeBytecode,
        args: [
          address,
          avaxContracts.comptroller.address,
          tree.root,
          avaxContracts.pToken.address,
          campaignStartTime,
          expiration,
          params.campaignName,
          minFeeUSD,
        ],
        chainId: AVAX_CHAIN_ID,
      })
      const deployReceipt = await fujiClient.waitForTransactionReceipt({ hash: deployHash })
      const facadeAddress = deployReceipt.contractAddress
      if (!facadeAddress) throw new Error('Facade deployment did not return a contract address.')

      stage('Creating payroll run…')
      const createRunHash = await writeContractAsync({
        ...avaxContracts.payrollVault,
        functionName: 'createRun',
        args: [tree.root, avaxContracts.pToken.address, facadeAddress, campaignStartTime, expiration],
        chainId: AVAX_CHAIN_ID,
      })
      const createRunReceipt = await fujiClient.waitForTransactionReceipt({ hash: createRunHash })
      const [runCreated] = parseEventLogs({
        abi: avaxContracts.payrollVault.abi,
        eventName: 'RunCreated',
        logs: createRunReceipt.logs,
      })
      if (!runCreated) throw new Error('RunCreated event not found in the createRun receipt.')
      const runId = runCreated.args.runId

      stage('Computing inbox fees…')
      const { callbackFeeWei, inboxFeeWei } = await computePayrollWireFees(fujiClient)
      const { pTokenTransferFeeWei, pTokenCallbackFeeWei } = await computePTokenTwoWayFees(fujiClient)

      stage('Wiring payroll…')
      const wireHash = await writeContractAsync({
        address: facadeAddress,
        abi: avaxContracts.payrollCampaignFacade.abi,
        functionName: 'wirePayroll',
        args: [
          avaxContracts.payrollVault.address,
          avaxContracts.payrollClaimStore.address,
          runId,
          callbackFeeWei,
          inboxFeeWei,
          pTokenTransferFeeWei,
          pTokenCallbackFeeWei,
        ],
        chainId: AVAX_CHAIN_ID,
      })
      await fujiClient.waitForTransactionReceipt({ hash: wireHash })

      // registerRun/registerLeaf validate against the roster on COTI itself — the wallet
      // must submit transactions there, which the NetworkGuard (hardcoded to Fuji as the
      // app's target network) doesn't know about. Expect a brief "wrong network" overlay
      // during this section; it clears once we switch back to Fuji below.
      // Re-asserted before every wallet write below, not just once up front — some wallets
      // silently drift back to the previously-active chain between prompts (e.g. after a
      // signMessageAsync round trip), and switchChainAsync is a no-op if already on target.
      stage('Switching to COTI testnet…')
      await switchChainAsync({ chainId: COTI_TESTNET_CHAIN_ID })

      stage('Registering run on COTI…')
      await switchChainAsync({ chainId: COTI_TESTNET_CHAIN_ID })
      const registerRunHash = await writeContractAsync({
        ...cotiTestnetContracts.privatePayrollCoti,
        functionName: 'registerRun',
        args: [runId, tree.root],
        chainId: COTI_TESTNET_CHAIN_ID,
      })
      await cotiClient.waitForTransactionReceipt({ hash: registerRunHash })

      for (const pkg of tree.packages) {
        stage(`Registering leaf ${pkg.index + 1}/${tree.packages.length} on COTI…`)
        const itAmount = await buildRegisterLeafIt({
          amount: pkg.amount,
          aesKey: sessionAesKey,
          signerAddress: address,
          signMessageAsync,
        })
        await switchChainAsync({ chainId: COTI_TESTNET_CHAIN_ID })
        const registerLeafHash = await writeContractAsync({
          ...cotiTestnetContracts.privatePayrollCoti,
          functionName: 'registerLeaf',
          args: [runId, BigInt(pkg.index), pkg.recipient, pkg.amountCommitment, itAmount],
          chainId: COTI_TESTNET_CHAIN_ID,
        })
        await cotiClient.waitForTransactionReceipt({ hash: registerLeafHash })
      }

      stage('Switching back to Avalanche Fuji…')
      await switchChainAsync({ chainId: AVAX_CHAIN_ID })

      for (const pkg of tree.packages) {
        stage(`Registering leaf ${pkg.index + 1}/${tree.packages.length} on facade…`)
        await switchChainAsync({ chainId: AVAX_CHAIN_ID })
        const registerFacadeHash = await writeContractAsync({
          address: facadeAddress,
          abi: avaxContracts.payrollCampaignFacade.abi,
          functionName: 'registerLeaf',
          args: [BigInt(pkg.index), pkg.recipient, pkg.amountCommitment],
          chainId: AVAX_CHAIN_ID,
        })
        await fujiClient.waitForTransactionReceipt({ hash: registerFacadeHash })
      }

      return { facadeAddress, runId, tree }
    },
  })
}
