import type { Hex } from 'viem'
import type { MerklePackage } from './merkle'

// What an employer's UI (Phase 3) hands each employee out-of-band. No itAmount is
// included — the employee re-encrypts the amount fresh with their own key at claim
// time, avoiding signature reuse/staleness across the three ITs a claim actually needs.
export type ClaimPackage = {
  index: number
  recipient: Hex
  amount: string // decimal string; parsed to bigint at use time
  amountCommitment: Hex
  proof: Hex[]
}

export function parseClaimPackage(raw: string): ClaimPackage {
  const data = JSON.parse(raw)
  if (
    typeof data.index !== 'number' ||
    typeof data.recipient !== 'string' ||
    typeof data.amount !== 'string' ||
    typeof data.amountCommitment !== 'string' ||
    !Array.isArray(data.proof)
  ) {
    throw new Error('Not a valid claim package — expected {index, recipient, amount, amountCommitment, proof}')
  }
  return data as ClaimPackage
}

export function toClaimPackage(pkg: MerklePackage): ClaimPackage {
  return {
    index: pkg.index,
    recipient: pkg.recipient,
    amount: pkg.amount.toString(),
    amountCommitment: pkg.amountCommitment,
    proof: pkg.proof,
  }
}

export function downloadClaimPackage(pkg: MerklePackage, campaignName: string): void {
  const claimPackage = toClaimPackage(pkg)
  const blob = new Blob([JSON.stringify(claimPackage, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const safeName = campaignName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
  a.href = url
  a.download = `${safeName}-claim-${pkg.index}-${pkg.recipient.slice(0, 8)}.json`
  a.click()
  URL.revokeObjectURL(url)
}
