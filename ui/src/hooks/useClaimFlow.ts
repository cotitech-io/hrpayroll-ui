import { useMutation } from '@tanstack/react-query'
import { useAccount, usePublicClient, useWriteContract } from 'wagmi'
import { encodeAbiParameters, getAbiItem, type Hex } from 'viem'
import { usePrivacyBridgeUnlock } from '@coti-io/coti-wallet-plugin'
import { avaxContracts, AVAX_CHAIN_ID } from '../config/contracts'
import { buildVerifyIt } from '../lib/buildPayrollIt'
import type { ClaimPackage } from '../lib/claimPackage'
import { quoteClaimFees } from '../lib/podFees'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 300_000

/** Mirrors PayrollVault.RequestStatus */
const REQUEST_PENDING = 1
const REQUEST_COMPLETED = 2
const REQUEST_FAILED = 3

export type ClaimResult =
  | { status: 'completed' }
  | { status: 'pending'; message: string } // claim tx mined; async verify/payout still in flight

const LOG_PREFIX = '[useClaimFlow]'

function log(...args: unknown[]) {
  console.log(LOG_PREFIX, new Date().toISOString(), ...args)
}

export function useClaimFlow(onStage?: (stage: string) => void) {
  const { address } = useAccount()
  const { sessionAesKey } = usePrivacyBridgeUnlock()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: AVAX_CHAIN_ID })

  return useMutation({
    mutationFn: async (params: { pkg: ClaimPackage; payoutTo?: Hex }): Promise<ClaimResult> => {
      const stage = (s: string) => {
        log('stage:', s)
        onStage?.(s)
      }

      const { pkg, payoutTo } = params
      if (!address) throw new Error('Connect a wallet first.')
      if (!sessionAesKey) throw new Error('Unlock private access first.')
      if (!publicClient) throw new Error('No Avalanche Fuji client available.')
      if (!pkg.facadeAddress) throw new Error('Claim package is missing facadeAddress.')

      const { payrollClaimStore } = avaxContracts
      const facade = { address: pkg.facadeAddress, abi: avaxContracts.payrollCampaignFacade.abi } as const
      const amount = BigInt(pkg.amount)
      const to = payoutTo && payoutTo.toLowerCase() !== pkg.recipient.toLowerCase() ? payoutTo : undefined

      if (address.toLowerCase() !== pkg.recipient.toLowerCase()) {
        throw new Error(
          `Connected wallet ${address} does not match claim package recipient ${pkg.recipient}.`,
        )
      }

      const [expired, alreadyClaimed, fees, facadeBalance, vaultBalance] = await Promise.all([
        publicClient.readContract({ ...facade, functionName: 'hasExpired' }),
        publicClient.readContract({ ...facade, functionName: 'hasClaimed', args: [BigInt(pkg.index)] }),
        quoteClaimFees(publicClient),
        publicClient.getBalance({ address: pkg.facadeAddress }),
        publicClient.getBalance({ address: avaxContracts.payrollVault.address }),
      ])
      if (expired) throw new Error('This campaign has expired; claims are closed.')
      if (alreadyClaimed) throw new Error('This index was already claimed.')
      // iter10: the facade pays vault.requestPayout{value: inboxTotalFeeWei} from its own
      // balance, and the vault later pays the payout callback's public pToken.transfer
      // {value: pTokenTotalFeeWei} from ITS balance. Both are pre-funded native floats;
      // nothing is quoted on-chain anymore.
      if (facadeBalance < fees.inboxTotalFeeWei) {
        throw new Error(
          `Campaign facade needs at least ${fees.inboxTotalFeeWei} wei AVAX for the claim inbox fee ` +
            `(has ${facadeBalance}). Ask the organization to top up the facade with native AVAX.`,
        )
      }
      if (vaultBalance < fees.pTokenTotalFeeWei) {
        throw new Error(
          `PayrollVault needs at least ${fees.pTokenTotalFeeWei} wei AVAX float for the payout ` +
            `pToken transfer (has ${vaultBalance}). Ask the organization to top up the vault.`,
        )
      }

      // verifyIt → COTI verifyAndCredit, built via the PoD SDK encryption service — the
      // ONLY sanctioned builder (never wallet-sign with the employee key, never a miner
      // key; see the invariant in buildPayrollIt.ts). Confirmed working live 2026-07-22:
      // full claim round trip completed with a service-built IT (PayoutCompleted @ Fuji
      // block 57195312).
      stage('Building encrypted claim inputs…')
      const verifyIt = await buildVerifyIt({ amount, signerAddress: address })

      const proofHandle = encodeAbiParameters(
        [{ type: 'bytes32[]' }, { type: 'uint256' }],
        [pkg.proof, BigInt(pkg.index)],
      )

      stage('Submitting claim payload…')
      const submitHash = await writeContractAsync({
        ...payrollClaimStore,
        functionName: 'submitPayload',
        args: [facade.address, BigInt(pkg.index), verifyIt, proofHandle],
        chainId: AVAX_CHAIN_ID,
      })
      log('submitPayload mined', { submitHash })
      await publicClient.waitForTransactionReceipt({ hash: submitHash })

      const minFeeWei = await publicClient.readContract({
        ...facade,
        functionName: 'calculateMinFeeWei',
      })

      stage('Submitting claim…')
      // iter10 claim/claimTo: (index, recipient|to, proof, inboxTotal, inboxCallback,
      // pTokenTotal, pTokenCallback) — all four fee wei values quoted above.
      const feeArgs = [
        fees.inboxTotalFeeWei,
        fees.inboxCallbackFeeWei,
        fees.pTokenTotalFeeWei,
        fees.pTokenCallbackFeeWei,
      ] as const
      const claimHash = to
        ? await writeContractAsync({
            ...facade,
            functionName: 'claimTo',
            args: [BigInt(pkg.index), to, pkg.proof, ...feeArgs],
            value: minFeeWei,
            chainId: AVAX_CHAIN_ID,
          })
        : await writeContractAsync({
            ...facade,
            functionName: 'claim',
            args: [BigInt(pkg.index), pkg.recipient, pkg.proof, ...feeArgs],
            value: minFeeWei,
            chainId: AVAX_CHAIN_ID,
          })
      const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: claimHash })
      log('claim mined', { claimHash, status: claimReceipt.status })
      if (claimReceipt.status !== 'success') throw new Error('Claim transaction reverted.')

      const payoutRequested = getAbiItem({ abi: avaxContracts.payrollVault.abi, name: 'PayoutRequested' })
      const requestedLogs = await publicClient.getLogs({
        address: avaxContracts.payrollVault.address,
        event: payoutRequested,
        fromBlock: claimReceipt.blockNumber,
        toBlock: claimReceipt.blockNumber,
      })
      const requestId = requestedLogs.find(
        (l) => l.transactionHash === claimHash && l.args.index === BigInt(pkg.index),
      )?.args.requestId
      log('payout request', { requestId, claimHash })

      // hasClaimed flips only after COTI verifyAndCredit → onPayoutAuthorized → public payoutTo.
      stage('Waiting for COTI verify and payout…')
      const deadline = Date.now() + POLL_TIMEOUT_MS
      while (Date.now() < deadline) {
        const claimed = await publicClient.readContract({
          ...facade,
          functionName: 'hasClaimed',
          args: [BigInt(pkg.index)],
        })
        if (claimed) {
          log('claim completed')
          return { status: 'completed' }
        }
        if (requestId) {
          const status = await publicClient.readContract({
            ...avaxContracts.payrollVault,
            functionName: 'payoutRequestStatus',
            args: [requestId],
          })
          if (status === REQUEST_FAILED) {
            throw new Error(
              `COTI rejected this claim (vault payout request ${requestId} failed). ` +
                'Usually a wrong amount or proof — check the amount matches what the organization registered.',
            )
          }
          if (status === REQUEST_COMPLETED) {
            log('payout completed but hasClaimed still false — retrying read')
          } else if (status === REQUEST_PENDING) {
            log('payout still pending on COTI inbox', { requestId })
          }
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      return {
        status: 'pending',
        message:
          `Claim tx ${claimHash} mined on Fuji, but COTI has not finished verify/payout yet` +
          (requestId ? ` (request ${requestId} still Pending).` : '.') +
          ' Do not submit another claim for the same index — wait or check Activity for PayoutCompleted / PayoutFailed.',
      }
    },
  })
}
