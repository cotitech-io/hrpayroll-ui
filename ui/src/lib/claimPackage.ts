import { isAddress, type Hex } from 'viem'
import type { MerklePackage } from './merkle'

// What an employer's UI hands each employee out-of-band. No itAmount is included — the
// employee re-encrypts the amount fresh with their own key at claim time, avoiding
// signature reuse/staleness across the three ITs a claim actually needs.
// facadeAddress is required so claims target the campaign that issued the package
// (factory-created campaigns each get their own facade).
export type ClaimPackage = {
  facadeAddress: Hex
  index: number
  recipient: Hex
  amount: string // decimal string; parsed to bigint at use time
  amountCommitment: Hex
  proof: Hex[]
}

export function parseClaimPackage(raw: string): ClaimPackage {
  const data = JSON.parse(raw)
  if (
    typeof data.facadeAddress !== 'string' ||
    !isAddress(data.facadeAddress) ||
    typeof data.index !== 'number' ||
    typeof data.recipient !== 'string' ||
    !isAddress(data.recipient) ||
    typeof data.amount !== 'string' ||
    typeof data.amountCommitment !== 'string' ||
    !Array.isArray(data.proof)
  ) {
    throw new Error(
      'Not a valid claim package — expected {facadeAddress, index, recipient, amount, amountCommitment, proof}',
    )
  }
  return {
    facadeAddress: data.facadeAddress,
    index: data.index,
    recipient: data.recipient,
    amount: data.amount,
    amountCommitment: data.amountCommitment,
    proof: data.proof,
  }
}

export function toClaimPackage(pkg: MerklePackage, facadeAddress: Hex): ClaimPackage {
  return {
    facadeAddress,
    index: pkg.index,
    recipient: pkg.recipient,
    amount: pkg.amount.toString(),
    amountCommitment: pkg.amountCommitment,
    proof: pkg.proof,
  }
}

/** Ensure a stored/exported package carries the campaign facade (older localStorage entries may omit it). */
export function withFacadeAddress(
  pkg: Omit<ClaimPackage, 'facadeAddress'> & { facadeAddress?: Hex },
  facadeAddress: Hex,
): ClaimPackage {
  return { ...pkg, facadeAddress: pkg.facadeAddress ?? facadeAddress }
}

export function downloadClaimPackage(pkg: ClaimPackage, campaignName: string): void {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = campaignName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  a.href = url
  a.download = `${safeName}-claim-${pkg.index}-${pkg.recipient.slice(0, 8)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
