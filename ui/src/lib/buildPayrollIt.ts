import { buildItUint256WithSigner } from '@coti-io/coti-sdk-typescript'
import { CotiPodCrypto, DataType, type EncryptedScalar } from '@coti-io/pod-sdk'
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

function toItUint256Struct(encrypted: { ciphertext: unknown; signature: string }): ItUint256Struct {
  const ct = encrypted.ciphertext as { ciphertextHigh?: unknown; ciphertextLow?: unknown } | null
  if (!ct || typeof ct !== 'object' || !('ciphertextHigh' in ct) || !('ciphertextLow' in ct)) {
    throw new Error(
      `PoD encryption service returned an unexpected ciphertext shape for itUint256: ${JSON.stringify(encrypted)}`,
    )
  }
  const toBigInt = (v: unknown) => (typeof v === 'bigint' ? v : BigInt(String(v)))
  const sig = encrypted.signature
  return {
    ciphertext: { ciphertextHigh: toBigInt(ct.ciphertextHigh), ciphertextLow: toBigInt(ct.ciphertextLow) },
    signature: (sig.startsWith('0x') ? sig : `0x${sig}`) as Hex,
  }
}

// Bound to (COTI inbox, batchProcessRequests) — the amount COTI's verifyAndCredit checks
// against the registered roster commitment for this index.
//
// Unlike every other builder in this file, this IT is executed inside a *miner-relayed*
// inbox call (batchProcessRequests), not a tx the signer submits themself. A locally
// wallet-signed IT (buildItUint256WithSigner, same path as buildClaimIt/buildRegisterLeafIt
// below) reliably fails validateCiphertext there — see docs/claimCampaign.md "Root cause".
// The PoD encryption service signs with a COTI-operated service key instead of the caller's
// wallet key, which is the standard construction for pod-sdk (see coti-wallet-plugin's
// podTransferFees.ts for a production reference) — this is the live experiment for whether
// that unblocks miner-relayed validation where wallet-signing did not.
export async function buildVerifyIt(params: { amount: bigint; signerAddress: Hex }): Promise<ItUint256Struct> {
  const encrypted = (await CotiPodCrypto.encrypt(params.amount.toString(), 'testnet', DataType.itUint256, {
    contractAddress: cotiTestnetContracts.inbox.address,
    functionSelector: BATCH_PROCESS_SELECTOR,
    userAddress: params.signerAddress,
  })) as EncryptedScalar
  return toItUint256Struct(encrypted)
}

// Deprecated for iter08 claims — ClaimStore no longer stores a payout IT; COTI returns a
// public amount in onPayoutAuthorized and the facade does payoutTo(to, uint256). Kept only
// if an older flow still imports it.
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

// Bound to (COTI PrivatePayrollCoti, registerLeaf) — the organization/admin calls registerLeaf
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

// Bound to (facade, ackPoolCredit) — the organization acknowledges an encrypted pToken transfer
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
// named separately because it plays a different role (the organization's encrypted pToken.transfer
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
