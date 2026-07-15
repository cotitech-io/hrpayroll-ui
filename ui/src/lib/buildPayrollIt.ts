import { buildItUint256WithSigner } from '@coti-io/coti-sdk-typescript'
import { bytesToHex, toFunctionSelector, type Hex } from 'viem'
import { cotiTestnetContracts } from '../config/contracts'

// Selectors payroll ITs are bound to. Must exactly match the target contract's real
// function signature — an IT signed for the wrong selector fails validation on-chain
// (MpcCore.validateCiphertext checks the (contract, selector) pair baked into the
// signed digest against whatever contract+selector actually calls it).
export const CLAIM_SELECTOR = toFunctionSelector('claim(uint256,address,((uint256,uint256),bytes),bytes32[])') as Hex
export const CLAIM_TO_SELECTOR = toFunctionSelector('claimTo(uint256,address,((uint256,uint256),bytes),bytes32[])') as Hex
export const BATCH_PROCESS_SELECTOR = toFunctionSelector(
  'batchProcessRequests(uint256,(bytes32,address,address,(bytes4,bytes,bytes8[],bytes32[]),bytes4,bytes4,bool,bytes32,uint256,uint256)[])',
) as Hex
export const REGISTER_LEAF_SELECTOR = toFunctionSelector(
  'registerLeaf(uint256,uint256,address,bytes32,((uint256,uint256),bytes))',
) as Hex
export const ACK_POOL_CREDIT_SELECTOR = toFunctionSelector('ackPoolCredit(((uint256,uint256),bytes))') as Hex

export type ItUint256Struct = {
  ciphertext: { ciphertextHigh: bigint; ciphertextLow: bigint }
  signature: Hex
}

export type SignMessageAsync = (args: { message: { raw: Hex } }) => Promise<Hex>

async function buildIt(params: {
  value: bigint
  aesKey: string
  signerAddress: Hex
  contractAddress: Hex
  functionSelector: Hex
  signMessageAsync: SignMessageAsync
}): Promise<ItUint256Struct> {
  const { value, aesKey, signerAddress, contractAddress, functionSelector, signMessageAsync } = params
  const result = await buildItUint256WithSigner({
    value,
    aesKey,
    signerAddress,
    contractAddress,
    functionSelector,
    signMessage: (message) => signMessageAsync({ message: { raw: bytesToHex(message) } }),
  })
  return { ciphertext: result.ciphertext, signature: result.signature as Hex }
}

// Bound to (COTI inbox, batchProcessRequests) — the amount COTI's verifyAndCredit checks
// against the registered roster commitment for this index.
export function buildVerifyIt(params: {
  amount: bigint
  aesKey: string
  signerAddress: Hex
  signMessageAsync: SignMessageAsync
}) {
  return buildIt({
    value: params.amount,
    aesKey: params.aesKey,
    signerAddress: params.signerAddress,
    contractAddress: cotiTestnetContracts.inbox.address,
    functionSelector: BATCH_PROCESS_SELECTOR,
    signMessageAsync: params.signMessageAsync,
  })
}

// Bound to the same (COTI inbox, batchProcessRequests) pair — the amount credited to the
// claimant's pToken balance once verification succeeds.
export function buildPayoutIt(params: {
  amount: bigint
  aesKey: string
  signerAddress: Hex
  signMessageAsync: SignMessageAsync
}) {
  return buildIt({
    value: params.amount,
    aesKey: params.aesKey,
    signerAddress: params.signerAddress,
    contractAddress: cotiTestnetContracts.inbox.address,
    functionSelector: BATCH_PROCESS_SELECTOR,
    signMessageAsync: params.signMessageAsync,
  })
}

// Bound to (facade, claim | claimTo) — the amount passed directly as claim()'s/claimTo()'s
// own itAmount argument.
export function buildClaimIt(params: {
  amount: bigint
  aesKey: string
  signerAddress: Hex
  facadeAddress: Hex
  selector: typeof CLAIM_SELECTOR | typeof CLAIM_TO_SELECTOR
  signMessageAsync: SignMessageAsync
}) {
  return buildIt({
    value: params.amount,
    aesKey: params.aesKey,
    signerAddress: params.signerAddress,
    contractAddress: params.facadeAddress,
    functionSelector: params.selector,
    signMessageAsync: params.signMessageAsync,
  })
}

// Bound to (COTI PrivatePayrollCoti, registerLeaf) — the employer/admin calls registerLeaf
// directly on COTI to seed the per-index amount used later by verifyAndCredit; signed by
// whichever wallet submits that call.
export function buildRegisterLeafIt(params: {
  amount: bigint
  aesKey: string
  signerAddress: Hex
  signMessageAsync: SignMessageAsync
}) {
  return buildIt({
    value: params.amount,
    aesKey: params.aesKey,
    signerAddress: params.signerAddress,
    contractAddress: cotiTestnetContracts.privatePayrollCoti.address,
    functionSelector: REGISTER_LEAF_SELECTOR,
    signMessageAsync: params.signMessageAsync,
  })
}

// Bound to (facade, ackPoolCredit) — the employer acknowledges an encrypted pToken transfer
// they just made into the facade's pool, so the facade's internal pool ledger reflects it.
export function buildAckPoolIt(params: {
  amount: bigint
  aesKey: string
  signerAddress: Hex
  facadeAddress: Hex
  signMessageAsync: SignMessageAsync
}) {
  return buildIt({
    value: params.amount,
    aesKey: params.aesKey,
    signerAddress: params.signerAddress,
    contractAddress: params.facadeAddress,
    functionSelector: ACK_POOL_CREDIT_SELECTOR,
    signMessageAsync: params.signMessageAsync,
  })
}

// Bound to (COTI inbox, batchProcessRequests) — same binding as buildVerifyIt/buildPayoutIt;
// named separately because it plays a different role (the employer's encrypted pToken.transfer
// amount when funding a campaign, not a claim-side amount).
export function buildTransferIt(params: {
  amount: bigint
  aesKey: string
  signerAddress: Hex
  signMessageAsync: SignMessageAsync
}) {
  return buildIt({
    value: params.amount,
    aesKey: params.aesKey,
    signerAddress: params.signerAddress,
    contractAddress: cotiTestnetContracts.inbox.address,
    functionSelector: BATCH_PROCESS_SELECTOR,
    signMessageAsync: params.signMessageAsync,
  })
}
