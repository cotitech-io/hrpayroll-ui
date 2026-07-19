# Claim campaign flow

**Status: broken on live** — Fuji-side claim submits and mines; COTI `verifyAndCredit`
callback never completes (`payoutRequestStatus` stays **Pending**).

Verified 2026-07-19 via `npm run test:testnet -- tests/testnet/claimCampaign.test.ts`
using `.env` `CLAIM_ADDRESS` / `CLAIM_PK`.

---

## What the test proved

| Step | Result |
|------|--------|
| Create campaign (factory + COTI register) | OK |
| Fund (portal mint → public transfer → `requestCreditPool`) | OK |
| Facade AVAX top-up | OK |
| `submitPayload(verifyIt, proof)` | OK |
| `claim(...)` on Fuji | OK — emits `PayoutRequested` |
| COTI verify + `onPayoutAuthorized` / `payoutTo` | **Stuck Pending** (≥300s) |
| `hasClaimed(index)` | stays `false` |

Latest failing run:

| Field | Value |
|-------|--------|
| runId | `3` |
| facade | `0x1035fc4856F6361f1433ab706f812886b9DbE747` |
| claimTx | `0x01bccba104034fb12fbf83eecdeff3a7b49ec95a858c6496f330f808ace30938` |
| requestId | `0x000000000000a86900000000006c11a000000000000000000000000000000098` |

Same pattern as the earlier manual UI claim on runId `2` (requestIds `…093` / `…094`).

Fund path for the same inbox **does** complete (`PoolCreditCompleted`). So this is specific
to the **claim / verifyAndCredit** cross-chain leg, not a total inbox outage.

---

## Env

```bash
# repo-root .env
PRIVATE_KEY3=…
PRIVATE_AES_KEY_TESTNET=…
CLAIM_ADDRESS=0xAb81c57CCc578a5636BFF47B896BEC6Af1c30012
CLAIM_PK=…
# optional pins after first onboard:
# PRIVATE_AES_KEY_CLAIM_TESTNET=…
# PRIVATE_AES_KEY_FUNDER_V4_TESTNET=…
```

```bash
cd ui
npm run test:testnet -- tests/testnet/claimCampaign.test.ts
```

---

## Code entrypoints

| Surface | Path |
|---------|------|
| UI | `src/hooks/useClaimFlow.ts`, `src/components/claim/MyClaims.tsx` |
| Test | `tests/testnet/claimCampaign.test.ts` |
| Helpers | `tests/testnet/helpers.ts` (`claimOnChain`, `fundCampaignOnChain`) |

---

## Next debug (contracts / inbox)

1. Why Fuji→COTI `verifyAndCredit` messages for payroll stay Pending while `creditPool` settles.
2. Whether MPC executor / inbox fee / IT validation drops the claim without `onPayoutRejected`.
3. Do not re-claim the same index while a request is Pending (duplicates stuck requests).
