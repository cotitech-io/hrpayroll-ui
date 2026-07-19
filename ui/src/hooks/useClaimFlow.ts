import { useMutation } from '@tanstack/react-query'
import { useAccount, usePublicClient, useSignMessage, useWriteContract } from 'wagmi'
import { encodeAbiParameters, type Hex } from 'viem'
import { usePrivacyBridgeUnlock } from '@coti-io/coti-wallet-plugin'
import { avaxContracts, AVAX_CHAIN_ID } from '../config/contracts'
import { buildClaimIt, buildPayoutIt, buildVerifyIt, CLAIM_SELECTOR, CLAIM_TO_SELECTOR } from '../lib/buildPayrollIt'
import type { ClaimPackage } from '../lib/claimPackage'

const POLL_INTERVAL_MS = 3_000
const POLL_TIMEOUT_MS = 90_000 // real COTI testnet mining latency, not the sim devnet's

export type ClaimResult =
  | { status: 'completed' }
  | { status: 'pending'; message: string } // claim tx mined; async verify/payout still in flight

export function useClaimFlow() {
  const { address } = useAccount()
  const { sessionAesKey } = usePrivacyBridgeUnlock()
  const { signMessageAsync } = useSignMessage()
  const { writeContractAsync } = useWriteContract()
  const publicClient = usePublicClient({ chainId: AVAX_CHAIN_ID })

  return useMutation({
    mutationFn: async (params: { pkg: ClaimPackage; payoutTo?: Hex }): Promise<ClaimResult> => {
      const { pkg, payoutTo } = params
      if (!address) throw new Error('Connect a wallet first.')
      if (!sessionAesKey) throw new Error('Unlock private access first.')
      if (!publicClient) throw new Error('No Avalanche Fuji client available.')

      if (!pkg.facadeAddress) throw new Error('Claim package is missing facadeAddress.')
      const { payrollClaimStore, payrollCampaignFacade } = avaxContracts
      const facade = { address: pkg.facadeAddress, abi: payrollCampaignFacade.abi } as const
      const amount = BigInt(pkg.amount)
      const to = payoutTo && payoutTo.toLowerCase() !== pkg.recipient.toLowerCase() ? payoutTo : undefined

      const signerParams = { aesKey: sessionAesKey, signerAddress: address, signMessageAsync }

      // Three separately-bound encrypted inputs — see buildPayrollIt.ts for why each needs
      // its own (contract, selector) binding rather than reusing one ciphertext everywhere.
      const verifyIt = await buildVerifyIt({ amount, ...signerParams })
      const payoutIt = await buildPayoutIt({ amount, ...signerParams })
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

      const submitHash = await writeContractAsync({
        ...payrollClaimStore,
        functionName: 'submitPayload',
        args: [facade.address, BigInt(pkg.index), verifyIt, proofHandle, payoutIt],
        chainId: AVAX_CHAIN_ID,
      })
      await publicClient.waitForTransactionReceipt({ hash: submitHash })

      const minFeeWei = await publicClient.readContract({
        ...facade,
        functionName: 'calculateMinFeeWei',
      })

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
      if (claimReceipt.status !== 'success') throw new Error('Claim transaction reverted.')

      // The claim tx mining is not the same as the claim completing — verifyAndCredit runs
      // on COTI asynchronously (via the PoD inbox), and hasClaimed only flips once that
      // round-trip lands back on Avalanche Fuji. Poll for it rather than treating the mined tx as done.
      const deadline = Date.now() + POLL_TIMEOUT_MS
      while (Date.now() < deadline) {
        const claimed = await publicClient.readContract({
          ...facade,
          functionName: 'hasClaimed',
          args: [BigInt(pkg.index)],
        })
        if (claimed) return { status: 'completed' }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
      }
      return { status: 'pending', message: 'Claim submitted; still waiting on COTI verification to complete.' }
    },
  })
}
