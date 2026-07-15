import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getAbiItem, type Hex } from 'viem'
import { useAccount, usePublicClient, useSendTransaction, useSignMessage, useWriteContract } from 'wagmi'
import { usePrivacyBridgeUnlock } from '@coti-io/coti-wallet-plugin'
import { AVAX_CHAIN_ID, avaxContracts } from '../config/contracts'
import { buildAckPoolIt, buildTransferIt } from '../lib/buildPayrollIt'
import { computePTokenTwoWayFees } from '../lib/podFees'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 90_000

export type FundCampaignParams = {
  facadeAddress: Hex
  amount: bigint
  /** Native AVAX to top up the facade with, covering its own future inbox-fee spend (ack/clawback). 0 to skip. */
  facadeEthTopUpWei?: bigint
}

export function useFundCampaign(onStage?: (stage: string) => void) {
  const { address } = useAccount()
  const { sessionAesKey } = usePrivacyBridgeUnlock()
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync } = useWriteContract()
  const { sendTransactionAsync } = useSendTransaction()
  const publicClient = usePublicClient({ chainId: AVAX_CHAIN_ID })
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (params: FundCampaignParams): Promise<void> => {
      const stage = (s: string) => onStage?.(s)

      if (!address) throw new Error('Connect a wallet first.')
      if (!sessionAesKey) throw new Error('Unlock private access first.')
      if (!publicClient) throw new Error('No Avalanche Fuji client available.')

      const { pToken } = avaxContracts

      // The `pending` flag reflects the *sender's* in-flight balance, not the receiver's —
      // the facade (as a pure receiver here) never actually goes pending itself, so checking
      // it would always pass immediately. Check our own (sender) balance is idle instead.
      stage('Checking your pToken balance is idle…')
      const deadline0 = Date.now() + POLL_TIMEOUT_MS
      while (Date.now() < deadline0) {
        const [, pending] = await publicClient.readContract({
          ...pToken,
          functionName: 'balanceOfWithStatus',
          args: [address],
        })
        if (!pending) break
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }

      stage('Computing inbox fees…')
      const { pTokenTransferFeeWei, pTokenCallbackFeeWei } = await computePTokenTwoWayFees(publicClient)

      stage('Sending encrypted pToken transfer…')
      const transferIt = await buildTransferIt({
        amount: params.amount,
        aesKey: sessionAesKey,
        signerAddress: address,
        signMessageAsync,
      })
      const transferHash = await writeContractAsync({
        ...pToken,
        functionName: 'transfer',
        args: [params.facadeAddress, transferIt, pTokenCallbackFeeWei],
        value: pTokenTransferFeeWei,
        chainId: AVAX_CHAIN_ID,
      })
      const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash })

      // Wait for the actual async result — a completed `Transfer` (success) or `TransferFailed`
      // (failure) event — instead of a balance-pending flag, which never reflects the
      // *receiver's* in-flight state and would let a failed transfer silently fall through to
      // ackPoolCredit as if it had succeeded.
      stage('Waiting for COTI to credit the facade…')
      const deadline1 = Date.now() + POLL_TIMEOUT_MS
      let settled = false
      while (Date.now() < deadline1) {
        const [transferLogs, failedLogs] = await Promise.all([
          publicClient.getLogs({
            address: pToken.address,
            event: getAbiItem({ abi: pToken.abi, name: 'Transfer' }),
            args: { from: address, to: params.facadeAddress },
            fromBlock: transferReceipt.blockNumber,
          }),
          publicClient.getLogs({
            address: pToken.address,
            event: getAbiItem({ abi: pToken.abi, name: 'TransferFailed' }),
            args: { from: address, to: params.facadeAddress },
            fromBlock: transferReceipt.blockNumber,
          }),
        ])
        if (failedLogs.length > 0) {
          throw new Error(`pToken transfer to the facade failed on-chain: ${failedLogs[0].args.errorMsg}`)
        }
        if (transferLogs.length > 0) {
          settled = true
          break
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      if (!settled) throw new Error('Timed out waiting for the pToken transfer to settle.')

      stage('Acknowledging pool credit…')
      const ackIt = await buildAckPoolIt({
        amount: params.amount,
        aesKey: sessionAesKey,
        signerAddress: address,
        facadeAddress: params.facadeAddress,
        signMessageAsync,
      })
      const ackHash = await writeContractAsync({
        address: params.facadeAddress,
        abi: avaxContracts.payrollCampaignFacade.abi,
        functionName: 'ackPoolCredit',
        args: [ackIt],
        chainId: AVAX_CHAIN_ID,
      })
      await publicClient.waitForTransactionReceipt({ hash: ackHash })

      if (params.facadeEthTopUpWei && params.facadeEthTopUpWei > 0n) {
        stage('Topping up facade with AVAX for its own inbox fees…')
        const topUpHash = await sendTransactionAsync({
          to: params.facadeAddress,
          value: params.facadeEthTopUpWei,
          chainId: AVAX_CHAIN_ID,
        })
        await publicClient.waitForTransactionReceipt({ hash: topUpHash })
      }
    },
    // The "Funded" column in List Payroll reads this same query — without invalidating it,
    // a successful fund only updates the on-chain state, not the already-fetched UI list.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer-campaigns'] })
    },
  })
}
