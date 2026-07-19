import { beforeAll, describe, expect, it } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  parseEventLogs,
  type Hex,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { avalancheFuji } from 'viem/chains'
import { JsonRpcProvider, Wallet as CotiEthersWallet } from '@coti-io/coti-ethers'
import { AVAX_CHAIN_ID, COTI_TESTNET_CHAIN_ID, avaxContracts, cotiTestnetContracts } from '../../src/config/contracts'
import { buildPayrollMerkleTree, type RosterEntry } from '../../src/lib/merkle'
import { buildRegisterLeafIt, type SignMessageAsync } from '../../src/lib/buildPayrollIt'
import { COTI_REGISTER_LEAF_GAS } from '../../src/lib/podFees'

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
//   PRIVATE_AES_KEY3_TESTNET  — optional; PRIVATE_KEY3's COTI AES key. When unset the test
//                               onboards via coti-ethers (one extra COTI tx per run).

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc'
const COTI_RPC = 'https://testnet.coti.io/rpc'
const PTOKEN_DECIMALS = 18n

const rawKey3 = process.env.PRIVATE_KEY3
const privateKey3 = rawKey3 ? ((rawKey3.startsWith('0x') ? rawKey3 : `0x${rawKey3}`) as Hex) : undefined

const cotiTestnet = defineChain({
  id: COTI_TESTNET_CHAIN_ID,
  name: 'COTI Testnet',
  nativeCurrency: { name: 'COTI', symbol: 'COTI', decimals: 18 },
  rpcUrls: { default: { http: [COTI_RPC] } },
})

describe.skipIf(!privateKey3)('create-campaign flow on live Fuji + COTI testnet', () => {
  const account = privateKeyToAccount(privateKey3 ?? '0x0000000000000000000000000000000000000000000000000000000000000001')

  const fujiPublic = createPublicClient({ chain: avalancheFuji, transport: http(FUJI_RPC) })
  const cotiPublic = createPublicClient({ chain: cotiTestnet, transport: http(COTI_RPC) })
  const fujiWallet = createWalletClient({ account, chain: avalancheFuji, transport: http(FUJI_RPC) })
  const cotiWallet = createWalletClient({ account, chain: cotiTestnet, transport: http(COTI_RPC) })

  // Same signature shape the UI's wagmi signMessageAsync produces (EIP-191 personal_sign) —
  // the ITs bake the signer into the ciphertext digest, so this must match the tx sender.
  const signMessageAsync: SignMessageAsync = (args) => account.signMessage({ message: args.message })

  let aesKey: string

  beforeAll(async () => {
    const fromEnv = process.env.PRIVATE_AES_KEY3_TESTNET
    if (fromEnv) {
      aesKey = fromEnv
      return
    }
    // COTI's account key is persistent per address — onboarding again re-delivers the same
    // AES key wrapped for a fresh RSA keypair, at the cost of one COTI tx.
    const wallet = new CotiEthersWallet(privateKey3!, new JsonRpcProvider(COTI_RPC))
    await wallet.generateOrRecoverAes()
    const recovered = wallet.getUserOnboardInfo()?.aesKey
    if (!recovered) throw new Error('coti-ethers onboarding did not return an AES key.')
    aesKey = recovered
    console.info(
      '[testnet] onboarded PRIVATE_KEY3 on COTI to recover its AES key; ' +
        'set PRIVATE_AES_KEY3_TESTNET in the repo-root .env to skip this tx on future runs.',
    )
  })

  it('creates a payroll end-to-end (factory createCampaign, COTI registration, facade leaves)', async () => {
    // Preflight: same gate the UI enforces — COTI-side registerRun/registerLeaf are onlyOwner.
    const cotiOwner = await cotiPublic.readContract({
      ...cotiTestnetContracts.privatePayrollCoti,
      functionName: 'owner',
    })
    expect(cotiOwner.toLowerCase(), 'PRIVATE_KEY3 must be the PrivatePayrollCoti owner').toBe(
      account.address.toLowerCase(),
    )

    // Tiny amounts — nothing is transferred at create time (funding is a separate flow),
    // but keep them small anyway so an accidental later fund/claim against this run is cheap.
    const roster: RosterEntry[] = [
      { index: 0, recipient: '0xAb81c57CCc578a5636BFF47B896BEC6Af1c30012', amount: 10n ** (PTOKEN_DECIMALS - 6n) },
      { index: 1, recipient: '0x226D3Eb51e24D98150e682d0337c214779cD52A2', amount: 2n * 10n ** (PTOKEN_DECIMALS - 6n) },
    ]
    const campaignName = `E2E test ${new Date().toISOString()}`
    const now = Math.floor(Date.now() / 1000)
    const campaignStartTime = now - 60
    // Unlike the UI's "no expiration" default, expire test campaigns after an hour so they
    // read as Expired (not Active) in the employer's List Payroll table.
    const expiration = now + 3600

    const tree = buildPayrollMerkleTree(roster, aesKey)
    expect(tree.packages).toHaveLength(roster.length)

    // 1. One factory tx on Fuji — replaces the old deploy + createRun + wirePayroll sequence.
    const createHash = await fujiWallet.writeContract({
      ...avaxContracts.payrollCampaignFactory,
      functionName: 'createCampaign',
      args: [account.address, tree.root, avaxContracts.pToken.address, campaignStartTime, expiration, campaignName, 0n],
    })
    const createReceipt = await fujiPublic.waitForTransactionReceipt({ hash: createHash })
    expect(createReceipt.status).toBe('success')

    const [campaignCreated] = parseEventLogs({
      abi: avaxContracts.payrollCampaignFactory.abi,
      eventName: 'CampaignCreated',
      logs: createReceipt.logs,
    })
    expect(campaignCreated, 'CampaignCreated event missing from receipt').toBeDefined()
    const facadeAddress = campaignCreated.args.facade
    const runId = campaignCreated.args.runId
    console.info(`[testnet] campaign created: facade=${facadeAddress} runId=${runId} tx=${createHash}`)

    // The factory must have left the facade fully wired in that same tx.
    const facade = { address: facadeAddress, abi: avaxContracts.payrollCampaignFacade.abi } as const
    const [admin, merkleRoot, token, wiredVault, wiredRunId, deployer] = await Promise.all([
      fujiPublic.readContract({ ...facade, functionName: 'admin' }),
      fujiPublic.readContract({ ...facade, functionName: 'MERKLE_ROOT' }),
      fujiPublic.readContract({ ...facade, functionName: 'TOKEN' }),
      fujiPublic.readContract({ ...facade, functionName: 'payrollVault' }),
      fujiPublic.readContract({ ...facade, functionName: 'runId' }),
      fujiPublic.readContract({ ...facade, functionName: 'DEPLOYER' }),
    ])
    expect(admin.toLowerCase()).toBe(account.address.toLowerCase())
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

    // 2. Register the run on COTI (onlyOwner).
    const registerRunHash = await cotiWallet.writeContract({
      ...cotiTestnetContracts.privatePayrollCoti,
      functionName: 'registerRun',
      args: [runId, tree.root],
    })
    const registerRunReceipt = await cotiPublic.waitForTransactionReceipt({ hash: registerRunHash })
    expect(registerRunReceipt.status).toBe('success')

    const cotiRun = await cotiPublic.readContract({
      ...cotiTestnetContracts.privatePayrollCoti,
      functionName: 'runs',
      args: [runId],
    })
    expect(cotiRun[0]).toBe(tree.root) // eligibilityRoot
    expect(cotiRun[1]).toBe(true) // exists

    // 3. Register every leaf on COTI with its encrypted amount (onlyOwner; IT bound to
    //    (PrivatePayrollCoti, registerLeaf) and signed by the sender).
    for (const pkg of tree.packages) {
      const itAmount = await buildRegisterLeafIt({
        amount: pkg.amount,
        aesKey,
        signerAddress: account.address,
        signMessageAsync,
      })
      const hash = await cotiWallet.writeContract({
        ...cotiTestnetContracts.privatePayrollCoti,
        functionName: 'registerLeaf',
        args: [runId, BigInt(pkg.index), pkg.recipient, pkg.amountCommitment, itAmount],
        gas: COTI_REGISTER_LEAF_GAS,
      })
      const receipt = await cotiPublic.waitForTransactionReceipt({ hash })
      expect(receipt.status, `COTI registerLeaf for index ${pkg.index}`).toBe('success')
      console.info(`[testnet] COTI leaf ${pkg.index} registered: tx=${hash}`)
    }

    // 4. Mirror the leaves on the Fuji facade (admin-only bookkeeping for instant claims).
    for (const pkg of tree.packages) {
      const hash = await fujiWallet.writeContract({
        ...facade,
        functionName: 'registerLeaf',
        args: [BigInt(pkg.index), pkg.recipient, pkg.amountCommitment],
      })
      const receipt = await fujiPublic.waitForTransactionReceipt({ hash })
      expect(receipt.status, `facade registerLeaf for index ${pkg.index}`).toBe('success')

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
