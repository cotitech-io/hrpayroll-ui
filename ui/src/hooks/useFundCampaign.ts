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

const LOG_PREFIX = '[useFundCampaign]'

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, new Date().toISOString(), ...args)
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
      const stage = (s: string) => {
        log('stage:', s)
        onStage?.(s)
      }

      log('starting', { facadeAddress: params.facadeAddress, amount: params.amount.toString() })

      if (!address) throw new Error('Connect a wallet first.')
      if (!sessionAesKey) throw new Error('Unlock private access first.')
      if (!publicClient) throw new Error('No Avalanche Fuji client available.')

      const { pToken } = avaxContracts

      // The `pending` flag reflects the *sender's* in-flight balance, not the receiver's —
      // the facade (as a pure receiver here) never actually goes pending itself, so checking
      // it would always pass immediately. Check our own (sender) balance is idle instead.
      stage('Checking your pToken balance is idle…')
      const deadline0 = Date.now() + POLL_TIMEOUT_MS
      let preIdle = false
      while (Date.now() < deadline0) {
        const [, pending] = await publicClient.readContract({
          ...pToken,
          functionName: 'balanceOfWithStatus',
          args: [address],
        })
        log('pre-check: sender balanceOfWithStatus', { pending, msRemaining: deadline0 - Date.now() })
        if (!pending) {
          preIdle = true
          break
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      if (!preIdle) log('WARNING: sender balance still pending after timeout — proceeding anyway')

      stage('Computing inbox fees…')
      const { pTokenTransferFeeWei, pTokenCallbackFeeWei } = await computePTokenTwoWayFees(publicClient)
      log('fees', {
        pTokenTransferFeeWei: pTokenTransferFeeWei.toString(),
        pTokenCallbackFeeWei: pTokenCallbackFeeWei.toString(),
      })

      stage('Sending encrypted pToken transfer…')
      const transferIt = await buildTransferIt({
        amount: params.amount,
        aesKey: sessionAesKey,
        signerAddress: address,
        signMessageAsync,
      })
      log('transferIt built', { ciphertext: transferIt.ciphertext })
      const transferHash = await writeContractAsync({
        ...pToken,
        functionName: 'transfer',
        args: [params.facadeAddress, transferIt, pTokenCallbackFeeWei],
        value: pTokenTransferFeeWei,
        chainId: AVAX_CHAIN_ID,
      })
      log('transfer tx submitted', { transferHash })
      const transferReceipt = await publicClient.waitForTransactionReceipt({ hash: transferHash })
      log('transfer tx mined', {
        status: transferReceipt.status,
        blockNumber: transferReceipt.blockNumber.toString(),
      })
      if (transferReceipt.status !== 'success') {
        throw new Error(`pToken transfer request reverted on-chain (tx ${transferHash}).`)
      }

      // Wait for the actual async result — a completed `Transfer` (success) or `TransferFailed`
      // (failure) event — instead of a balance-pending flag, which never reflects the
      // *receiver's* in-flight state and would let a failed transfer silently fall through to
      // ackPoolCredit as if it had succeeded.
      stage('Waiting for COTI to credit the facade…')
      const settleStart = Date.now()
      const deadline1 = settleStart + POLL_TIMEOUT_MS
      let settled = false
      let pollCount = 0
      while (Date.now() < deadline1) {
        pollCount += 1
        try {
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
          log('settle poll', {
            pollCount,
            elapsedMs: Date.now() - settleStart,
            transferLogsFound: transferLogs.length,
            failedLogsFound: failedLogs.length,
          })
          if (failedLogs.length > 0) {
            log('TransferFailed event found', failedLogs[0])
            throw new Error(`pToken transfer to the facade failed on-chain: ${failedLogs[0].args.errorMsg}`)
          }
          if (transferLogs.length > 0) {
            log('Transfer event found — settled', transferLogs[0])
            settled = true
            break
          }
        } catch (e) {
          // Surface RPC hiccups (e.g. a fallback endpoint rejecting the query) instead of
          // letting them look identical to "still pending" — this is the difference between
          // a genuinely slow COTI round trip and an RPC-layer failure.
          log('settle poll error (will keep polling until timeout)', e instanceof Error ? e.message : e)
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      if (!settled) {
        log('TIMED OUT waiting for settlement', { pollCount, elapsedMs: Date.now() - settleStart, transferHash })
        throw new Error(
          `Timed out waiting for the pToken transfer to settle (tx ${transferHash}, waited ${Math.round(
            (Date.now() - settleStart) / 1000,
          )}s). Check the console for [useFundCampaign] logs — the transfer may still be processing on COTI.`,
        )
      }

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
      log('ackPoolCredit tx submitted', { ackHash })
      const ackReceipt = await publicClient.waitForTransactionReceipt({ hash: ackHash })
      log('ackPoolCredit tx mined', { status: ackReceipt.status })
      if (ackReceipt.status !== 'success') {
        throw new Error(`ackPoolCredit reverted on-chain (tx ${ackHash}).`)
      }

      if (params.facadeEthTopUpWei && params.facadeEthTopUpWei > 0n) {
        stage('Topping up facade with AVAX for its own inbox fees…')
        const topUpHash = await sendTransactionAsync({
          to: params.facadeAddress,
          value: params.facadeEthTopUpWei,
          chainId: AVAX_CHAIN_ID,
        })
        log('ETH top-up tx submitted', { topUpHash })
        await publicClient.waitForTransactionReceipt({ hash: topUpHash })
        log('ETH top-up tx mined')
      }
      log('done')
    },
    // The "Funded" column in List Payroll reads this same query — without invalidating it,
    // a successful fund only updates the on-chain state, not the already-fetched UI list.
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employer-campaigns'] })
    },
    onError: (error) => {
      log('mutation failed', error instanceof Error ? error.message : error)
    },
  })
}
