import { beforeAll, describe, expect, it } from 'vitest'
import { concatHex, keccak256, toHex, zeroAddress, type Hex } from 'viem'
import { avaxContracts, cotiTestnetContracts } from '../../src/config/contracts'
import { buildAckPoolIt } from '../../src/lib/buildPayrollIt'
import { computePTokenTwoWayFees, FUJI_MPC_IT_GAS } from '../../src/lib/podFees'
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
// portal-seed pToken → public transfer into the facade → settle → ackPoolCredit.
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
// ackPoolCredit findings (live Fuji, 2026-07-19 — see ui/docs/fundCampaign.md):
//   • Employer IT is built with PRIVATE_AES_KEY_TESTNET from repo-root .env — the same
//     AES key as COTI AccountOnboard. There is no separate Fuji AES secret.
//   • Portal mint + public transfer settle OK; facade holds pTokens.
//   • ackPoolCredit still reverts at Fuji MpcCore.validateCiphertext (~28k gas), e.g.
//     facade 0x5016E770… / retry tx 0x63d21cd3… with the pinned .env key.
//   • Root cause is missing Fuji MPC user registration for that same key (coti-ethers
//     generateOrRecoverAes on the Fuji RPC → "unable to onboard user"), not a wrong
//     .env value, wrong selector, or wrong signer. simCOTI works via registerUserOnDualSim.
//
// If a funder is left pending, bump PAYROLL_TEST_FUNDER_SALT (v1–v3 were burned).
//
// Requires in the repo-root .env (helpers load ../../../.env — not ui/.env.local):
//   PRIVATE_KEY3              — employer/admin; PrivatePayrollCoti owner; pays the 500 MTT
//                               seed and the funder's one-time gas top-ups.
//   PRIVATE_AES_KEY_TESTNET   — PRIVATE_KEY3's AES key (COTI onboard; also used for Fuji
//                               ack IT + decrypting Fuji pToken balances).
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

    // ackPoolCredit: employer/admin signs+submits (not the ephemeral funder). AES comes
    // from PRIVATE_AES_KEY_TESTNET (.env) — same key as COTI; do not substitute another.
    expect(employerAesKey, 'employer AES must be pinned/recovered as PRIVATE_AES_KEY_TESTNET').toBeTruthy()
    expect(employerAesKey.length, 'PRIVATE_AES_KEY_TESTNET should be 32 hex chars (16-byte AES)').toBe(32)
    console.info(
      `[testnet] ackPoolCredit IT with .env AES (len=${employerAesKey.length} prefix=${employerAesKey.slice(0, 8)}…) ` +
        `employer=${employer.account.address} facade=${campaign.facadeAddress}`,
    )
    const ackIt = await buildAckPoolIt({
      amount: FUND_TOTAL,
      aesKey: employerAesKey,
      signerAddress: employer.account.address as Hex,
      facadeAddress: campaign.facadeAddress,
      signMessageAsync: employer.signMessageAsync,
    })
    // Explicit gas: Fuji eth_estimateGas cannot model MpcCore.validateCiphertext (same
    // class of call as COTI registerLeaf).
    const ackHash = await employer.fujiWallet.writeContract({
      address: campaign.facadeAddress,
      abi: avaxContracts.payrollCampaignFacade.abi,
      functionName: 'ackPoolCredit',
      args: [ackIt],
      gas: FUJI_MPC_IT_GAS,
    })
    const ackReceipt = await fujiPublic.waitForTransactionReceipt({ hash: ackHash })
    expect(
      ackReceipt.status,
      `ackPoolCredit reverted (tx ${ackHash}, gasUsed=${ackReceipt.gasUsed}). ` +
        'Fuji MpcCore.validateCiphertext rejected the employer IT built with PRIVATE_AES_KEY_TESTNET ' +
        'from .env (same AES as COTI — confirmed; not a wrong-key bug). Live Fuji has no MPC user ' +
        'registration for that key (coti-ethers generateOrRecoverAes on Fuji RPC → "unable to onboard ' +
        'user"); ~28k gasUsed is the typical immediate ValidateCiphertext fail. Portal mint + public ' +
        'pToken transfer to the facade already settled; only the encrypted pool ledger ack is blocked. ' +
        'See ui/docs/fundCampaign.md.',
    ).toBe('success')

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
