import { useMutation } from '@tanstack/react-query'
import type { Hex } from 'viem'
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

  return useMutation({
    mutationFn: async (params: FundCampaignParams): Promise<void> => {
      const stage = (s: string) => onStage?.(s)

      if (!address) throw new Error('Connect a wallet first.')
      if (!sessionAesKey) throw new Error('Unlock private access first.')
      if (!publicClient) throw new Error('No Avalanche Fuji client available.')

      const { pToken } = avaxContracts

      stage('Checking facade pToken balance is idle…')
      const deadline0 = Date.now() + POLL_TIMEOUT_MS
      while (Date.now() < deadline0) {
        const [, pending] = await publicClient.readContract({
          ...pToken,
          functionName: 'balanceOfWithStatus',
          args: [params.facadeAddress],
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
      await publicClient.waitForTransactionReceipt({ hash: transferHash })

      stage('Waiting for COTI to credit the facade…')
      const deadline1 = Date.now() + POLL_TIMEOUT_MS
      let idle = false
      while (Date.now() < deadline1) {
        const [, pending] = await publicClient.readContract({
          ...pToken,
          functionName: 'balanceOfWithStatus',
          args: [params.facadeAddress],
        })
        if (!pending) {
          idle = true
          break
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      if (!idle) throw new Error('Timed out waiting for the pToken transfer to settle.')

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
  })
}
