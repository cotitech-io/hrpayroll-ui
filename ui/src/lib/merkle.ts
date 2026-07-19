import { encryptUint256 } from '@coti-io/coti-sdk-typescript'
import { concatHex, encodeAbiParameters, keccak256, type Address, type Hex } from 'viem'

// Port of pod-dapp-ports/sablier-payroll-pod/test/lib/merkle.ts for the browser, using the
// real @coti-io/coti-sdk-typescript encryptUint256 instead of sim-coti-node's simEncryptUint256.
// Leaf: keccak256(bytes.concat(keccak256(abi.encode(index, recipient, amountCommitment)))),
// matching the on-chain PayrollCampaignFacade/PrivatePayrollCoti merkle verification.

export type RosterEntry = {
  index: number
  recipient: Address
  amount: bigint
}

export type MerklePackage = {
  index: number
  recipient: Address
  amount: bigint
  amountCommitment: Hex
  leaf: Hex
  proof: Hex[]
}

export type PayrollMerkleTree = {
  root: Hex
  entries: RosterEntry[]
  packages: MerklePackage[]
}

function amountCommitmentFromCiphertext(ct: { ciphertextHigh: bigint; ciphertextLow: bigint }): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        {
          type: 'tuple',
          components: [
            { type: 'uint256', name: 'ciphertextHigh' },
            { type: 'uint256', name: 'ciphertextLow' },
          ],
        },
      ],
      [{ ciphertextHigh: ct.ciphertextHigh, ciphertextLow: ct.ciphertextLow }],
    ),
  )
}

function encodeLeaf(index: number, recipient: Address, amountCommitment: Hex): Hex {
  const inner = keccak256(
    encodeAbiParameters(
      [{ type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }],
      [BigInt(index), recipient, amountCommitment],
    ),
  )
  return keccak256(concatHex([inner]))
}

function commutativeKeccak256(a: Hex, b: Hex): Hex {
  const aBig = BigInt(a)
  const bBig = BigInt(b)
  const [left, right] = aBig < bBig ? [a, b] : [b, a]
  return keccak256(concatHex([left, right]))
}

function buildMerkleRoot(leaves: Hex[]): Hex {
  if (leaves.length === 0) throw new Error('merkle tree requires at least one leaf')
  let level = [...leaves]
  while (level.length > 1) {
    const next: Hex[] = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? commutativeKeccak256(level[i], level[i + 1]) : level[i])
    }
    level = next
  }
  return level[0]
}

function buildProof(leaves: Hex[], targetIndex: number): Hex[] {
  const proof: Hex[] = []
  let level = [...leaves]
  let index = targetIndex
  while (level.length > 1) {
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1
    if (siblingIndex < level.length) proof.push(level[siblingIndex])
    const next: Hex[] = []
    for (let i = 0; i < level.length; i += 2) {
      next.push(i + 1 < level.length ? commutativeKeccak256(level[i], level[i + 1]) : level[i])
    }
    index = Math.floor(index / 2)
    level = next
  }
  return proof
}

// Builds the roster's merkle tree and per-recipient claim packages.
//
// Each entry gets exactly one amountCommitment, computed once and reused both for its leaf
// hash and later for the on-chain registerLeaf commitment param. encryptUint256 encrypts with
// a fresh random blinding value on every call (see coti-sdk-typescript's AES `encrypt()`), so
// re-encrypting "the same" amount a second time — as the original sim-backed reference did,
// relying on sim-coti-node's simEncryptUint256 being deterministic — would silently produce a
// different ciphertext/commitment and break every merkle proof against the value actually
// stored on-chain.
export function buildPayrollMerkleTree(entries: RosterEntry[], employerAesKey: string): PayrollMerkleTree {
  const sorted = [...entries].sort((a, b) => a.index - b.index)
  const commitments = sorted.map((e) => amountCommitmentFromCiphertext(encryptUint256(e.amount, employerAesKey)))
  const leaves = sorted.map((e, i) => encodeLeaf(e.index, e.recipient, commitments[i]))
  const root = buildMerkleRoot(leaves)

  const packages: MerklePackage[] = sorted.map((entry, i) => ({
    index: entry.index,
    recipient: entry.recipient,
    amount: entry.amount,
    amountCommitment: commitments[i],
    leaf: leaves[i],
    proof: buildProof(leaves, i),
  }))

  return { root, entries: sorted, packages }
}

/** Rebuild claim packages from on-chain commitments + known plaintext amounts.
 * Proofs only need (index, recipient, amountCommitment); amounts are for the claim IT. */
export function rebuildClaimPackagesFromCommitments(
  entries: Array<{
    index: number
    recipient: Address
    amountCommitment: Hex
    amount: bigint
  }>,
): MerklePackage[] {
  const sorted = [...entries].sort((a, b) => a.index - b.index)
  const leaves = sorted.map((e) => encodeLeaf(e.index, e.recipient, e.amountCommitment))
  return sorted.map((entry, i) => ({
    index: entry.index,
    recipient: entry.recipient,
    amount: entry.amount,
    amountCommitment: entry.amountCommitment,
    leaf: leaves[i],
    proof: buildProof(leaves, i),
  }))
}
