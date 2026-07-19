import { useMutation, useQueryClient } from '@tanstack/react-query'
import { getAbiItem, type Hex } from 'viem'
import { useAccount, usePublicClient, useSendTransaction, useWriteContract } from 'wagmi'
import { AVAX_CHAIN_ID, avaxContracts } from '../config/contracts'
import { computePTokenTwoWayFees } from '../lib/podFees'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 300_000

export type FundCampaignParams = {
  facadeAddress: Hex
  amount: bigint
  /** Native AVAX to top up the facade with, covering its own future inbox-fee spend. 0 to skip. */
  facadeEthTopUpWei?: bigint
}

const LOG_PREFIX = '[useFundCampaign]'

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, new Date().toISOString(), ...args)
}

export function useFundCampaign(onStage?: (stage: string) => void) {
  const { address } = useAccount()
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
      if (!publicClient) throw new Error('No Avalanche Fuji client available.')

      const { pToken } = avaxContracts
      const facade = {
        address: params.facadeAddress,
        abi: avaxContracts.payrollCampaignFacade.abi,
      } as const

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
      // Hard failure, not a warning: PodERC20 reverts TransferAlreadyPending while the flag is
      // set, so proceeding is a guaranteed on-chain revert that just burns gas. A flag stuck
      // longer than this window usually means a previous transfer's COTI callback was never
      // delivered — only inbox infra can clear it.
      if (!preIdle) {
        throw new Error(
          'Your pToken account still has a pending transfer from an earlier operation, so any new ' +
            'transfer would revert on-chain (TransferAlreadyPending). If this persists for more than a few ' +
            'minutes, that earlier transfer’s cross-chain callback was likely lost and the account stays ' +
            'locked until the PoD inbox operators redeliver it.',
        )
      }

      stage('Computing inbox fees…')
      const { pTokenTransferFeeWei, pTokenCallbackFeeWei } = await computePTokenTwoWayFees(publicClient)
      log('fees', {
        pTokenTransferFeeWei: pTokenTransferFeeWei.toString(),
        pTokenCallbackFeeWei: pTokenCallbackFeeWei.toString(),
      })

      // Public-amount overload: encrypted `transfer(to, itUint256, …)` currently leaves the
      // sender pending forever on Fuji↔COTI testnet (COTI callback never lands). Plain
      // `transfer(to, uint256, callbackFee)` uses the same settle path as portal mints and
      // still credits a garbled pToken balance — only the funded amount is public.
      stage('Sending pToken transfer to facade…')
      const transferHash = await writeContractAsync({
        ...pToken,
        functionName: 'transfer',
        args: [params.facadeAddress, params.amount, pTokenCallbackFeeWei],
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
      // *receiver's* in-flight state.
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

      // iter08: credit the COTI pool via inbox — no local MpcCore / ackPoolCredit on Fuji.
      stage('Requesting COTI pool credit…')
      const creditedBefore = await publicClient.readContract({
        ...facade,
        functionName: 'poolCreditedTotal',
      })
      const inboxFeeWei = await publicClient.readContract({
        ...facade,
        functionName: 'inboxFeeWei',
      })
      log('requestCreditPool', {
        amount: params.amount.toString(),
        inboxFeeWei: inboxFeeWei.toString(),
        creditedBefore: creditedBefore.toString(),
      })
      const creditHash = await writeContractAsync({
        ...facade,
        functionName: 'requestCreditPool',
        args: [params.amount],
        value: inboxFeeWei,
        chainId: AVAX_CHAIN_ID,
      })
      log('requestCreditPool tx submitted', { creditHash })
      const creditReceipt = await publicClient.waitForTransactionReceipt({ hash: creditHash })
      log('requestCreditPool tx mined', { status: creditReceipt.status })
      if (creditReceipt.status !== 'success') {
        throw new Error(`requestCreditPool reverted on-chain (tx ${creditHash}).`)
      }

      stage('Waiting for COTI pool credit callback…')
      const creditStart = Date.now()
      const deadline2 = creditStart + POLL_TIMEOUT_MS
      let credited = false
      let creditPoll = 0
      while (Date.now() < deadline2) {
        creditPoll += 1
        try {
          const [total, poolLogs] = await Promise.all([
            publicClient.readContract({ ...facade, functionName: 'poolCreditedTotal' }),
            publicClient.getLogs({
              address: params.facadeAddress,
              event: getAbiItem({ abi: facade.abi, name: 'PoolCredited' }),
              fromBlock: creditReceipt.blockNumber,
            }),
          ])
          log('credit poll', {
            creditPoll,
            elapsedMs: Date.now() - creditStart,
            poolCreditedTotal: total.toString(),
            poolLogsFound: poolLogs.length,
          })
          if (total >= creditedBefore + params.amount || poolLogs.length > 0) {
            credited = true
            break
          }
        } catch (e) {
          log('credit poll error (will keep polling until timeout)', e instanceof Error ? e.message : e)
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      if (!credited) {
        log('TIMED OUT waiting for pool credit', { creditPoll, elapsedMs: Date.now() - creditStart, creditHash })
        throw new Error(
          `Timed out waiting for COTI to credit the campaign pool (tx ${creditHash}, waited ${Math.round(
            (Date.now() - creditStart) / 1000,
          )}s). Check the console for [useFundCampaign] logs.`,
        )
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
      queryClient.invalidateQueries({ queryKey: ['organization-campaigns'] })
    },
    onError: (error) => {
      log('mutation failed', error instanceof Error ? error.message : error)
    },
  })
}
