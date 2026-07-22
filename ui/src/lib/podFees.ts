import type { PublicClient } from 'viem'
import { avaxContracts } from '../config/contracts'

// Mirrors pod-ecosystem-integration/test/system/mpc-test-utils.ts's estimateGas() — it calls
// the PoD inbox's calculateTwoWayFeeRequiredInLocalToken with fixed calldata-size/gas terms,
// then pads the result. The payroll-wire fee computation that used to live alongside this
// moved on-chain: PayrollCampaignFactory stores those fees and wires them itself.

const pad5Percent = (x: bigint) => x + x / 20n + 1n

// COTI's eth_estimateGas does not model MPC-precompile execution (ValidateCiphertext/OffBoard):
// every estimate-limited registerLeaf on record ran out of gas at exactly its limit (~269k).
// The PoD reference tests pass explicit 3M+ gas for MPC-touching COTI calls; do the same.
export const COTI_REGISTER_LEAF_GAS = 3_000_000n

// Same class of call as COTI registerLeaf: MpcCore.validateCiphertext is invisible to
// eth_estimateGas on Fuji for some IT entrypoints still needs an explicit limit (e.g. claim).
export const FUJI_MPC_IT_GAS = 3_000_000n

// Generic pToken two-way message (transfer/mint/sync round trip): same calldata/exec-gas
// constants as mpc-test-utils.ts. The inbox's remoteMinFeeConfig.constantFee (12,000,000 gas
// units on live Fuji/COTI, confirmed via cast) is non-zero, so expectedMinFee() for the remote
// leg returns it flatly regardless of call size — execution-gas is the ONLY headroom above
// that floor. localMinFeeConfig.constantFee is 0 (formula-based, much smaller), so the remote
// and callback legs need very different amounts of padding: a single shared EXEC_GAS constant
// for both (as this used to be) inflates the callback leg far more than the remote leg per
// unit bumped — most of the extra wei goes to the callback share, which is subtracted out of
// remoteGasWei before the floor check, leaving the remote leg's real margin almost unchanged.
// Confirmed empirically: bumping the old shared constant 300k→3M grew paid wei ~5-6x (callback
// leg dominated) while the decoded TargetFeeTooLow shortfall barely moved. Keep the callback
// constant modest and pad the remote one directly instead.
const PTOKEN_CALL_SIZE = 512n
const PTOKEN_REMOTE_EXEC_GAS = 6_000_000n
const PTOKEN_CALLBACK_EXEC_GAS = 300_000n
// InboxFeeManager.DEFAULT_GAS_PRICE (the contract's own fallback when tx.gasprice reads as 0)
// is 2 gwei on live Fuji/COTI — confirmed by matching a CallbackFeeTooLow(72921) revert exactly
// against pTokenCallbackFeeWei / 2_000_000_000. Our old floor (300_529_002, ~0.3 gwei) quoted
// wei assuming a price 6.6x lower than what the network/contract actually uses whenever live
// gas price craters near zero, permanently under-budgeting the callback leg in exactly that
// case. Floor must sit above the contract's 2 gwei fallback, not below it.
const PTOKEN_MIN_GAS_PRICE_WEI = 3_000_000_000n

export async function computePTokenTwoWayFees(publicClient: PublicClient) {
  const feeEstimate = await publicClient.estimateFeesPerGas().catch(() => null)
  const liveGasPrice = feeEstimate?.maxFeePerGas ?? (await publicClient.getGasPrice())
  const quoteGasPrice =
    liveGasPrice * 2n > PTOKEN_MIN_GAS_PRICE_WEI ? liveGasPrice * 2n : PTOKEN_MIN_GAS_PRICE_WEI

  const [targetFeeLocalWei, callerFeeLocalWei] = await publicClient.readContract({
    ...avaxContracts.inbox,
    functionName: 'calculateTwoWayFeeRequiredInLocalToken',
    args: [PTOKEN_CALL_SIZE, PTOKEN_CALL_SIZE, PTOKEN_REMOTE_EXEC_GAS, PTOKEN_CALLBACK_EXEC_GAS, quoteGasPrice],
  })
  return {
    pTokenCallbackFeeWei: pad5Percent(callerFeeLocalWei),
    pTokenTransferFeeWei: pad5Percent(targetFeeLocalWei + callerFeeLocalWei),
  }
}

// Mirrors PayrollVault.estimateFee() (payroll MPC payloads are larger than pToken's, hence
// separate size/gas terms) — but called directly against the inbox with gasPrice as an
// explicit argument, because estimateFee() itself reads `tx.gasprice` implicitly and viem's
// readContract has no way to override the eth_call's gas price for a plain view call.
// Same remote-vs-callback split as PTOKEN_*_EXEC_GAS above — a shared constant for both legs
// under-pads the remote (floor-checked) leg while over-paying the callback leg.
const PAYROLL_CALL_SIZE = 4096n
const PAYROLL_REMOTE_EXEC_GAS = 6_600_000n
const PAYROLL_CALLBACK_EXEC_GAS = 600_000n

export async function estimateVaultTwoWayFees(publicClient: PublicClient) {
  const feeEstimate = await publicClient.estimateFeesPerGas().catch(() => null)
  const liveGasPrice = feeEstimate?.maxFeePerGas ?? (await publicClient.getGasPrice())
  const quoteGasPrice =
    liveGasPrice * 2n > PTOKEN_MIN_GAS_PRICE_WEI ? liveGasPrice * 2n : PTOKEN_MIN_GAS_PRICE_WEI

  const [targetFeeWei, callbackFeeWei] = await publicClient.readContract({
    ...avaxContracts.inbox,
    functionName: 'calculateTwoWayFeeRequiredInLocalToken',
    args: [PAYROLL_CALL_SIZE, PAYROLL_CALL_SIZE, PAYROLL_REMOTE_EXEC_GAS, PAYROLL_CALLBACK_EXEC_GAS, quoteGasPrice],
  })
  return {
    callbackFeeWei: pad5Percent(callbackFeeWei),
    totalFeeWei: pad5Percent(targetFeeWei + callbackFeeWei),
  }
}

export type ClaimFeeQuote = {
  inboxTotalFeeWei: bigint
  inboxCallbackFeeWei: bigint
  pTokenTotalFeeWei: bigint
  pTokenCallbackFeeWei: bigint
}

// iter10 claim()/claimTo() carry all four fee quotes as arguments: the vault forwards the
// inbox pair to sendTwoWayMessage (paid from facade float) and escrows the pToken pair for
// the payout callback's public pToken.transfer (paid from vault float). Nothing is
// re-quoted on-chain — these UI heuristics are the only fee source.
export async function quoteClaimFees(publicClient: PublicClient): Promise<ClaimFeeQuote> {
  const [inbox, pToken] = await Promise.all([
    estimateVaultTwoWayFees(publicClient),
    computePTokenTwoWayFees(publicClient),
  ])
  return {
    inboxTotalFeeWei: inbox.totalFeeWei,
    inboxCallbackFeeWei: inbox.callbackFeeWei,
    pTokenTotalFeeWei: pToken.pTokenTransferFeeWei,
    pTokenCallbackFeeWei: pToken.pTokenCallbackFeeWei,
  }
}
