import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  getAbiItem,
  parseAbi,
  parseEventLogs,
  type Hex,
  type PublicClient,
  type WalletClient,
  type Account,
  type Chain,
  type Transport,
} from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { avalancheFuji } from 'viem/chains'
import { decryptCtUint256 } from '@coti-io/coti-sdk-typescript'
import { JsonRpcProvider, Wallet as CotiEthersWallet } from '@coti-io/coti-ethers'
import { COTI_TESTNET_CHAIN_ID, avaxContracts, cotiTestnetContracts } from '../../src/config/contracts'
import { buildPayrollMerkleTree, type PayrollMerkleTree, type RosterEntry } from '../../src/lib/merkle'
import { buildRegisterLeafIt, type SignMessageAsync } from '../../src/lib/buildPayrollIt'
import { COTI_REGISTER_LEAF_GAS } from '../../src/lib/podFees'

// Shared plumbing for the real-network (Fuji + COTI testnet) suites. Everything here reuses
// the UI's production modules — merkle builder, IT builders, contracts config — swapping only
// the wagmi wallet layer for direct viem clients.

loadEnv({ path: fileURLToPath(new URL('../../../.env', import.meta.url)), quiet: true })

export const FUJI_RPC = 'https://api.avax-test.network/ext/bc/C/rpc'
export const COTI_RPC = 'https://testnet.coti.io/rpc'
export const PMTT = 10n ** 18n // 1 pMTT in wei (18 decimals)

// From deployments/production-payroll-avalancheFuji.json (2026-07-17). Test-seed infra only —
// the UI itself never touches the portal or the public underlying, so these stay out of
// src/config/contracts.ts.
export const PRIVACY_PORTAL = '0x64D99D761aC68D1a495B4f7E5bE7277586EDFE78' as const
export const UNDERLYING_MTT = '0x328e70e1c52662cd5f19f824fcb8b463d77a6686' as const

export const portalAbi = parseAbi([
  'function deposit(address recipient, uint256 amount, uint256 portalFee, uint256 mintCallbackFee) payable returns (bytes32)',
  'function estimateDepositFees(uint256 amount) view returns (uint256 portalFee, bool usedDynamicPricing)',
])

export const erc20Abi = parseAbi([
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
])

export const cotiTestnet = defineChain({
  id: COTI_TESTNET_CHAIN_ID,
  name: 'COTI Testnet',
  nativeCurrency: { name: 'COTI', symbol: 'COTI', decimals: 18 },
  rpcUrls: { default: { http: [COTI_RPC] } },
})

export function envPrivateKey(name: string): Hex | undefined {
  const raw = process.env[name]
  if (!raw) return undefined
  return (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex
}

export type TestnetSigner = {
  account: Account
  fujiPublic: PublicClient
  cotiPublic: PublicClient
  fujiWallet: WalletClient<Transport, Chain, Account>
  cotiWallet: WalletClient<Transport, Chain, Account>
  signMessageAsync: SignMessageAsync
}

export function makeSigner(privateKey: Hex): TestnetSigner {
  const account = privateKeyToAccount(privateKey)
  return {
    account,
    fujiPublic: createPublicClient({ chain: avalancheFuji, transport: http(FUJI_RPC) }),
    cotiPublic: createPublicClient({ chain: cotiTestnet, transport: http(COTI_RPC) }),
    fujiWallet: createWalletClient({ account, chain: avalancheFuji, transport: http(FUJI_RPC) }),
    cotiWallet: createWalletClient({ account, chain: cotiTestnet, transport: http(COTI_RPC) }),
    // Same EIP-191 personal_sign shape the UI's wagmi signMessageAsync produces — the ITs
    // bake the signer into the ciphertext digest, so this must match the tx sender.
    signMessageAsync: (args) => account.signMessage({ message: args.message }),
  }
}

/**
 * The account's COTI AES key: from `envVar` when set, else recovered via one coti-ethers
 * onboarding tx. Onboarding re-delivers the account's persistent network key (verified:
 * a balance ciphertext written before a re-onboard still decrypts with the re-onboarded
 * key), so the env pin only saves the extra COTI tx per run.
 */
export async function resolveAesKey(envVar: string, privateKey: Hex): Promise<string> {
  const fromEnv = process.env[envVar]
  if (fromEnv) return fromEnv
  const wallet = new CotiEthersWallet(privateKey, new JsonRpcProvider(COTI_RPC))
  await wallet.generateOrRecoverAes()
  const recovered = wallet.getUserOnboardInfo()?.aesKey
  if (!recovered) throw new Error(`coti-ethers onboarding did not return an AES key for ${envVar}'s account.`)
  console.info(`[testnet] onboarded ${privateKeyToAccount(privateKey).address} on COTI; pin its AES key as ${envVar} in the repo-root .env to skip this tx on future runs.`)
  return recovered
}

export async function decryptPMttBalance(
  fujiPublic: PublicClient,
  account: Hex,
  aesKey: string,
): Promise<{ balance: bigint; pending: boolean }> {
  const [ct, pending] = await fujiPublic.readContract({
    ...avaxContracts.pToken,
    functionName: 'balanceOfWithStatus',
    args: [account],
  })
  // A never-touched account stores the literal zero ciphertext, which is not a valid
  // encryption of anything — decrypting it yields garbage rather than 0.
  const balance =
    ct.ciphertextHigh === 0n && ct.ciphertextLow === 0n
      ? 0n
      : decryptCtUint256({ ciphertextHigh: ct.ciphertextHigh, ciphertextLow: ct.ciphertextLow }, aesKey)
  return { balance, pending }
}

/**
 * Waits for a pToken transfer/mint to actually settle by watching for the async result
 * events — same logic as useFundCampaign: a mined submission tx is NOT completion; the
 * COTI round trip lands later as `Transfer` (success) or `TransferFailed` (failure).
 */
export async function waitForPTokenSettle(params: {
  fujiPublic: PublicClient
  from: Hex
  to: Hex
  fromBlock: bigint
  timeoutMs?: number
  label: string
}): Promise<void> {
  const { fujiPublic, from, to, fromBlock, timeoutMs = 180_000, label } = params
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const [ok, failed] = await Promise.all([
      fujiPublic.getLogs({
        address: avaxContracts.pToken.address,
        event: getAbiItem({ abi: avaxContracts.pToken.abi, name: 'Transfer' }),
        args: { from, to },
        fromBlock,
      }),
      fujiPublic.getLogs({
        address: avaxContracts.pToken.address,
        event: getAbiItem({ abi: avaxContracts.pToken.abi, name: 'TransferFailed' }),
        args: { from, to },
        fromBlock,
      }),
    ])
    if (failed.length > 0) throw new Error(`${label} failed on-chain: ${failed[0].args.errorMsg}`)
    if (ok.length > 0) return
    await new Promise((r) => setTimeout(r, 3_000))
  }
  throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s waiting for ${label} to settle.`)
}

export type CreatedCampaign = {
  facadeAddress: Hex
  runId: bigint
  tree: PayrollMerkleTree
}

/**
 * Full campaign creation, mirroring useCreateCampaign step for step: one factory tx on
 * Fuji, registerRun + per-leaf registerLeaf on COTI (onlyOwner, explicit MPC gas), then
 * per-leaf registerLeaf on the facade.
 */
export async function createCampaignOnChain(params: {
  signer: TestnetSigner
  aesKey: string
  roster: RosterEntry[]
  campaignName: string
  expiration?: number
}): Promise<CreatedCampaign> {
  const { signer, aesKey, roster, campaignName } = params
  const { account, fujiPublic, cotiPublic, fujiWallet, cotiWallet, signMessageAsync } = signer

  const tree = buildPayrollMerkleTree(roster, aesKey)
  const now = Math.floor(Date.now() / 1000)
  const campaignStartTime = now - 60
  // Default: expire test campaigns after an hour so they read as Expired in List Payroll.
  const expiration = params.expiration ?? now + 3600

  const createHash = await fujiWallet.writeContract({
    ...avaxContracts.payrollCampaignFactory,
    functionName: 'createCampaign',
    args: [account.address, tree.root, avaxContracts.pToken.address, campaignStartTime, expiration, campaignName, 0n],
  })
  const createReceipt = await fujiPublic.waitForTransactionReceipt({ hash: createHash })
  if (createReceipt.status !== 'success') throw new Error(`createCampaign reverted (tx ${createHash}).`)
  const [campaignCreated] = parseEventLogs({
    abi: avaxContracts.payrollCampaignFactory.abi,
    eventName: 'CampaignCreated',
    logs: createReceipt.logs,
  })
  if (!campaignCreated) throw new Error('CampaignCreated event missing from receipt.')
  const facadeAddress = campaignCreated.args.facade
  const runId = campaignCreated.args.runId
  console.info(`[testnet] campaign created: facade=${facadeAddress} runId=${runId} tx=${createHash}`)

  const registerRunHash = await cotiWallet.writeContract({
    ...cotiTestnetContracts.privatePayrollCoti,
    functionName: 'registerRun',
    args: [runId, tree.root],
  })
  const registerRunReceipt = await cotiPublic.waitForTransactionReceipt({ hash: registerRunHash })
  if (registerRunReceipt.status !== 'success') throw new Error(`registerRun reverted (tx ${registerRunHash}).`)

  for (const pkg of tree.packages) {
    const itAmount = await buildRegisterLeafIt({
      amount: pkg.amount,
      aesKey,
      signerAddress: account.address as Hex,
      signMessageAsync,
    })
    const hash = await cotiWallet.writeContract({
      ...cotiTestnetContracts.privatePayrollCoti,
      functionName: 'registerLeaf',
      args: [runId, BigInt(pkg.index), pkg.recipient, pkg.amountCommitment, itAmount],
      gas: COTI_REGISTER_LEAF_GAS,
    })
    const receipt = await cotiPublic.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`COTI registerLeaf reverted for index ${pkg.index} (tx ${hash}).`)
    console.info(`[testnet] COTI leaf ${pkg.index} registered: tx=${hash}`)
  }

  const facade = { address: facadeAddress, abi: avaxContracts.payrollCampaignFacade.abi } as const
  for (const pkg of tree.packages) {
    const hash = await fujiWallet.writeContract({
      ...facade,
      functionName: 'registerLeaf',
      args: [BigInt(pkg.index), pkg.recipient, pkg.amountCommitment],
    })
    const receipt = await fujiPublic.waitForTransactionReceipt({ hash })
    if (receipt.status !== 'success') throw new Error(`facade registerLeaf reverted for index ${pkg.index} (tx ${hash}).`)
  }

  return { facadeAddress, runId, tree }
}
