# Payroll UI — live testnet flow status

Status as of **2026-07-19**, against Avalanche Fuji + COTI testnet after the
[pod-dapp-ports](https://github.com/coti-io/pod-dapp-ports) **iter08-thin-fuji-facade**
redeploy (`requestCreditPool` / no Fuji `MpcCore`).

| Flow | Doc | Verdict |
|------|-----|---------|
| Create campaign | [createCampaign.md](./createCampaign.md) | **Working** end-to-end (with COTI fee-bump retries in tests) |
| Fund campaign | [fundCampaign.md](./fundCampaign.md) | **Working** on live (2026-07-19 E2E) — public transfer → `requestCreditPool` → `PoolCredited` |
| Claim payroll | — | **UI wired for iter08** (`submitPayload` without payout IT → COTI verify → public `payoutTo`); live claim not yet retested here |

```mermaid
flowchart LR
  subgraph ok [Working / expected]
    C[Create campaign]
    S[Portal seed / mint]
    T[Public pToken transfer]
    R[requestCreditPool → COTI]
  end
  subgraph still [Still broken]
    IT[Encrypted IT pToken.transfer]
  end
  C --> S --> T --> R
  IT -.->|no callback in 300s retest| X[Sender pending stuck]
```

### Legend used in the flow docs

| Marker | Meaning |
|--------|---------|
| OK | Observed green on live Fuji + COTI testnet |
| FLAKY | Works most of the time; needs retries (mempool drops / fee bumps) |
| BROKEN | Consistently fails or leaves irreversible stuck state |
| N/A | Not part of that flow / removed by redesign |

### Code entrypoints

| Surface | Create | Fund |
|---------|--------|------|
| UI hook | `src/hooks/useCreateCampaign.ts` | `src/hooks/useFundCampaign.ts` |
| Testnet suite | `tests/testnet/createCampaign.test.ts` | `tests/testnet/fundCampaign.test.ts` |
| Shared helpers | `tests/testnet/helpers.ts` (`createCampaignOnChain`, COTI retries, settle wait) | same |
| Fees | — | `src/lib/podFees.ts` (`computePTokenTwoWayFees`) + facade `inboxFeeWei` |
| Addresses | `src/config/contracts.ts` | same |
