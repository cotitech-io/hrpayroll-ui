# Claim campaign flow

**Status: RESOLVED (2026-07-20).** Claims now complete end-to-end on live Fuji + COTI
testnet. Root cause was the verify-IT's *encryption path*, not an architectural
impossibility: `buildVerifyIt` (`src/lib/buildPayrollIt.ts`) previously built the
employee's `itUint256` locally (client-side AES encrypt + **wallet-signed** digest via
`@coti-io/coti-sdk-typescript`'s `buildItUint256WithSigner`) — that construction fails
`MpcCore.validateCiphertext` when executed inside a **miner-relayed**
`batchProcessRequests` call, deterministically, 9/9 attempts, regardless of AES key
correctness. Swapping to `@coti-io/pod-sdk`'s `CotiPodCrypto.encrypt` — which builds
the IT via the **PoD encryption service** (COTI-operated signing key, not the
caller's wallet) — fixed it on the first live attempt:
`isSpent(runId=6, index=0) == true` on `PrivatePayrollCoti`, confirmed directly
on-chain. No contract changes were needed; **iter09's contract redesign is no longer
required** — see
[How IT data types are actually encrypted](#how-it-data-types-are-actually-encrypted--and-a-cheaper-fix-than-iter09)
for the fix and [Which cause? Discriminating rerun](#which-cause-discriminating-rerun)
for the full experiment trail that led here.

The section below (originally written as the live status) is kept for the historical
record of the 9/9 failure evidence that motivated the fix.

**Former status: broken on live — tx-context signature binding suspected as cause,
2026-07-19.** Everything up to and including the Fuji `claim` tx worked; the COTI
`verifyAndCredit` leg was **never invoked**. The COTI inbox failed to re-encode the
message because `MpcCore.validateCiphertext` reverted on the employee's `itUint256`,
recorded `ENCODE_FAILED` locally, and never called back to Fuji — so
`payoutRequestStatus` stayed **Pending** forever and `hasClaimed` never flipped.

The discriminating rerun separated two candidate causes:

1. **Wrong AES key ("local encryption") — real bug, but NOT the blocker.** Every
   earlier run did encrypt the claim IT under a non-network key (env-var mismatch +
   broken AES recovery; fixed by pinning `CLAIM_AES_KEY`). The rerun with the
   **correct** network key failed identically.
2. **Wallet-signed vs. service-signed IT construction — this was it.** With the
   correct key, correct calldata, and a successfully mined Fuji claim, the
   *wallet-signed* IT still failed `validateCiphertext` on COTI with the same
   `ENCODE_FAILED` + identical `0xfe709212…` payload — 9 out of 9 attempts. Switching
   only the IT's encryption/signing path (same contracts, same calldata shape) to
   the PoD encryption service fixed it. What looked like "user-bound ITs cannot cross
   the PoD inbox in a miner-submitted tx" was actually "*locally wallet-signed* ITs
   cannot" — a narrower and fixable statement.

Verified with `npm run test:testnet -- tests/testnet/claimCampaign.test.ts`
(`.env` `CLAIM_ADDRESS` / `CLAIM_PK`), the same pattern in UI claim attempts, and by
querying the COTI inbox `errors` mapping directly.

---

## Latest live result (automated test)

| Step | Result | Evidence |
|------|--------|----------|
| Create (Fuji factory + COTI `registerRun` / `registerLeaf`) | OK | runId `3`, facade `0x1035fc4856F6361f1433ab706f812886b9DbE747` |
| Fund (portal → public `pToken.transfer` → `requestCreditPool`) | OK | Fuji `poolCreditedTotal = 100 pMTT` |
| COTI `creditPool` for that fund | OK | COTI `PoolCredited(runId=3)` at block `8582783` |
| Facade AVAX top-up | OK | balance after claim still ≫ `inboxFeeWei` |
| `submitPayload(verifyIt, proof)` | OK | tx `0xb1c497d9…` |
| Fuji `claim` | OK | tx `0x01bccba1…0938` — Inbox `MessageSent` + vault `PayoutRequested` + `ClaimInstant` |
| COTI inbox re-encode of the message | **ENCODE_FAILED** | `errors(…098) = (code 2, 0xfe709212…3d796f)`, recorded in tx `0xe99867cd…7089` at block `8582789` |
| COTI `verifyAndCredit` | **Never invoked** | Encode fails before the target call; no `PayoutVerified`, and `_reject` is unreachable |
| Fuji callback | **Never sent** | Encode errors are recorded locally on the COTI inbox; no `respond`/`raise` → no `PayoutCompleted`/`PayoutFailed`; request `…098` stays `1` (Pending) |
| `hasClaimed(0)` | false | unchanged |

| Field | Value |
|-------|--------|
| runId | `3` |
| facade | `0x1035fc4856F6361f1433ab706f812886b9DbE747` |
| claimant | `0xAb81c57CCc578a5636BFF47B896BEC6Af1c30012` |
| claimTx | `0x01bccba104034fb12fbf83eecdeff3a7b49ec95a858c6496f330f808ace30938` |
| requestId | `0x000000000000a86900000000006c11a000000000000000000000000000000098` |
| failing COTI tx | `0xe99867cd3494aec726697799fb2d8db4af9d876a3b217cd8c5c7b79806327089` (miner `0x075445b969e2a39e096dd1fbe9a323ae3353fb76` → inbox `batchProcessRequests` `0x108e1536`) |
| vault | `0x5befe6a1a38881eb1e2be092c1dd730f45811801` |
| PrivatePayrollCoti | `0x0483a18becb2b1311b7fee7be7168bc2356f3b8a` |

Earlier UI attempts on runId `2` left the same stuck Pending requests (`…093`, `…094`).

---

## Root cause analysis

### On-chain evidence

Querying the COTI inbox (`0xAb625bE229F603f6BBF964474AFf6d5487e364De`) directly:

- `errors(requestId)` for `…098`, `…093`, `…094` all return
  **`errorCode 2 = ERROR_CODE_ENCODE_FAILED`** with the identical opaque 32-byte
  payload `0xfe7092125aec8db3b33a152609bb6c7b66ae93b0a81479d9c31c2cd1003d796f`
  (not `Error(string)` / `Panic` — the gcEVM precompile's native revert blob).
- The full `ErrorReceived` history shows **every claim ever sent to this deploy failed
  the same way**: nonces `0x83, 0x85, 0x87, 0x8f, 0x93, 0x94, 0x98, 0x9c` — 8/8, all
  code 2, identical payload. Deterministic revert, not lag.
- `lastIncomingRequestId(43113)` is at nonce `0x9c`: inbox delivery itself is healthy.
  Plain-argument messages (`creditPool`) complete their two-way round trips fine.
- The failing COTI tx is sent by the **pod miner EOA** (`0x075445b9…`), never by the
  employee. That sender is the crux (below).

### Mechanism: why it hangs Pending instead of failing

In `InboxMiner._executeIncomingRequest`, the inbox first re-encodes the wire message
(`_safeEncodeMethodCall` → `MpcAbiCodec.reEncodeWithGt`), converting each `IT_UINT256`
arg to a `gtUint256` via `MpcCore.validateCiphertext`. That re-encode runs in a
try/catch; on revert the inbox **records the error locally** (`_recordEncodeError`),
marks the request executed, and returns — **no `respond`, no `raise`, no callback
leg**. `PrivatePayrollCoti.verifyAndCredit` is never even called, so its `_reject`
path (which would surface `PayoutFailed` on Fuji) is unreachable. The Fuji vault waits
for a callback that will never come.

Worse: `retryFailedRequest` only accepts `errorCode 1` (execution failure), so code-2
requests **cannot be retried** — and a retry would fail identically anyway.

### Candidate cause 1: wrong AES key — "local encryption" (confirmed present)

COTI-team feedback on the diagnosis: *"ENCODE_FAILED means the it data is encoded
incorrectly. I suspect you are using local encryption."* Verified — it's real:

- The test resolved the claimant AES via `resolveAesKey('PRIVATE_AES_KEY_CLAIM_TESTNET', …)`,
  but the repo-root `.env` pins the key as **`CLAIM_AES_KEY`**. The pin was silently
  ignored in every failing run and the key was re-recovered each time via
  `coti-ethers generateOrRecoverAes()`.
- That recovery **returns a key that does not match the account's real network AES
  key** (checked directly against the `CLAIM_AES_KEY` pin for
  `0xAb81c57C…`; COTI confirms there is no key rotation / regeneration). Where the
  recovery goes wrong is still open — the fork's `recoverUserKey` (XOR of two
  RSA-decrypted shares) looks standard and its onboard contract
  `0x536A67f0…5095` has code on testnet — but the outcome is that **all prior claim
  ITs were encrypted under a wrong key**. The UI flow obtains its key through the
  same recovery, so its attempts were equally affected.
- Fixed in the test: `claimantAesKey = resolveAesKey('CLAIM_AES_KEY', …)` — always
  pin `CLAIM_AES_KEY`; do not trust recovery.

### Candidate cause 2: tx-context signature binding

The employee's verify IT (`buildVerifyIt` in `src/lib/buildPayrollIt.ts`) is signed by
the **employee** over the digest
`(signer=employee, contract=inbox, selector=batchProcessRequests, ctHigh, ctLow)`.
But COTI's gcEVM binds an input ciphertext to the **actual transaction context**: the
account that sent the COTI tx plus the validating contract and selector (the official
`coti-contracts` test suite confirms wrong-signer / wrong-contract ITs fail
validation). On COTI the claim message is executed inside a tx sent by the **miner**,
so the node reconstructs the digest with the miner's address; the employee's signature
can never match it, and the MPC precompile reverts. No signing scheme available to the
employee can fix this — they never send the COTI tx.

**Control case proving the IT format is fine:** `registerLeaf` ITs are built with the
same SDK helper and validate on live COTI — because there the employer **sends the
COTI tx themself**, so signer == tx sender. (Note: the employer's key comes from the
`PRIVATE_AES_KEY_TESTNET` pin, not the broken recovery, so this control does not
separate cause 1 from cause 2 — both differ between registerLeaf and the claim leg.)

### Which cause? Discriminating rerun

The IT's ECDSA signature is produced with the wallet **private key** over
`(signer, contract, selector, ctHigh, ctLow)` — the AES key only affects the
ciphertext bytes. So rerunning the claim test with the IT encrypted under the correct
pinned `CLAIM_AES_KEY` separates the hypotheses cleanly:

| Rerun outcome | Conclusion |
|---------------|------------|
| Claim completes (`hasClaimed` flips) | Cause 1 was the root cause: `validateCiphertext` rejects wrong-key ciphertexts. Cause 2 is wrong — miner-relayed user ITs work; retract the iter09 architecture claim (keep the inbox-hardening + sim-fidelity companion fixes). |
| Still `ENCODE_FAILED` on the inbox | Encryption exonerated: cause 2 (tx-context binding) stands, iter09 proceeds. |

Rerun log:

1. **Full-suite rerun (2026-07-19 19:44): inconclusive** — hit vitest's 900 s test
   timeout before the claim leg ran (funder COTI onboarding + portal mint settle +
   credit round-trip consumed the budget; no `submitPayload`/`claim` tx was sent).
   Not wasted: it staged a fresh campaign end-to-end on live — **runId 5**, facade
   `0xaec2D504f7554344c5175689fDfF294998a1b9bB`, leaf 0 registered, pool credited
   100 pMTT, facade topped up with AVAX — and its three fund messages (nonces
   `0x9d`–`0x9f`: portal mint, pToken transfer, `creditPool`) all delivered on the
   COTI inbox **with no error recorded**, reconfirming plain-arg messages pass.
2. **Claim-only rerun against runId 5: blocked twice by unrelated Fuji-side issues**
   (both documented because they will bite again):
   - **Exact hang:** `PayrollClaimStore.submitPayload(...)`, called through viem's
     `walletClient.writeContract(...)`, hung indefinitely and never broadcast — even
     though `simulateContract` for the byte-identical call returned in under a
     second. Root cause not isolated further (suspect one of the sequential RPC
     calls `writeContract` makes internally — nonce/fee-per-gas/chain-id lookups —
     stalling against the public Fuji RPC), but reliably bypassed by decomposing
     into `account.signTransaction(...)` + `eth_sendRawTransaction` directly. The
     subsequent `PayrollCampaignFacade.claim(...)` call was sent the same
     (pre-decomposed) way, so it's untested whether `claim`'s `writeContract` path
     hangs too — treat both as suspect.
   - **Exact fail:** the decomposed `claim(...)` tx mined but **reverted** with
     custom error **`TargetFeeTooLow(7560199)`** from
     `InboxFeeManager.validateAndPrepareTwoWayFees` (selector `0xcf3cbb39`, decoded
     via `@coti-io/pod-sdk`'s ABI). Root cause, confirmed by reading the deployed
     constants directly (not oracle drift, as first guessed): the vault's
     `inboxFeeWei` (`1000968000000001`) / `payoutCallbackFeeWei`
     (`979128000000001`) split leaves only **2.18%** of the total for the remote
     (COTI-side) leg — `21840000000000` wei. `InboxFeeManager` converts that
     leftover to gas units as `remoteGasWei / tx.gasprice`, so the budget is
     **inversely proportional to the claim tx's own gas price**: historical
     successful claims happened to mine at **2 wei** effective (Fuji's live
     `eth_gasPrice` genuinely floats near zero), which inflates
     `21840000000000 / 2 ≈ 1.09×10¹³` gas units — comfortably over the
     `remoteMinFeeConfig.constantFee` floor of `12,000,000`. At a normal 2 gwei the
     same wei budget divides down to ~10,920 gas units, far under the floor.
     **Ops rule: never bump gas price on txs that pay this inbox a fixed fee — the
     fix is a correctly-split fee constant, not a low gas price.**
   - **Fixed same day:** recomputed the split with `@coti-io/pod-sdk`'s
     `PodContract.estimateFee` (wrapping the inbox's own
     `calculateTwoWayFeeRequiredInLocalToken` view function) at 50 gwei headroom,
     then called `PayrollVault.setInboxFees(totalFeeWei, callbackFeeWei_)` as owner
     (`PRIVATE_KEY3` — verified as `vault.owner()`) — tx
     `0xcf19bc53defe628e7c1020f6dc17a17fc7e73fd27f14f1131946b2ebef74e10e`, block
     `57122783`. New split: `totalFeeWei=8783650000000000`,
     `callbackFeeWei=7917000000000000`, remote leg now `866650000000000` wei
     (~9.9% of total) — headroom good up to roughly 50 gwei tx.gasprice instead of
     needing ~0 gwei.

     **Superseded by the 2026-07-20 redeploy** — `setInboxFees`/`inboxFeeWei`/
     `payoutCallbackFeeWei` no longer exist on the contract at all (this fix, along
     with the bug it patched, is entirely moot on the new addresses). The redeploy
     replaced the whole baked-fee model with a live `PayrollVault.estimateFee()`; see
     [fundCampaign.md](./fundCampaign.md#fees--no-stored-constants) for the current
     mechanism.
3. **Final discriminating claim (correct `CLAIM_AES_KEY`, minimal gas price):
   wallet-signed IT still failed.** The Fuji claim mined successfully
   (vault `PayoutRequested`, requestId
   `0x000000000000a86900000000006c11a0…0a0`), the message was delivered on COTI as
   nonce `0xa0`, and the inbox recorded **`errorCode 2 (ENCODE_FAILED)` with the
   identical `0xfe709212…` payload** — the same deterministic `validateCiphertext`
   revert as all eight wrong-key attempts. No `PayoutVerified`, `isSpent(5,0)` false,
   `hasClaimed(0)` false. Encrypting under the correct network AES key changed
   nothing: **cause 1 (wrong key) is exonerated as the blocker**; the wallet-signed
   IT construction itself is rejected regardless of key correctness — pointing at
   *how* the IT is signed, not just *who* submits the relaying tx.
4. **Swap to PoD-encryption-service-signed IT (2026-07-20): FIXED.** Same
   contracts, same calldata shape — only `buildVerifyIt`'s IT construction changed
   (see next section). A fresh live claim (runId `6`, index `0`) completed:
   `isSpent(6, 0) == true` on `PrivatePayrollCoti`, confirmed directly on-chain.
   **The tx-context/miner-relay hypothesis was too broad — it wasn't that no
   miner-relayed IT can validate, it's that *wallet-signed* ones can't. Service-signed
   ones do. iter09's contract redesign is not needed.**

### How IT data types are actually encrypted — and a cheaper fix than iter09? [FIX APPLIED]

`@coti-io/pod-sdk` (already a transitive dependency here via `@coti-io/coti-wallet-plugin`,
installed at `node_modules/@coti-io/pod-sdk`) reveals there are **two distinct ways** to
produce an `itUint256`, and the codebase currently uses only one of them:

1. **Local / wallet-signed (what `buildVerifyIt` in `src/lib/buildPayrollIt.ts` does):**
   encrypt the plaintext client-side with the user's AES key
   (`encryptUint256`/`buildItUint256WithSigner` from `@coti-io/coti-sdk-typescript`),
   then sign the digest `(signer, contract, selector, ctHigh, ctLow)` with the
   **user's own wallet key**. This is exactly the "local encryption" the COTI-team
   feedback flagged as suspect.
2. **PoD-encryption-service-signed (`CotiPodCrypto.encrypt` in `@coti-io/pod-sdk`):**
   POST `{value, dataType, contractAddress, functionSelector, userAddress}` to the
   PoD encryption service (`https://fullnode.testnet.coti.io/pod-encryption` on
   testnet) and use the ciphertext/signature it returns. Per the SDK's own doc
   comment on `ItVerificationOptions.verifyItSignature`: *"Does not apply to
   ciphertext returned by the HTTP encryption service — **those signatures use the
   service key**"* — i.e. path 2 is signed by a COTI-operated service key, not by
   the end user's wallet at all.

This reframes cause 1 vs cause 2: it isn't only that a miner-relayed tx can't match a
digest reconstructed from the miner's address — it's that **path 1 was quite possibly
never the right encryption path for anything that crosses the inbox**. `registerLeaf`
works with path 1 because the signer submits that COTI tx themself (a genuinely local,
same-chain call — `ackPoolCredit` was the same kind of call before the 2026-07-20
redeploy removed it entirely in favor of a public-amount `requestCreditPool`);
`verifyAndCredit`'s IT is executed inside a **miner-relayed** `batchProcessRequests`
call, which is structurally the same situation the PoD encryption service exists to
handle.

**Confirmed live (2026-07-20):** `buildVerifyIt` now calls
`CotiPodCrypto.encrypt(amount.toString(), "testnet", DataType.itUint256, { contractAddress: cotiTestnetContracts.inbox.address, functionSelector: BATCH_PROCESS_SELECTOR, userAddress: employeeAddress })`
instead of `buildItUint256WithSigner` — `verifyAndCredit`'s existing `gtUint256`
signature is unchanged, no contract redeploy required for this fix. `@coti-io/pod-sdk`
was added as a direct dependency (`ui/package.json`); `aesKey`/`signMessageAsync`
dropped from `buildVerifyIt`'s params since the service handles both. A fresh live
claim completed on the first attempt: `isSpent(runId=6, index=0) == true`. **iter09's
contract redesign is retracted as unnecessary** — kept below only as a record of the
alternative that was being considered before this fix landed.

### Why simCOTI passes and the fund path works

- **simCOTI:** `SimExtendedOperations.ValidateCiphertext` uses its own digest format,
  **recovers whichever signer** produced the signature, and decrypts with that
  signer's registered key — it never checks the tx sender. A miner-relayed employee IT
  therefore validates in sim. The sim is unfaithful to the real gcEVM on exactly this
  rule.
- **Fund path:** `requestCreditPool` → `creditPool(runId, uint256)` carries only plain
  `UINT256` args, which `MpcAbiCodec._normalizeArg` passes through untouched. No user
  IT ever crosses the inbox anywhere else in the system — the claim path is the only
  flow that ships one, and it fails 8-for-8.

### Not these (ruled out)

| Suspect | Why ruled out |
|---------|----------------|
| UI / test never submitting claim | Fuji receipt has 3 logs: Inbox + `PayoutRequested` + `ClaimInstant` |
| Facade out of AVAX for inbox fee | Balance after claim still ~0.049 AVAX; fee ~0.001 |
| Campaign not funded / no COTI pool | COTI `PoolCredited(runId=3)` landed; Fuji `poolCreditedTotal` matches |
| Run / leaf missing on COTI | `runs(3).exists == true`, leaf for index 0 registered, `isSpent(3,0) == false` |
| Soft reject inside `verifyAndCredit` (`_reject` → `inbox.raise`) | `verifyAndCredit` is never invoked — encode fails first |
| Total PoD inbox outage | Same inbox **does** complete `creditPool` two-way round-trips; delivery nonce advances past the stuck claims |
| Extreme callback lag | Failure is recorded on COTI within seconds of delivery, deterministically |

### What the contracts do

```mermaid
sequenceDiagram
  participant Emp as Employee Fuji
  participant Facade as PayrollCampaignFacade
  participant Vault as PayrollVault
  participant Inbox as Inbox
  participant COTI as PrivatePayrollCoti

  Emp->>Facade: claim (after submitPayload)
  Facade->>Vault: requestPayout(verifyIt, proofHandle)
  Vault->>Inbox: MessageSent verifyAndCredit
  Note over Vault: payoutRequestStatus = Pending
  Inbox-->>Inbox: miner tx batchProcessRequests<br/>reEncodeWithGt: validateCiphertext(employee IT)
  alt encode ok (never happens live for user ITs)
    Inbox-->>COTI: execute verifyAndCredit(gt claimed, proof)
    COTI-->>Inbox: respond / raise → Fuji callback
  else validateCiphertext reverts (actual live behavior)
    Note over Inbox: errors[requestId] = ENCODE_FAILED (local only)<br/>no respond, no raise
    Note over Vault: stays Pending forever
  end
```

---

## Proposed solution (iter09): submit the claim amount directly on COTI

> **Precondition met (2026-07-19):** the discriminating rerun confirmed
> [cause 2](#candidate-cause-2-tx-context-signature-binding) — a claim IT encrypted
> under the correct network AES key still fails inbox validation identically. This
> redesign is required.

**Principle:** never ship a user-bound IT through the inbox. ITs validate on live COTI
only when the signer sends the COTI tx themself (`registerLeaf` proves this binding
works), and plain `uint256`/`address`/`bytes` args cross the inbox fine (`creditPool`
proves that). So: move the employee's amount attestation to a **direct COTI tx**, and
strip the inbox leg down to **plain args only**.

The employee already has a COTI presence — the claim flow already performs a COTI
AccountOnboard tx to recover their AES key — so adding one more direct COTI tx fits
the existing UX. New cost: the claimant needs a little native COTI for gas.

### New flow

```mermaid
sequenceDiagram
  participant Emp as Employee Fuji
  participant Facade as PayrollCampaignFacade
  participant Vault as PayrollVault
  participant Inbox as Inbox
  participant COTI as PrivatePayrollCoti

  Note over Emp,COTI: once per account: COTI AccountOnboard (already in flow, recovers AES key)
  Emp->>COTI: submitClaimAmount(runId, index, itAmount) direct COTI tx
  Note over COTI: validateCiphertext passes: signer == tx sender<br/>stores offBoard(gtAmount) as submittedCt
  Emp->>Facade: claim(index, recipient, proof)
  Facade->>Vault: requestPayout(proofHandle)
  Vault->>Inbox: MessageSent verifyAndCredit(runId, claimant, proofHandle) plain args only
  Note over Vault: payoutRequestStatus = Pending
  Inbox-->>COTI: miner delivers, codec passes plain args untouched
  alt submittedCt present and eq(submitted, registered)
    COTI-->>Inbox: respond(runId, index, claimant)
    Inbox-->>Vault: onPayoutAuthorized → payoutTo + markClaimed
  else missing submittedCt (code 7) or mismatch (code 6)
    COTI-->>Inbox: raise(runId, index, code)
    Inbox-->>Vault: onPayoutRejected → PayoutFailed
  end
```

### COTI contract changes (`PrivatePayrollCoti`)

```solidity
mapping(uint256 => mapping(uint256 => ctUint256)) private _submittedAmountCt;

event ClaimAmountSubmitted(uint256 indexed runId, uint256 indexed index, address claimant);

/// Employee attests their claimed amount in their own COTI tx — the same
/// (sender, contract, selector) IT binding registerLeaf already proves live.
function submitClaimAmount(uint256 runId, uint256 index, itUint256 calldata itAmount) external {
    require(runs[runId].exists, "PrivatePayrollCoti: unknown run");
    require(!_spent[runId][index], "PrivatePayrollCoti: spent");
    // employee-only: stops third parties overwriting the ct to grief the eq-check
    require(_registeredEmployee[runId][index] == msg.sender, "PrivatePayrollCoti: not employee");
    _submittedAmountCt[runId][index] = MpcCore.offBoard(MpcCore.validateCiphertext(itAmount));
    emit ClaimAmountSubmitted(runId, index, msg.sender);
}

/// Inbox-delivered leg: gtUint256 claimed param REMOVED — plain args only.
function verifyAndCredit(uint256 runId, address claimant, bytes calldata proofHandle)
    external onlyInbox
{
    // ...existing checks unchanged (reject codes 1–5)...
    ctUint256 memory submittedCt = _submittedAmountCt[runId][index];
    if (_isEmpty(submittedCt)) { _reject(runId, index, 7); return; } // 7 = claim not pre-submitted
    gtUint256 claimed = MpcCore.onBoard(submittedCt);
    gtUint256 registered = MpcCore.onBoard(registeredCt);
    if (!MpcCore.decrypt(MpcCore.eq(claimed, registered))) { _reject(runId, index, 6); return; }
    _spent[runId][index] = true;
    delete _submittedAmountCt[runId][index];
    inbox.respond(abi.encode(runId, index, claimant));
    emit PayoutVerified(runId, index, claimant);
}
```

The proof-of-knowledge property is preserved: payout still requires someone who knows
the private amount *and* controls the employee address to encrypt it under their AES
key. A missing pre-submission now surfaces as a clean `PayoutFailed` (code 7) on Fuji
instead of an eternally stuck Pending.

### Fuji contract changes (vault / facade / claim store)

- `PayrollVault.requestPayout`: build the wire message with **3 plain args** —
  `MpcAbiCodec.create(verifyAndCredit.selector, 3).addArgument(runId)
  .addArgument(recipient).addArgument(proofHandle)`. No `itUint256` argument, no
  `IT_UINT256` datatype anywhere in the message.
- `PodClaimStore.submitPayload`: the verify-IT parameter goes away. Since the facade's
  `claim(index, recipient, …, proof)` already receives the merkle proof, the vault can
  `abi.encode(proof, index)` itself — the claim-store hop can likely be dropped from
  the claim path entirely (keep the contract for other uses if any).
- Facade `claim`: drop the now-unused claim IT parameter if iter08 no longer consumes
  it on Fuji (iter08 already removed local MpcCore usage). Note: iter08 sources are
  not in this repo — the thin-facade branch that produced
  `production-payroll-avalancheFuji.json` is where these edits land.

### UI / test changes

| Surface | Change |
|---------|--------|
| `src/lib/buildPayrollIt.ts` | Replace `buildVerifyIt` (inbox/batchProcessRequests binding — proven dead) with `buildSubmitClaimIt` bound to `(privatePayrollCoti, submitClaimAmount selector)`; drop `BATCH_PROCESS_SELECTOR` bindings for claim-side ITs |
| `src/hooks/useClaimFlow.ts` | New step between AES-key recovery and the Fuji claim: switch wallet to COTI, send `submitClaimAmount(runId, index, it)`, wait for receipt (reuse the fee-bump/drop-retry logic from `tests/testnet/helpers.ts` `writeCotiContract`) |
| `src/components/claim/MyClaims.tsx` | Surface the new step + map reject code 7 to "submit your claim amount on COTI first" |
| `tests/testnet/helpers.ts` `claimOnChain` | Order: COTI `submitClaimAmount` → Fuji `claim` → wait for callback; assert `completed === true` |
| New negative test | Fuji `claim` **without** pre-submission → expect `PayoutFailed` with code 7 (proves the failure mode is now loud, not stuck) |

### Companion fixes (separate repos, not blockers for iter09)

1. **Inbox:** `raise` back to the source chain on encode failure so vaults get
   `PayoutFailed` instead of hanging Pending; today code-2 errors silently strand
   requests and `retryFailedRequest` refuses them.
2. **Sim fidelity:** make `SimExtendedOperations.ValidateCiphertext` enforce the
   tx-sender binding so this class of failure reproduces in simCOTI instead of
   passing.

### Rollout

1. Implement + deploy iter09 contracts (COTI `PrivatePayrollCoti`, Fuji vault/facade
   wire change); refresh `ui/src/config/contracts.ts` + ABIs.
2. Land the UI/test changes above; run `createCampaign` / `fundCampaign` /
   `claimCampaign` testnet suites — claim should complete end-to-end for the first
   time on live.
3. The 8 stuck requests on runs 2/3 are unrecoverable (`retryFailedRequest` excludes
   code 2, and a retry would fail identically) — abandon them with the old testnet
   deploy.

### Fallback alternative (if the COTI tx per claim is unacceptable)

Drop the encrypted eq-check entirely: the merkle leaf already binds
`(index, claimant, amountCommitment)`, so `verifyAndCredit` could verify the proof
and respond without any amount comparison. Simpler (no extra employee tx, no COTI gas
for claimants), but weakens the design: possession of the claim-package JSON alone
would authorize the payout — the proof-of-knowledge of the private amount disappears.
Prefer the primary design unless claimant COTI gas proves to be a real onboarding
blocker.

### Open items

- The 32-byte encode-error payload `0xfe709212…` could be confirmed against gcEVM
  executor logs by the COTI team, but is not needed for the diagnosis or the fix.
- Decide whether `submitClaimAmount` should be resubmittable before `_spent` (current
  sketch: yes, last write wins — harmless since only the employee can write).

---

## What is *not* wrong in the UI/test

- iter08 shapes: `submitPayload` without payout IT; public `payoutTo(uint256)` after callback.
- Merkle package rebuilt from the create-time tree (same commitments registered on COTI).
- Amount = registered plaintext (`100` pMTT in the test).
- Preflights: not expired, not claimed, facade funded with AVAX.

**What WAS wrong in the test:** the claimant AES key. Recovery via
`generateOrRecoverAes()` returns a non-network key (cause 1 above), and the
`CLAIM_AES_KEY` pin was ignored due to an env-var name mismatch — fixed; the test now
reads `CLAIM_AES_KEY`.

---

## Env / how to reproduce

```bash
# repo-root .env
PRIVATE_KEY3=…
PRIVATE_AES_KEY_TESTNET=…
CLAIM_ADDRESS=0xAb81c57CCc578a5636BFF47B896BEC6Af1c30012
CLAIM_PK=…
CLAIM_AES_KEY=…   # the claimant's REAL network AES key — required; AES recovery via
                  # this repo's coti-ethers returns a wrong key (see cause 1)
# optional:
# PRIVATE_AES_KEY_FUNDER_V4_TESTNET=…
```

```bash
cd ui
npm run test:testnet -- tests/testnet/claimCampaign.test.ts
```

Expect: create/fund green, then assertion failure on `result.completed` after 300s with
requestId still Pending. To confirm the root cause independently, read
`errors(requestId)` on the COTI inbox — it returns `(requestId, 2, 0xfe709212…)`.

Do **not** re-claim the same index while status is Pending — each attempt spawns
another permanently stuck request (8 so far on this deploy).

---

## Code entrypoints

| Surface | Path |
|---------|------|
| UI | `src/hooks/useClaimFlow.ts`, `src/components/claim/MyClaims.tsx` |
| Test | `tests/testnet/claimCampaign.test.ts` |
| Helpers | `tests/testnet/helpers.ts` (`claimOnChain`, `fundCampaignOnChain`) |
| IT builders | `src/lib/buildPayrollIt.ts` (`buildVerifyIt` — the IT that fails inbox validation) |
| Inbox encode/error path | `pod-dapp-ports/…/contracts/InboxMiner.sol` (`_executeIncomingRequest`), `InboxBase.sol` (`_safeEncodeMethodCall`, `_recordEncodeError`), `mpccodec/MpcAbiCodec.sol` (`IT_UINT256` branch) |
| Sim divergence | `sim-coti-node/contracts/SimExtendedOperations.sol` (`ValidateCiphertext`) |
