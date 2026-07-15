import type { PublicClient } from 'viem'
import { avaxContracts } from '../config/contracts'

// Mirrors pod-dapp-ports/sablier-payroll-pod/test/lib/pod-scenario.ts's fee setup and
// pod-ecosystem-integration/test/system/mpc-test-utils.ts's estimateGas() — both call the
// PoD inbox's calculateTwoWayFeeRequiredInLocalToken with fixed calldata-size/gas terms tuned
// per message type, then pad the result. Kept as the same two independent call shapes here
// rather than "simplified" to one, since that's what's actually been exercised against a real
// inbox deployment.

const pad20Percent = (x: bigint) => x + x / 5n + 1n
const pad5Percent = (x: bigint) => x + x / 20n + 1n

// Payroll-specific message: PayrollVault -> COTI PrivatePayrollCoti registerRun/registerLeaf
// round trip. Matches pod-scenario.ts's deployFacadeHarness fee computation exactly.
const PAYROLL_CALL_SIZE = 4096n
const PAYROLL_EXEC_GAS = 600_000n

export async function computePayrollWireFees(publicClient: PublicClient) {
  const gasPrice = await publicClient.getGasPrice()
  const [targetFeeLocalWei, callerFeeLocalWei] = await publicClient.readContract({
    ...avaxContracts.inbox,
    functionName: 'calculateTwoWayFeeRequiredInLocalToken',
    args: [PAYROLL_CALL_SIZE, PAYROLL_CALL_SIZE, PAYROLL_EXEC_GAS, PAYROLL_EXEC_GAS, gasPrice],
  })
  return {
    callbackFeeWei: pad20Percent(callerFeeLocalWei),
    inboxFeeWei: pad20Percent(targetFeeLocalWei + callerFeeLocalWei),
  }
}

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
