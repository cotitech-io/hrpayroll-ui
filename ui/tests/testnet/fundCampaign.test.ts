import { beforeAll, describe, expect, it } from 'vitest'
import { concatHex, getAbiItem, keccak256, toHex, zeroAddress, type Hex } from 'viem'
import { avaxContracts, cotiTestnetContracts } from '../../src/config/contracts'
import { computePTokenTwoWayFees, estimateVaultTwoWayFees } from '../../src/lib/podFees'
import type { RosterEntry } from '../../src/lib/merkle'
import {
  PMTT,
  PRIVACY_PORTAL,
  UNDERLYING_MTT,
  createCampaignOnChain,
  decryptPMttBalance,
  envPrivateKey,
  erc20Abi,
  makeSigner,
  portalAbi,
  resolveAesKey,
  waitForPTokenSettle,
  type TestnetSigner,
} from './helpers'

// End-to-end campaign FUNDING against the real networks, mirroring useFundCampaign:
// portal-seed pToken → public transfer into the facade → settle → requestCreditPool →
// wait for PoolCredited / poolCreditedTotal (iter08-thin-fuji-facade).
// Budget: 500 of PRIVATE_KEY3's tokens per run, distributed to the two roster accounts
// below (250 pMTT each).
//
// Because PRIVATE_KEY3's own pMTT may be locked from earlier stuck transfers, the seed
// spends PRIVATE_KEY3's budget from its PUBLIC MTT instead: a PrivacyPortal deposit
// (plain-amount mint) minting fresh pMTT straight to the funder, which then funds the
// facade via PodERC20's public `transfer(to, uint256, uint256)` overload. Encrypted
// `transfer(to, itUint256, …)` currently leaves senders pending forever on Fuji↔COTI
// testnet (callback never lands), so the fund path matches the mint path: plaintext
// amount on the wire, private balances still garbled on-chain.
//
// iter08 (2026-07-19): ackPoolCredit / local Fuji MpcCore at 0x64 are gone. After settle,
// the campaign admin calls requestCreditPool(amount) with inboxFeeWei; COTI creditPool
// callbacks onPoolCredited and increments poolCreditedTotal.
//
// If a funder is left pending, bump PAYROLL_TEST_FUNDER_SALT (v1–v3 were burned).
//
// Requires in the repo-root .env (helpers load ../../../.env — not ui/.env.local):
//   PRIVATE_KEY3              — employer/admin; PrivatePayrollCoti owner; pays the 500 MTT
//                               seed and the funder's one-time gas top-ups.
//   PRIVATE_AES_KEY_TESTNET   — PRIVATE_KEY3's AES key (COTI onboard + decrypt Fuji pToken).
//   PAYROLL_TEST_FUNDER_SALT  — optional; rotates the derived funder account (default v4).
//   PRIVATE_AES_KEY_FUNDER_<SALT>_TESTNET — optional pin for the funder's AES key.

const EMPLOYEE_A = '0xAb81c57CCc578a5636BFF47B896BEC6Af1c30012' as const
const EMPLOYEE_B = '0xF505c61776e8234Ce45C59D7e28d074D9d023DFe' as const
const FUND_TOTAL = 500n * PMTT
const ROSTER: RosterEntry[] = [
  { index: 0, recipient: EMPLOYEE_A, amount: 250n * PMTT },
  { index: 1, recipient: EMPLOYEE_B, amount: 250n * PMTT },
]

const FUNDER_GAS_FUJI = 50_000_000_000_000_000n // 0.05 AVAX
const FUNDER_GAS_COTI = 1_000_000_000_000_000_000n // 1 COTI (onboarding tx)

const key3 = envPrivateKey('PRIVATE_KEY3')
const FUNDER_SALT = process.env.PAYROLL_TEST_FUNDER_SALT ?? 'v4'
const funderKey = key3
  ? (keccak256(concatHex([key3, toHex(`hrpayroll-testnet-funder-${FUNDER_SALT}`)])) as Hex)
  : undefined

describe.skipIf(!key3)('fund-campaign flow on live Fuji + COTI testnet', () => {
  let employer: TestnetSigner
  let funder: TestnetSigner
  let employerAesKey: string
  let funderAesKey: string

  beforeAll(async () => {
    employer = makeSigner(key3!)
    funder = makeSigner(funderKey!)
    employerAesKey = await resolveAesKey('PRIVATE_AES_KEY_TESTNET', key3!)

    // One-time (per funder account) gas top-ups from the employer — plain native transfers,
    // unaffected by the pToken pending lock.
    const funderAddr = funder.account.address as Hex
    if ((await employer.fujiPublic.getBalance({ address: funderAddr })) < FUNDER_GAS_FUJI / 2n) {
      const hash = await employer.fujiWallet.sendTransaction({ to: funderAddr, value: FUNDER_GAS_FUJI })
      await employer.fujiPublic.waitForTransactionReceipt({ hash })
      console.info(`[testnet] topped up funder ${funderAddr} with 0.05 AVAX`)
    }
    if ((await employer.cotiPublic.getBalance({ address: funderAddr })) < FUNDER_GAS_COTI / 2n) {
      const hash = await employer.cotiWallet.sendTransaction({ to: funderAddr, value: FUNDER_GAS_COTI })
      await employer.cotiPublic.waitForTransactionReceipt({ hash })
      console.info(`[testnet] topped up funder ${funderAddr} with 1 COTI`)
    }

    // Needs COTI gas in place first (the recovery path submits an onboarding tx).
    // Env name is salt-scoped so a pinned key can't leak across funder rotations.
    funderAesKey = await resolveAesKey(`PRIVATE_AES_KEY_FUNDER_${FUNDER_SALT.toUpperCase()}_TESTNET`, funderKey!)
  })

  it('seeds the funder via portal deposit, funds the campaign, and credits the COTI pool', async () => {
    const { fujiPublic } = employer

    // Preflights — each failure here names the real blocker instead of dying mid-flow.
    const cotiOwner = await employer.cotiPublic.readContract({
      ...cotiTestnetContracts.privatePayrollCoti,
      functionName: 'owner',
    })
    expect(cotiOwner.toLowerCase(), 'PRIVATE_KEY3 must be the PrivatePayrollCoti owner').toBe(
      employer.account.address.toLowerCase(),
    )

    const { pending: funderStuck } = await decryptPMttBalance(fujiPublic, funder.account.address as Hex, funderAesKey)
    expect(
      funderStuck,
      `funder ${funder.account.address} has a stuck pending pToken transfer — its account is locked ` +
        'for transfers until the COTI callback for that request is delivered (see PRIVATE_KEY3 for how this happens)',
    ).toBe(false)

    const mttBalance = await fujiPublic.readContract({
      address: UNDERLYING_MTT,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [employer.account.address as Hex],
    })
    expect(mttBalance >= FUND_TOTAL, `PRIVATE_KEY3 needs ≥500 MTT to seed the run (has ${mttBalance / PMTT})`).toBe(true)

    // 1. Campaign to fund: roster pays the two employee accounts 250 pMTT each.
    const campaign = await createCampaignOnChain({
      signer: employer,
      aesKey: employerAesKey,
      roster: ROSTER,
      campaignName: `E2E fund test ${new Date().toISOString()}`,
    })

    // 2. Seed the funder with exactly PRIVATE_KEY3's 500-token budget: portal deposit of
    //    public MTT, minting fresh pMTT straight to the funder (plain-amount mint — no IT,
    //    so none of the encode-failure surface that bricked PRIVATE_KEY3's own account).
    const { balance: funderBefore } = await decryptPMttBalance(fujiPublic, funder.account.address as Hex, funderAesKey)

    const allowance = await fujiPublic.readContract({
      address: UNDERLYING_MTT,
      abi: erc20Abi,
      functionName: 'allowance',
      args: [employer.account.address as Hex, PRIVACY_PORTAL],
    })
    if (allowance < FUND_TOTAL) {
      const approveHash = await employer.fujiWallet.writeContract({
        address: UNDERLYING_MTT,
        abi: erc20Abi,
        functionName: 'approve',
        args: [PRIVACY_PORTAL, FUND_TOTAL],
      })
      const approveReceipt = await fujiPublic.waitForTransactionReceipt({ hash: approveHash })
      expect(approveReceipt.status, 'MTT approve').toBe('success')
    }

    const [portalFee] = await fujiPublic.readContract({
      address: PRIVACY_PORTAL,
      abi: portalAbi,
      functionName: 'estimateDepositFees',
      args: [FUND_TOTAL],
    })
    const { pTokenTransferFeeWei, pTokenCallbackFeeWei } = await computePTokenTwoWayFees(fujiPublic)

    const depositHash = await employer.fujiWallet.writeContract({
      address: PRIVACY_PORTAL,
      abi: portalAbi,
      functionName: 'deposit',
      args: [funder.account.address as Hex, FUND_TOTAL, portalFee, pTokenCallbackFeeWei],
      value: portalFee + pTokenTransferFeeWei,
    })
    const depositReceipt = await fujiPublic.waitForTransactionReceipt({ hash: depositHash })
    expect(depositReceipt.status, 'portal deposit').toBe('success')
    console.info(`[testnet] portal deposit submitted: 500 MTT → pMTT for ${funder.account.address} tx=${depositHash}`)

    // Mints surface as Transfer from the zero address once the COTI round trip lands.
    await waitForPTokenSettle({
      fujiPublic,
      from: zeroAddress,
      to: funder.account.address as Hex,
      fromBlock: depositReceipt.blockNumber,
      timeoutMs: 300_000,
      label: 'portal mint to funder',
    })
    const { balance: funderSeeded, pending: seededPending } = await decryptPMttBalance(
      fujiPublic,
      funder.account.address as Hex,
      funderAesKey,
    )
    expect(seededPending, 'funder pending after mint settle').toBe(false)
    expect(funderSeeded - funderBefore, 'seeded amount').toBe(FUND_TOTAL)

    // 3. Fund the facade with the public-amount transfer overload (same settle path as the
    //    portal mint). Matches useFundCampaign after the IT-transfer testnet outage.
    const transferHash = await funder.fujiWallet.writeContract({
      ...avaxContracts.pToken,
      functionName: 'transfer',
      args: [campaign.facadeAddress, FUND_TOTAL, pTokenCallbackFeeWei],
      value: pTokenTransferFeeWei,
    })
    const transferReceipt = await fujiPublic.waitForTransactionReceipt({ hash: transferHash })
    expect(transferReceipt.status, 'pToken transfer to facade').toBe('success')
    console.info(`[testnet] fund transfer submitted: tx=${transferHash}`)

    await waitForPTokenSettle({
      fujiPublic,
      from: funder.account.address as Hex,
      to: campaign.facadeAddress,
      fromBlock: transferReceipt.blockNumber,
      timeoutMs: 300_000,
      label: 'fund transfer to facade',
    })

    // requestCreditPool: campaign admin (employer) pays the two-way inbox fee; COTI
    // creditPool callbacks onPoolCredited. No local AES IT / MpcCore on Fuji (iter08).
    // The old setInboxFees/inboxFeeWei/payoutCallbackFeeWei constants are gone — fee is
    // quoted live via estimateVaultTwoWayFees, same as fundCampaignOnChain in helpers.ts.
    const facade = {
      address: campaign.facadeAddress,
      abi: avaxContracts.payrollCampaignFacade.abi,
    } as const
    const creditedBefore = await fujiPublic.readContract({
      ...facade,
      functionName: 'poolCreditedTotal',
    })
    const { totalFeeWei, callbackFeeWei } = await estimateVaultTwoWayFees(fujiPublic)
    console.info(
      `[testnet] requestCreditPool amount=${FUND_TOTAL} totalFeeWei=${totalFeeWei} ` +
        `employer=${employer.account.address} facade=${campaign.facadeAddress}`,
    )
    const creditHash = await employer.fujiWallet.writeContract({
      ...facade,
      functionName: 'requestCreditPool',
      args: [FUND_TOTAL, callbackFeeWei],
      value: totalFeeWei,
    })
    const creditReceipt = await fujiPublic.waitForTransactionReceipt({ hash: creditHash })
    expect(creditReceipt.status, `requestCreditPool reverted (tx ${creditHash})`).toBe('success')

    const creditDeadline = Date.now() + 300_000
    let poolCredited = false
    while (Date.now() < creditDeadline) {
      const [total, poolLogs] = await Promise.all([
        fujiPublic.readContract({ ...facade, functionName: 'poolCreditedTotal' }),
        fujiPublic.getLogs({
          address: campaign.facadeAddress,
          event: getAbiItem({ abi: facade.abi, name: 'PoolCredited' }),
          fromBlock: creditReceipt.blockNumber,
        }),
      ])
      if (total >= creditedBefore + FUND_TOTAL || poolLogs.length > 0) {
        poolCredited = true
        console.info(`[testnet] pool credited: poolCreditedTotal=${total} logs=${poolLogs.length}`)
        break
      }
      await new Promise((r) => setTimeout(r, 3_000))
    }
    expect(
      poolCredited,
      `Timed out waiting for PoolCredited after requestCreditPool (tx ${creditHash}). ` +
        'See ui/docs/fundCampaign.md.',
    ).toBe(true)

    // 4. The funder spent exactly the seeded budget — nothing more, nothing less.
    const { balance: funderAfter, pending: funderAfterPending } = await decryptPMttBalance(
      fujiPublic,
      funder.account.address as Hex,
      funderAesKey,
    )
    expect(funderAfterPending, 'funder pending after fund settle').toBe(false)
    expect(funderAfter, 'funder net pMTT change').toBe(funderBefore)

    console.info(
      `[testnet] campaign funded: facade=${campaign.facadeAddress} runId=${campaign.runId} ` +
        `amount=500 pMTT requestCreditPool=${creditHash}`,
    )
  })
})
