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

// Generic pToken two-way message (transfer/mint/sync round trip): same constants
// mpc-test-utils.ts's estimateGas() uses for every PoD token operation, including a fixed
// assumed gas price rather than the live one — matching the reference exactly rather than
// guessing an "improved" number that hasn't been exercised against the real inbox.
const PTOKEN_CALL_SIZE = 512n
const PTOKEN_EXEC_GAS = 300_000n
const PTOKEN_ASSUMED_GAS_PRICE_WEI = 300_529_002n

export async function computePTokenTwoWayFees(publicClient: PublicClient) {
  const [targetFeeLocalWei, callerFeeLocalWei] = await publicClient.readContract({
    ...avaxContracts.inbox,
    functionName: 'calculateTwoWayFeeRequiredInLocalToken',
    args: [PTOKEN_CALL_SIZE, PTOKEN_CALL_SIZE, PTOKEN_EXEC_GAS, PTOKEN_EXEC_GAS, PTOKEN_ASSUMED_GAS_PRICE_WEI],
  })
  return {
    pTokenCallbackFeeWei: pad5Percent(callerFeeLocalWei),
    pTokenTransferFeeWei: pad5Percent(targetFeeLocalWei + callerFeeLocalWei),
  }
}
