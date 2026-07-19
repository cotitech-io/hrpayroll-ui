import { beforeAll, describe, expect, it } from 'vitest'
import { concatHex, keccak256, toHex, zeroAddress, type Hex } from 'viem'
import { avaxContracts, cotiTestnetContracts } from '../../src/config/contracts'
import { buildAckPoolIt, buildTransferIt } from '../../src/lib/buildPayrollIt'
import { computePTokenTwoWayFees } from '../../src/lib/podFees'
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
// encrypted pToken transfer into the facade, wait for the COTI round trip to settle,
// then ackPoolCredit. Budget: 500 of PRIVATE_KEY3's tokens per run, distributed to the
// two roster accounts below (250 pMTT each).
//
// KNOWN BLOCKER (2026-07-19): every IT-based (encrypted-amount) pMTT transfer submitted
// since ~2026-07-17 13:00 UTC fails on the COTI inbox with ERROR_CODE_ENCODE_FAILED and the
// same deterministic payload (0xfe709212…), for EVERY recipient type — facade, plain EOA —
// while plain-amount ops (portal mints) still settle. Each failed transfer permanently
// bricks its SENDER: the error response is never ferried back to Fuji, ENCODE_FAILED is not
// retryable via Inbox.retryFailedRequest (that only accepts EXECUTION_FAILED), and
// PodERC20's pending-transfer lock has no other clearing path, so the account reverts
// TransferAlreadyPending forever after. Verified casualties: PRIVATE_KEY3 (requestId …67,
// 5500 pMTT locked), derived funder v1 (…83), derived probe v2 (…85, EOA recipient).
// This test is correct and will pass as-is once the COTI-side codec/executor is fixed;
// until then it fails at the transfer-settle step, burning the 500 MTT seed and bricking
// the current funder — bump PAYROLL_TEST_FUNDER_SALT afterwards to rotate to a clean one.
//
// Because PRIVATE_KEY3's own pMTT is locked (see above), the seed spends PRIVATE_KEY3's
// budget from its PUBLIC MTT instead: a PrivacyPortal deposit (plain-amount mint — the
// path that still works) minting fresh pMTT straight to the funder, which then runs the
// real fund flow. The funder is a dedicated test account derived deterministically from
// PRIVATE_KEY3, so its gas top-ups and COTI onboarding are one-time costs per salt. It
// never holds anything but testnet gas and the in-flight 500 pMTT.
//
// Requires in the repo-root .env:
//   PRIVATE_KEY3              — employer/admin; PrivatePayrollCoti owner; pays the 500 MTT
//                               seed and the funder's one-time gas top-ups.
//   PRIVATE_AES_KEY_TESTNET   — PRIVATE_KEY3's COTI AES key.
//   PAYROLL_TEST_FUNDER_SALT  — optional; rotates the derived funder account (default v3;
//                               v1 and v2 were bricked reproducing the blocker above).

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
const FUNDER_SALT = process.env.PAYROLL_TEST_FUNDER_SALT ?? 'v3'
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

  it('seeds the funder via portal deposit, funds the campaign, and acks the pool credit', async () => {
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
      label: 'portal mint to funder',
    })
    const { balance: funderSeeded, pending: seededPending } = await decryptPMttBalance(
      fujiPublic,
      funder.account.address as Hex,
      funderAesKey,
    )
    expect(seededPending, 'funder pending after mint settle').toBe(false)
    expect(funderSeeded - funderBefore, 'seeded amount').toBe(FUND_TOTAL)

    // 3. The actual fund flow, exactly as useFundCampaign does it.
    const transferIt = await buildTransferIt({
      amount: FUND_TOTAL,
      aesKey: funderAesKey,
      signerAddress: funder.account.address as Hex,
      signMessageAsync: funder.signMessageAsync,
    })
    const transferHash = await funder.fujiWallet.writeContract({
      ...avaxContracts.pToken,
      functionName: 'transfer',
      args: [campaign.facadeAddress, transferIt, pTokenCallbackFeeWei],
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
      label: 'fund transfer to facade',
    })

    const ackIt = await buildAckPoolIt({
      amount: FUND_TOTAL,
      aesKey: funderAesKey,
      signerAddress: funder.account.address as Hex,
      facadeAddress: campaign.facadeAddress,
      signMessageAsync: funder.signMessageAsync,
    })
    const ackHash = await funder.fujiWallet.writeContract({
      address: campaign.facadeAddress,
      abi: avaxContracts.payrollCampaignFacade.abi,
      functionName: 'ackPoolCredit',
      args: [ackIt],
    })
    const ackReceipt = await fujiPublic.waitForTransactionReceipt({ hash: ackHash })
    expect(ackReceipt.status, 'ackPoolCredit').toBe('success')

    // 4. The funder spent exactly the seeded budget — nothing more, nothing less.
    const { balance: funderAfter, pending: funderAfterPending } = await decryptPMttBalance(
      fujiPublic,
      funder.account.address as Hex,
      funderAesKey,
    )
    expect(funderAfterPending, 'funder pending after fund settle').toBe(false)
    expect(funderAfter, 'funder net pMTT change').toBe(funderBefore)

    console.info(
      `[testnet] campaign funded: facade=${campaign.facadeAddress} runId=${campaign.runId} amount=500 pMTT ack=${ackHash}`,
    )
  })
})
