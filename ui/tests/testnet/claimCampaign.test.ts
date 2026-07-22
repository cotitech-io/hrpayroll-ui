import { beforeAll, describe, expect, it } from 'vitest'
import { type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { avaxContracts, cotiTestnetContracts } from '../../src/config/contracts'
import type { RosterEntry } from '../../src/lib/merkle'
import {
  PMTT,
  claimOnChain,
  claimPackageFromTree,
  createCampaignOnChain,
  envPrivateKey,
  fundCampaignOnChain,
  makeSigner,
  resolveAesKey,
  type TestnetSigner,
} from './helpers'

// End-to-end CLAIM against live Fuji + COTI, mirroring useClaimFlow / MyClaims (iter10):
// create → fund (portal + requestCreditPool) → facade AVAX top-up →
// submitPayload(verifyIt, proof) → claim(7 args) → wait hasClaimed / payoutRequestStatus.
//
// The verify IT is built via the PoD SDK encryption service (buildVerifyIt) — the only
// sanctioned builder (no employee wallet-signing, no MINER_PK; see buildPayrollIt.ts).
// Confirmed working live 2026-07-22 against the iter10 deployment (PayoutCompleted @
// Fuji block 57195312). If this ever fails with errorCode 6 again, do NOT switch the
// IT signer — investigate the deployment/service instead (hrpayroll/ui/docs/CLAIM.md).
//
// Requires in the repo-root .env:
//   PRIVATE_KEY3            — employer / PrivatePayrollCoti owner (create + fund)
//   PRIVATE_AES_KEY_TESTNET — employer AES
//   CLAIM_ADDRESS           — roster recipient (must match CLAIM_PK)
//   CLAIM_PK                — employee wallet that submits the claim
//   CLAIM_AES_KEY           — the claimant's network AES key (else recovered via onboard;
//                             NOTE: recovery via this repo's coti-ethers has been observed
//                             to return a key that differs from the account's real network
//                             key — always pin CLAIM_AES_KEY)
//
// Funding uses the SAME wallet that creates the campaign (PRIVATE_KEY3) — the old
// derived-funder rotation is gone (see fundCampaign.test.ts header).

const claimPk = envPrivateKey('CLAIM_PK')
const key3 = envPrivateKey('PRIVATE_KEY3')
const claimAddressEnv = process.env.CLAIM_ADDRESS?.trim()

const CLAIM_AMOUNT = 100n * PMTT
const FACADE_ETH_TOPUP = 50_000_000_000_000_000n // 0.05 AVAX for claim inbox fees
const CLAIMANT_GAS_FUJI = 50_000_000_000_000_000n
const CLAIMANT_GAS_COTI = 1_000_000_000_000_000_000n

const ready = Boolean(claimPk && key3 && claimAddressEnv)

describe.skipIf(!ready)('claim-campaign flow on live Fuji + COTI testnet', () => {
  let employer: TestnetSigner
  let funder: TestnetSigner
  let claimant: TestnetSigner
  let employerAesKey: string
  let funderAesKey: string
  let claimantAesKey: string
  let claimAddress: Hex

  beforeAll(async () => {
    claimAddress = claimAddressEnv as Hex
    const derived = privateKeyToAccount(claimPk!).address
    expect(
      derived.toLowerCase(),
      'CLAIM_ADDRESS must match the address derived from CLAIM_PK',
    ).toBe(claimAddress.toLowerCase())

    // Employer creates AND funds — one wallet for the whole flow.
    employer = makeSigner(key3!)
    funder = employer
    claimant = makeSigner(claimPk!)

    employerAesKey = await resolveAesKey('PRIVATE_AES_KEY_TESTNET', key3!)
    funderAesKey = employerAesKey
    claimantAesKey = await resolveAesKey('CLAIM_AES_KEY', claimPk!)

    // Gas top-ups (employer → claimant) for Fuji txs + COTI onboarding.
    for (const [label, addr, fujiNeed, cotiNeed] of [
      ['claimant', claimAddress, CLAIMANT_GAS_FUJI, CLAIMANT_GAS_COTI],
    ] as const) {
      if ((await employer.fujiPublic.getBalance({ address: addr })) < fujiNeed / 2n) {
        const hash = await employer.fujiWallet.sendTransaction({ to: addr, value: fujiNeed })
        await employer.fujiPublic.waitForTransactionReceipt({ hash })
        console.info(`[testnet] topped up ${label} ${addr} with Fuji gas`)
      }
      if ((await employer.cotiPublic.getBalance({ address: addr })) < cotiNeed / 2n) {
        const hash = await employer.cotiWallet.sendTransaction({ to: addr, value: cotiNeed })
        await employer.cotiPublic.waitForTransactionReceipt({ hash })
        console.info(`[testnet] topped up ${label} ${addr} with COTI gas`)
      }
    }
  }, 300_000)

  it('creates, funds, and claims a payroll leaf for CLAIM_ADDRESS', async () => {
    const cotiOwner = await employer.cotiPublic.readContract({
      ...cotiTestnetContracts.privatePayrollCoti,
      functionName: 'owner',
    })
    expect(cotiOwner.toLowerCase(), 'PRIVATE_KEY3 must own PrivatePayrollCoti').toBe(
      employer.account.address.toLowerCase(),
    )

    const roster: RosterEntry[] = [{ index: 0, recipient: claimAddress, amount: CLAIM_AMOUNT }]

    // Fresh campaign — avoids colliding with stuck Pending payouts on older facades.
    const campaign = await createCampaignOnChain({
      signer: employer,
      aesKey: employerAesKey,
      roster,
      campaignName: `E2E claim test ${new Date().toISOString()}`,
      expiration: Math.floor(Date.now() / 1000) + 7200,
    })

    await fundCampaignOnChain({
      employer,
      funder,
      funderAesKey,
      facadeAddress: campaign.facadeAddress,
      amount: CLAIM_AMOUNT,
    })

    // Facade pays vault.requestPayout{value: inboxFeeWei} from its own balance.
    const topUpHash = await employer.fujiWallet.sendTransaction({
      to: campaign.facadeAddress,
      value: FACADE_ETH_TOPUP,
    })
    await employer.fujiPublic.waitForTransactionReceipt({ hash: topUpHash })
    console.info(`[testnet] facade AVAX top-up ${FACADE_ETH_TOPUP} wei → ${campaign.facadeAddress}`)

    const pkg = claimPackageFromTree(campaign.tree, campaign.facadeAddress, claimAddress)
    expect(pkg.index).toBe(0)
    expect(pkg.amount).toBe(CLAIM_AMOUNT.toString())

    const facade = {
      address: campaign.facadeAddress,
      abi: avaxContracts.payrollCampaignFacade.abi,
    } as const
    const registered = await employer.fujiPublic.readContract({
      ...facade,
      functionName: 'registeredRecipient',
      args: [0n],
    })
    expect(registered.toLowerCase()).toBe(claimAddress.toLowerCase())

    const result = await claimOnChain({
      claimant,
      employer,
      pkg,
      timeoutMs: 300_000,
    })

    expect(
      result.completed,
      `Claim stuck after Fuji success — COTI verify/payout did not complete. ` +
        `claimTx=${result.claimHash} requestId=${result.requestId ?? 'n/a'} ` +
        `facade=${campaign.facadeAddress} runId=${campaign.runId}. ` +
        `Check vault.payoutRequestStatus (1=Pending, 3=Failed). This path is confirmed ` +
        `working with service-built ITs (2026-07-22) — if Failed with errorCode 6, ` +
        `investigate the deployment/encryption service, do NOT switch the IT signer ` +
        `(hrpayroll/ui/docs/CLAIM.md).`,
    ).toBe(true)

    const hasClaimed = await employer.fujiPublic.readContract({
      ...facade,
      functionName: 'hasClaimed',
      args: [0n],
    })
    expect(hasClaimed).toBe(true)

    console.info(
      `[testnet] claim OK: facade=${campaign.facadeAddress} runId=${campaign.runId} ` +
        `claimant=${claimAddress} claimTx=${result.claimHash}`,
    )
  })
})
