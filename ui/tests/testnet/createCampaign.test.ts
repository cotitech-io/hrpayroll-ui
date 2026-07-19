import { beforeAll, describe, expect, it } from 'vitest'
import { type Hex } from 'viem'
import { avaxContracts, cotiTestnetContracts } from '../../src/config/contracts'
import type { RosterEntry } from '../../src/lib/merkle'
import { PMTT, createCampaignOnChain, envPrivateKey, makeSigner, resolveAesKey, type TestnetSigner } from './helpers'

// End-to-end campaign creation against the REAL networks — the same steps, in the same
// order, with the same lib code (merkle + IT builders + contracts config) as the UI's
// useCreateCampaign; only the wagmi wallet layer is replaced by direct viem clients.
// sim-coti can't cover this: coti-wallet-plugin's coti-sdk-typescript encryption only
// validates against the real COTI MPC network, so this suite spends real testnet gas.
//
// Requires in the repo-root .env:
//   PRIVATE_KEY3              — employer wallet; must be the PrivatePayrollCoti owner
//                               (registerRun/registerLeaf on COTI are onlyOwner) and hold
//                               AVAX on Fuji + COTI on COTI testnet for gas.
//   PRIVATE_AES_KEY_TESTNET   — PRIVATE_KEY3's COTI AES key. When unset the test recovers
//                               it via one coti-ethers onboarding tx per run.

const key3 = envPrivateKey('PRIVATE_KEY3')

describe.skipIf(!key3)('create-campaign flow on live Fuji + COTI testnet', () => {
  let employer: TestnetSigner
  let aesKey: string

  beforeAll(async () => {
    employer = makeSigner(key3!)
    aesKey = await resolveAesKey('PRIVATE_AES_KEY_TESTNET', key3!)
  })

  it('creates a payroll end-to-end (factory createCampaign, COTI registration, facade leaves)', async () => {
    // Preflight: same gate the UI enforces — COTI-side registerRun/registerLeaf are onlyOwner.
    const cotiOwner = await employer.cotiPublic.readContract({
      ...cotiTestnetContracts.privatePayrollCoti,
      functionName: 'owner',
    })
    expect(cotiOwner.toLowerCase(), 'PRIVATE_KEY3 must be the PrivatePayrollCoti owner').toBe(
      employer.account.address.toLowerCase(),
    )

    // Tiny amounts — nothing is transferred at create time (funding is a separate flow).
    const roster: RosterEntry[] = [
      { index: 0, recipient: '0xAb81c57CCc578a5636BFF47B896BEC6Af1c30012', amount: PMTT / 1_000_000n },
      { index: 1, recipient: '0xF505c61776e8234Ce45C59D7e28d074D9d023DFe', amount: (2n * PMTT) / 1_000_000n },
    ]
    const campaignName = `E2E test ${new Date().toISOString()}`

    const { facadeAddress, runId, tree } = await createCampaignOnChain({
      signer: employer,
      aesKey,
      roster,
      campaignName,
    })
    expect(tree.packages).toHaveLength(roster.length)

    // The factory must have left the facade fully wired in its single tx.
    const facade = { address: facadeAddress, abi: avaxContracts.payrollCampaignFacade.abi } as const
    const { fujiPublic } = employer
    const [admin, merkleRoot, token, wiredVault, wiredRunId, deployer] = await Promise.all([
      fujiPublic.readContract({ ...facade, functionName: 'admin' }),
      fujiPublic.readContract({ ...facade, functionName: 'MERKLE_ROOT' }),
      fujiPublic.readContract({ ...facade, functionName: 'TOKEN' }),
      fujiPublic.readContract({ ...facade, functionName: 'payrollVault' }),
      fujiPublic.readContract({ ...facade, functionName: 'runId' }),
      fujiPublic.readContract({ ...facade, functionName: 'DEPLOYER' }),
    ])
    expect(admin.toLowerCase()).toBe(employer.account.address.toLowerCase())
    expect(merkleRoot).toBe(tree.root)
    expect(token.toLowerCase()).toBe(avaxContracts.pToken.address.toLowerCase())
    expect(wiredVault.toLowerCase()).toBe(avaxContracts.payrollVault.address.toLowerCase())
    expect(wiredRunId).toBe(runId)
    expect(deployer.toLowerCase()).toBe(avaxContracts.payrollCampaignFactory.address.toLowerCase())

    const vaultRun = await fujiPublic.readContract({
      ...avaxContracts.payrollVault,
      functionName: 'runs',
      args: [runId],
    })
    expect(vaultRun[2].toLowerCase()).toBe(facadeAddress.toLowerCase()) // facade
    expect(vaultRun[5]).toBe(true) // exists

    // COTI side: run registered with the same root, and every leaf mirrored on the facade.
    const cotiRun = await employer.cotiPublic.readContract({
      ...cotiTestnetContracts.privatePayrollCoti,
      functionName: 'runs',
      args: [runId],
    })
    expect(cotiRun[0]).toBe(tree.root) // eligibilityRoot
    expect(cotiRun[1]).toBe(true) // exists

    for (const pkg of tree.packages) {
      const [registeredRecipient, registeredCommitment] = await Promise.all([
        fujiPublic.readContract({ ...facade, functionName: 'registeredRecipient', args: [BigInt(pkg.index)] }),
        fujiPublic.readContract({ ...facade, functionName: 'amountCommitment', args: [BigInt(pkg.index)] }),
      ])
      expect(registeredRecipient.toLowerCase()).toBe(pkg.recipient.toLowerCase())
      expect(registeredCommitment).toBe(pkg.amountCommitment)
    }

    console.info(
      `[testnet] payroll fully created: name="${campaignName}" facade=${facadeAddress} runId=${runId} leaves=${tree.packages.length}`,
    )
  })
})
