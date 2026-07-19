import { isAddress, type Address, type Hex } from 'viem'
import { rebuildClaimPackagesFromCommitments, type MerklePackage } from './merkle'

// What an organization's UI hands each employee out-of-band. No itAmount is included — the
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

export function claimPackageJson(pkg: ClaimPackage): string {
  return JSON.stringify(pkg, null, 2)
}

export async function copyClaimPackage(pkg: ClaimPackage): Promise<void> {
  await navigator.clipboard.writeText(claimPackageJson(pkg))
}

/**
 * Build one employee's claim package from the full on-chain roster.
 * Merkle leaves use commitments only — other indices' plaintext amounts are irrelevant
 * and can be placeholders. The claimant must supply their own correct plaintext amount
 * (what the organization registered) so COTI's verifyAndCredit accepts the IT.
 */
export function buildClaimPackageForIndex(params: {
  facadeAddress: Hex
  roster: Array<{ index: number; recipient: Address; amountCommitment: Hex }>
  index: number
  amount: bigint
}): ClaimPackage {
  const { facadeAddress, roster, index, amount } = params
  if (roster.length === 0) throw new Error('Campaign roster is empty.')
  const target = roster.find((r) => r.index === index)
  if (!target) throw new Error(`Index ${index} is not on this campaign roster.`)

  const rebuilt = rebuildClaimPackagesFromCommitments(
    roster.map((row) => ({
      index: row.index,
      recipient: row.recipient,
      amountCommitment: row.amountCommitment,
      amount: row.index === index ? amount : 0n,
    })),
  )
  const pkg = rebuilt.find((p) => p.index === index)
  if (!pkg) throw new Error(`Failed to rebuild package for index ${index}.`)
  return toClaimPackage(pkg, facadeAddress)
}
