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
// eth_estimateGas on Fuji, so ackPoolCredit / claim IT entrypoints need an explicit limit.
export const FUJI_MPC_IT_GAS = 3_000_000n

// Generic pToken two-way message (transfer/mint/sync round trip): same calldata/exec-gas
// constants as mpc-test-utils.ts. Gas price must track the live chain — the inbox converts
// wei → gas units with `tx.gasprice` at execution time, so a stale assumed price
// (~0.3 gwei from the sim era) underbuys gas on Fuji (~1+ gwei) and reverts
// CallbackFeeTooLow / TargetFeeTooLow. Quote at 2× current max fee so eth_estimateGas /
// EIP-1559 bumps that raise effective gasprice still leave enough gas units.
const PTOKEN_CALL_SIZE = 512n
const PTOKEN_EXEC_GAS = 300_000n
const PTOKEN_MIN_GAS_PRICE_WEI = 300_529_002n

export async function computePTokenTwoWayFees(publicClient: PublicClient) {
  const feeEstimate = await publicClient.estimateFeesPerGas().catch(() => null)
  const liveGasPrice = feeEstimate?.maxFeePerGas ?? (await publicClient.getGasPrice())
  const quoteGasPrice =
    liveGasPrice * 2n > PTOKEN_MIN_GAS_PRICE_WEI ? liveGasPrice * 2n : PTOKEN_MIN_GAS_PRICE_WEI

  const [targetFeeLocalWei, callerFeeLocalWei] = await publicClient.readContract({
    ...avaxContracts.inbox,
    functionName: 'calculateTwoWayFeeRequiredInLocalToken',
    args: [PTOKEN_CALL_SIZE, PTOKEN_CALL_SIZE, PTOKEN_EXEC_GAS, PTOKEN_EXEC_GAS, quoteGasPrice],
  })
  return {
    pTokenCallbackFeeWei: pad5Percent(callerFeeLocalWei),
    pTokenTransferFeeWei: pad5Percent(targetFeeLocalWei + callerFeeLocalWei),
  }
}
