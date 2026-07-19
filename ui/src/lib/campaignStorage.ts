import type { Hex } from 'viem'
import type { ClaimPackage } from './claimPackage'

// The roster (recipient/amount pairs) and the merkle tree built from it only ever exist in
// React state during creation — nothing on-chain stores plaintext amounts, and PayrollVault/
// facade contracts have no concept of "the roster" beyond per-index commitments. Without this,
// claim packages can only ever be exported once, in the same session a campaign was created.
// Browser-local only: a campaign created on a different device/browser won't have its
// packages available here even though it's still listed (from on-chain data).
export type StoredCampaign = {
  facadeAddress: Hex
  campaignName: string
  runId: string
  // Older entries may omit facadeAddress on each package; callers should run withFacadeAddress.
  packages: Array<Omit<ClaimPackage, 'facadeAddress'> & { facadeAddress?: Hex }>
}

const STORAGE_KEY = 'payroll-campaigns-v1'

function readStore(): Record<string, StoredCampaign> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function writeStore(store: Record<string, StoredCampaign>): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
}

export function saveCampaign(campaign: StoredCampaign): void {
  const store = readStore()
  store[campaign.facadeAddress.toLowerCase()] = campaign
  writeStore(store)
}

export function loadCampaign(facadeAddress: Hex): StoredCampaign | null {
  return readStore()[facadeAddress.toLowerCase()] ?? null
}

export function listStoredCampaigns(): StoredCampaign[] {
  return Object.values(readStore())
}
