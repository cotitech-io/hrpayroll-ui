import { config as loadEnv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  encodeAbiParameters,
  getAbiItem,
  parseAbi,
  parseEventLogs,
  zeroAddress,
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
import {
  buildClaimIt,
  buildRegisterLeafIt,
  buildVerifyIt,
  CLAIM_SELECTOR,
  type SignMessageAsync,
} from '../../src/lib/buildPayrollIt'
import { toClaimPackage, type ClaimPackage } from '../../src/lib/claimPackage'
import { computePTokenTwoWayFees, COTI_REGISTER_LEAF_GAS } from '../../src/lib/podFees'

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
  const address = privateKeyToAccount(privateKey).address
  let lastError: unknown
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const wallet = new CotiEthersWallet(privateKey, new JsonRpcProvider(COTI_RPC))
      await wallet.generateOrRecoverAes()
      const recovered = wallet.getUserOnboardInfo()?.aesKey
      if (!recovered) {
        throw new Error(`coti-ethers onboarding did not return an AES key for ${address}.`)
      }
      console.info(
        `[testnet] onboarded ${address} on COTI; pin its AES key as ${envVar} in the repo-root .env to skip this tx on future runs.`,
      )
      return recovered
    } catch (e) {
      lastError = e
      console.warn(
        `[testnet] resolveAesKey(${envVar}) attempt ${attempt}/3 failed for ${address}: ` +
          `${e instanceof Error ? e.message : e}`,
      )
      if (attempt < 3) await new Promise((r) => setTimeout(r, 5_000 * attempt))
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`Failed to resolve AES key for ${envVar} (${address})`)
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
  const { fujiPublic, from, to, fromBlock, timeoutMs = 300_000, label } = params
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

// COTI testnet regularly drops underpriced / long-pending txs from the public mempool
// (seen as WaitForTransactionReceiptTimeoutError with getTransaction → not found). Retry
// with bumped EIP-1559 fees rather than failing the whole create/fund flow. Poll for drop
// early so we don't burn the full receipt timeout on a vanished tx.
const COTI_RECEIPT_TIMEOUT_MS = 180_000
const COTI_DROP_GRACE_MS = 45_000
const COTI_WRITE_ATTEMPTS = 4

async function waitCotiReceiptOrDrop(signer: TestnetSigner, hash: Hex, label: string): Promise<'mined' | 'dropped'> {
  const deadline = Date.now() + COTI_RECEIPT_TIMEOUT_MS
  const dropAfter = Date.now() + COTI_DROP_GRACE_MS
  while (Date.now() < deadline) {
    const receipt = await signer.cotiPublic.getTransactionReceipt({ hash }).catch(() => null)
    if (receipt) {
      if (receipt.status !== 'success') throw new Error(`${label} reverted (tx ${hash}).`)
      return 'mined'
    }
    const inMempool = await signer.cotiPublic.getTransaction({ hash }).then(
      () => true,
      () => false,
    )
    if (!inMempool && Date.now() >= dropAfter) return 'dropped'
    await new Promise((r) => setTimeout(r, 3_000))
  }
  const inMempool = await signer.cotiPublic.getTransaction({ hash }).then(
    () => true,
    () => false,
  )
  if (!inMempool) return 'dropped'
  throw new Error(`${label} timed out waiting for receipt (tx ${hash} still pending).`)
}

async function writeCotiContract(params: {
  signer: TestnetSigner
  label: string
  write: (fees: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }) => Promise<Hex>
}): Promise<void> {
  const { signer, label, write } = params
  let feeMultiplier = 2n
  let lastError: unknown
  for (let attempt = 1; attempt <= COTI_WRITE_ATTEMPTS; attempt++) {
    const fees = await signer.cotiPublic.estimateFeesPerGas()
    const maxFeePerGas = (fees.maxFeePerGas ?? 1_000_000_000n) * feeMultiplier
    const maxPriorityFeePerGas = (fees.maxPriorityFeePerGas ?? 1_000_000_000n) * feeMultiplier
    let hash: Hex
    try {
      hash = await write({ maxFeePerGas, maxPriorityFeePerGas })
    } catch (e) {
      lastError = e
      const msg = e instanceof Error ? e.message : String(e)
      if (/underpriced|nonce too low|replacement/i.test(msg) && attempt < COTI_WRITE_ATTEMPTS) {
        console.warn(`[testnet] ${label} submit failed (${msg}); bumping fees and retrying…`)
        feeMultiplier *= 2n
        continue
      }
      throw e
    }
    console.info(`[testnet] ${label} submitted (attempt ${attempt}/${COTI_WRITE_ATTEMPTS}): ${hash}`)
    try {
      const outcome = await waitCotiReceiptOrDrop(signer, hash, label)
      if (outcome === 'mined') return
      console.warn(`[testnet] ${label} dropped from mempool; bumping fees and retrying…`)
      feeMultiplier *= 2n
    } catch (e) {
      lastError = e
      if (attempt < COTI_WRITE_ATTEMPTS) {
        console.warn(`[testnet] ${label} failed (${e instanceof Error ? e.message : e}); retrying…`)
        feeMultiplier *= 2n
        continue
      }
      throw e
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed after ${COTI_WRITE_ATTEMPTS} attempts`)
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
  const { account, fujiPublic, fujiWallet, signMessageAsync } = signer

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

  // Skip registerRun when a prior attempt already landed (orphaned Fuji facade recovery).
  const existingRun = await signer.cotiPublic.readContract({
    ...cotiTestnetContracts.privatePayrollCoti,
    functionName: 'runs',
    args: [runId],
  })
  if (!existingRun[1]) {
    await writeCotiContract({
      signer,
      label: 'registerRun',
      write: (fees) =>
        signer.cotiWallet.writeContract({
          ...cotiTestnetContracts.privatePayrollCoti,
          functionName: 'registerRun',
          args: [runId, tree.root],
          ...fees,
        }),
    })
  } else {
    console.info(`[testnet] COTI run ${runId} already registered; skipping registerRun`)
  }

  for (const pkg of tree.packages) {
    const itAmount = await buildRegisterLeafIt({
      amount: pkg.amount,
      aesKey,
      signerAddress: account.address as Hex,
      signMessageAsync,
    })
    await writeCotiContract({
      signer,
      label: `registerLeaf[${pkg.index}]`,
      write: (fees) =>
        signer.cotiWallet.writeContract({
          ...cotiTestnetContracts.privatePayrollCoti,
          functionName: 'registerLeaf',
          args: [runId, BigInt(pkg.index), pkg.recipient, pkg.amountCommitment, itAmount],
          gas: COTI_REGISTER_LEAF_GAS,
          ...fees,
        }),
    })
    console.info(`[testnet] COTI leaf ${pkg.index} registered`)
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

/** Portal-mint pMTT to `funder`, public-transfer into the facade, then admin requestCreditPool. */
export async function fundCampaignOnChain(params: {
  employer: TestnetSigner
  funder: TestnetSigner
  funderAesKey: string
  facadeAddress: Hex
  amount: bigint
}): Promise<void> {
  const { employer, funder, funderAesKey, facadeAddress, amount } = params
  const { fujiPublic } = employer
  const funderAddr = funder.account.address as Hex

  const allowance = await fujiPublic.readContract({
    address: UNDERLYING_MTT,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [employer.account.address as Hex, PRIVACY_PORTAL],
  })
  if (allowance < amount) {
    const approveHash = await employer.fujiWallet.writeContract({
      address: UNDERLYING_MTT,
      abi: erc20Abi,
      functionName: 'approve',
      args: [PRIVACY_PORTAL, amount],
    })
    const approveReceipt = await fujiPublic.waitForTransactionReceipt({ hash: approveHash })
    if (approveReceipt.status !== 'success') throw new Error(`MTT approve reverted (tx ${approveHash}).`)
  }

  const [portalFee] = await fujiPublic.readContract({
    address: PRIVACY_PORTAL,
    abi: portalAbi,
    functionName: 'estimateDepositFees',
    args: [amount],
  })
  const { pTokenTransferFeeWei, pTokenCallbackFeeWei } = await computePTokenTwoWayFees(fujiPublic)

  const depositHash = await employer.fujiWallet.writeContract({
    address: PRIVACY_PORTAL,
    abi: portalAbi,
    functionName: 'deposit',
    args: [funderAddr, amount, portalFee, pTokenCallbackFeeWei],
    value: portalFee + pTokenTransferFeeWei,
  })
  const depositReceipt = await fujiPublic.waitForTransactionReceipt({ hash: depositHash })
  if (depositReceipt.status !== 'success') throw new Error(`portal deposit reverted (tx ${depositHash}).`)
  await waitForPTokenSettle({
    fujiPublic,
    from: zeroAddress,
    to: funderAddr,
    fromBlock: depositReceipt.blockNumber,
    label: 'portal mint to funder',
  })
  const { pending: funderPending } = await decryptPMttBalance(fujiPublic, funderAddr, funderAesKey)
  if (funderPending) throw new Error(`Funder ${funderAddr} still pending after portal mint settle.`)

  const transferHash = await funder.fujiWallet.writeContract({
    ...avaxContracts.pToken,
    functionName: 'transfer',
    args: [facadeAddress, amount, pTokenCallbackFeeWei],
    value: pTokenTransferFeeWei,
  })
  const transferReceipt = await fujiPublic.waitForTransactionReceipt({ hash: transferHash })
  if (transferReceipt.status !== 'success') throw new Error(`pToken transfer reverted (tx ${transferHash}).`)
  await waitForPTokenSettle({
    fujiPublic,
    from: funderAddr,
    to: facadeAddress,
    fromBlock: transferReceipt.blockNumber,
    label: 'fund transfer to facade',
  })

  const facade = { address: facadeAddress, abi: avaxContracts.payrollCampaignFacade.abi } as const
  const creditedBefore = await fujiPublic.readContract({ ...facade, functionName: 'poolCreditedTotal' })
  const inboxFeeWei = await fujiPublic.readContract({ ...facade, functionName: 'inboxFeeWei' })
  const creditHash = await employer.fujiWallet.writeContract({
    ...facade,
    functionName: 'requestCreditPool',
    args: [amount],
    value: inboxFeeWei,
  })
  const creditReceipt = await fujiPublic.waitForTransactionReceipt({ hash: creditHash })
  if (creditReceipt.status !== 'success') throw new Error(`requestCreditPool reverted (tx ${creditHash}).`)

  const deadline = Date.now() + 300_000
  while (Date.now() < deadline) {
    const [total, poolLogs] = await Promise.all([
      fujiPublic.readContract({ ...facade, functionName: 'poolCreditedTotal' }),
      fujiPublic.getLogs({
        address: facadeAddress,
        event: getAbiItem({ abi: facade.abi, name: 'PoolCredited' }),
        fromBlock: creditReceipt.blockNumber,
      }),
    ])
    if (total >= creditedBefore + amount || poolLogs.length > 0) {
      console.info(`[testnet] pool credited: facade=${facadeAddress} poolCreditedTotal=${total}`)
      return
    }
    await new Promise((r) => setTimeout(r, 3_000))
  }
  throw new Error(`Timed out waiting for PoolCredited after requestCreditPool (tx ${creditHash}).`)
}

const REQUEST_PENDING = 1
const REQUEST_FAILED = 3

/**
 * Employee claim path mirroring useClaimFlow (iter08): submitPayload(verifyIt, proof) →
 * claim → wait for hasClaimed / vault payoutRequestStatus.
 */
export async function claimOnChain(params: {
  claimant: TestnetSigner
  aesKey: string
  pkg: ClaimPackage
  timeoutMs?: number
}): Promise<{ claimHash: Hex; requestId: Hex | undefined; completed: boolean }> {
  const { claimant, aesKey, pkg, timeoutMs = 300_000 } = params
  const { fujiPublic, fujiWallet, signMessageAsync } = claimant
  const address = claimant.account.address as Hex
  if (address.toLowerCase() !== pkg.recipient.toLowerCase()) {
    throw new Error(`CLAIM_PK address ${address} != package recipient ${pkg.recipient}`)
  }

  const facade = { address: pkg.facadeAddress, abi: avaxContracts.payrollCampaignFacade.abi } as const
  const amount = BigInt(pkg.amount)

  const [expired, alreadyClaimed, inboxFeeWei, facadeBalance] = await Promise.all([
    fujiPublic.readContract({ ...facade, functionName: 'hasExpired' }),
    fujiPublic.readContract({ ...facade, functionName: 'hasClaimed', args: [BigInt(pkg.index)] }),
    fujiPublic.readContract({ ...facade, functionName: 'inboxFeeWei' }),
    fujiPublic.getBalance({ address: pkg.facadeAddress }),
  ])
  if (expired) throw new Error('Campaign has expired.')
  if (alreadyClaimed) throw new Error(`Index ${pkg.index} already claimed.`)
  if (facadeBalance < inboxFeeWei) {
    throw new Error(
      `Facade ${pkg.facadeAddress} needs ≥ ${inboxFeeWei} wei AVAX for inbox fee (has ${facadeBalance}).`,
    )
  }

  const signerParams = { aesKey, signerAddress: address, signMessageAsync }
  const verifyIt = await buildVerifyIt({ amount, signerAddress: address })
  const claimIt = await buildClaimIt({
    amount,
    ...signerParams,
    facadeAddress: pkg.facadeAddress,
    selector: CLAIM_SELECTOR,
  })
  const proofHandle = encodeAbiParameters(
    [{ type: 'bytes32[]' }, { type: 'uint256' }],
    [pkg.proof, BigInt(pkg.index)],
  )

  const submitHash = await fujiWallet.writeContract({
    ...avaxContracts.payrollClaimStore,
    functionName: 'submitPayload',
    args: [pkg.facadeAddress, BigInt(pkg.index), verifyIt, proofHandle],
  })
  const submitReceipt = await fujiPublic.waitForTransactionReceipt({ hash: submitHash })
  if (submitReceipt.status !== 'success') throw new Error(`submitPayload reverted (tx ${submitHash}).`)
  console.info(`[testnet] submitPayload ok: ${submitHash}`)

  const minFeeWei = await fujiPublic.readContract({ ...facade, functionName: 'calculateMinFeeWei' })
  const claimHash = await fujiWallet.writeContract({
    ...facade,
    functionName: 'claim',
    args: [BigInt(pkg.index), pkg.recipient, claimIt, pkg.proof],
    value: minFeeWei,
  })
  const claimReceipt = await fujiPublic.waitForTransactionReceipt({ hash: claimHash })
  if (claimReceipt.status !== 'success') throw new Error(`claim reverted (tx ${claimHash}).`)
  console.info(`[testnet] claim mined: ${claimHash}`)

  const requestedLogs = await fujiPublic.getLogs({
    address: avaxContracts.payrollVault.address,
    event: getAbiItem({ abi: avaxContracts.payrollVault.abi, name: 'PayoutRequested' }),
    fromBlock: claimReceipt.blockNumber,
    toBlock: claimReceipt.blockNumber,
  })
  const requestId = requestedLogs.find(
    (l) => l.transactionHash === claimHash && l.args.index === BigInt(pkg.index),
  )?.args.requestId as Hex | undefined
  console.info(`[testnet] payout requestId=${requestId ?? '(none)'}`)

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const claimed = await fujiPublic.readContract({
      ...facade,
      functionName: 'hasClaimed',
      args: [BigInt(pkg.index)],
    })
    if (claimed) return { claimHash, requestId, completed: true }

    if (requestId) {
      const status = await fujiPublic.readContract({
        ...avaxContracts.payrollVault,
        functionName: 'payoutRequestStatus',
        args: [requestId],
      })
      if (status === REQUEST_FAILED) {
        throw new Error(
          `COTI rejected claim (payoutRequestStatus=Failed, requestId=${requestId}, claimTx=${claimHash}).`,
        )
      }
      if (status === REQUEST_PENDING) {
        console.info(
          `[testnet] payout still Pending on COTI inbox requestId=${requestId} ` +
            `(${Math.round((deadline - Date.now()) / 1000)}s left)`,
        )
      }
    }
    await new Promise((r) => setTimeout(r, 3_000))
  }

  return { claimHash, requestId, completed: false }
}

export function claimPackageFromTree(
  tree: PayrollMerkleTree,
  facadeAddress: Hex,
  recipient: Hex,
): ClaimPackage {
  const pkg = tree.packages.find((p) => p.recipient.toLowerCase() === recipient.toLowerCase())
  if (!pkg) throw new Error(`No merkle package for recipient ${recipient}`)
  return toClaimPackage(pkg, facadeAddress)
}
