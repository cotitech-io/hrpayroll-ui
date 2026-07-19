import { useMutation } from '@tanstack/react-query'
import { useAccount, usePublicClient, useSignMessage, useWriteContract } from 'wagmi'
import { encodeAbiParameters, type Hex } from 'viem'
import { usePrivacyBridgeUnlock } from '@coti-io/coti-wallet-plugin'
import { avaxContracts, AVAX_CHAIN_ID } from '../config/contracts'
import { buildClaimIt, buildVerifyIt, CLAIM_SELECTOR, CLAIM_TO_SELECTOR } from '../lib/buildPayrollIt'
import type { ClaimPackage } from '../lib/claimPackage'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 300_000

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
  const { signMessageAsync } = useSignMessage()
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

      const [expired, alreadyClaimed, inboxFeeWei, facadeBalance] = await Promise.all([
        publicClient.readContract({ ...facade, functionName: 'hasExpired' }),
        publicClient.readContract({ ...facade, functionName: 'hasClaimed', args: [BigInt(pkg.index)] }),
        publicClient.readContract({ ...facade, functionName: 'inboxFeeWei' }),
        publicClient.getBalance({ address: pkg.facadeAddress }),
      ])
      if (expired) throw new Error('This campaign has expired; claims are closed.')
      if (alreadyClaimed) throw new Error('This index was already claimed.')
      // Facade pays vault.requestPayout{value: inboxFeeWei} from its own balance (not msg.value).
      if (facadeBalance < inboxFeeWei) {
        throw new Error(
          `Campaign facade needs at least ${inboxFeeWei} wei AVAX for the claim inbox fee ` +
            `(has ${facadeBalance}). Ask the employer to top up the facade with native AVAX.`,
        )
      }

      const signerParams = { aesKey: sessionAesKey, signerAddress: address, signMessageAsync }

      // verifyIt → COTI verifyAndCredit (real). claimIt is still required by the facade ABI
      // but ignored on-chain (iter08); payout IT was removed from ClaimStore.
      stage('Building encrypted claim inputs…')
      const verifyIt = await buildVerifyIt({ amount, ...signerParams })
      const claimIt = await buildClaimIt({
        amount,
        ...signerParams,
        facadeAddress: facade.address,
        selector: to ? CLAIM_TO_SELECTOR : CLAIM_SELECTOR,
      })

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
      const claimHash = to
        ? await writeContractAsync({
            ...facade,
            functionName: 'claimTo',
            args: [BigInt(pkg.index), to, claimIt, pkg.proof],
            value: minFeeWei,
            chainId: AVAX_CHAIN_ID,
          })
        : await writeContractAsync({
            ...facade,
            functionName: 'claim',
            args: [BigInt(pkg.index), pkg.recipient, claimIt, pkg.proof],
            value: minFeeWei,
            chainId: AVAX_CHAIN_ID,
          })
      const claimReceipt = await publicClient.waitForTransactionReceipt({ hash: claimHash })
      log('claim mined', { claimHash, status: claimReceipt.status })
      if (claimReceipt.status !== 'success') throw new Error('Claim transaction reverted.')

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
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      return {
        status: 'pending',
        message: 'Claim submitted; still waiting on COTI verification and public payout to complete.',
      }
    },
  })
}
