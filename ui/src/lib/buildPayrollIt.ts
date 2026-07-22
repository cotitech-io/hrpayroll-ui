import { buildItUint256WithSigner } from '@coti-io/coti-sdk-typescript'
import { CotiPodCrypto, DataType, type EncryptedScalar } from '@coti-io/pod-sdk'
import { bytesToHex, toFunctionSelector, type Hex } from 'viem'
import { cotiTestnetContracts } from '../config/contracts'

// Selectors payroll ITs are bound to. Must exactly match the target contract's real
// function signature — an IT signed for the wrong selector fails validation on-chain
// (MpcCore.validateCiphertext checks the (contract, selector) pair baked into the
// signed digest against whatever contract+selector actually calls it).
//
// iter10 note: claim()/claimTo() no longer take an itAmount argument (they carry four
// caller-quoted fee wei values instead), so there are no claim-bound ITs anymore. The
// only remaining ITs are the registerLeaf IT (COTI direct) and the verify IT (relayed
// through the COTI inbox's batchProcessRequests).
export const BATCH_PROCESS_SELECTOR = toFunctionSelector(
  'batchProcessRequests(uint256,(bytes32,address,address,(bytes4,bytes,bytes8[],bytes32[]),bytes4,bytes4,bool,bytes32,uint256,uint256)[])',
) as Hex
export const REGISTER_LEAF_SELECTOR = toFunctionSelector(
  'registerLeaf(uint256,uint256,address,bytes32,((uint256,uint256),bytes))',
) as Hex

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
// inbox call (batchProcessRequests), not a tx the signer submits themself: on COTI,
// tx.origin during validateCiphertext is the NETWORK MINER, so the IT digest must be
// signed by the miner's key over the miner's account (pod-dapp-ports iter10 finding:
// encryption-service ITs validate but decrypt to a different plaintext → errorCode 6).
// Node-side callers (tests, org tooling holding the miner key) should use
// {buildVerifyItWithSigner}. This service-signed variant remains for the browser UI,
// which cannot hold the miner key — claims built with it currently fail COTI-side
// verification (payout request → Failed) until upstream changes the validation model.
export async function buildVerifyIt(params: { amount: bigint; signerAddress: Hex }): Promise<ItUint256Struct> {
  const encrypted = (await CotiPodCrypto.encrypt(params.amount.toString(), 'testnet', DataType.itUint256, {
    contractAddress: cotiTestnetContracts.inbox.address,
    functionSelector: BATCH_PROCESS_SELECTOR,
    userAddress: params.signerAddress,
  })) as EncryptedScalar
  return toItUint256Struct(encrypted)
}

// Miner-signed verify IT (pod-dapp-ports iter10 `buildOwnedIt256` equivalent): the signer
// MUST be the live network miner (tx.origin of the COTI inbox's batchProcessRequests), and
// aesKey its onboarded COTI network key. Bound to (COTI inbox, batchProcessRequests).
export function buildVerifyItWithSigner(params: {
  amount: bigint
  aesKey: string
  signerAddress: Hex
  signMessageAsync: SignMessageAsync
}): Promise<ItUint256Struct> {
  return buildIt({
    value: params.amount,
    aesKey: params.aesKey,
    signerAddress: params.signerAddress,
    contractAddress: cotiTestnetContracts.inbox.address,
    functionSelector: BATCH_PROCESS_SELECTOR,
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
