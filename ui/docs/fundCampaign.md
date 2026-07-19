# Fund campaign flow

**Status: partial** — tokens can reach the facade; the encrypted pool ledger cannot be
acked, so claims still fail with `InsufficientPoolBalance`.

Latest example (funded tokens, **unacked** pool): facade
`0x5016E770670F1EfD7608cf87D21F98470d8cee50` (runId `14`).

---

## Sequence (intended vs actual)

```mermaid
sequenceDiagram
  autonumber
  actor Emp as Employer or funder
  participant Portal as MTT Portal
  participant pToken as pToken PodERC20
  participant Facade as Campaign facade
  participant COTI as COTI inbox
  participant MPC as Fuji MPC

  Note over Emp,Portal: Test-only seed - not in UI hook
  Emp->>Portal: MTT to pMTT mint to funder
  Portal-->>pToken: mint settles via inbox
  Note right of Portal: OK - same settle path as public transfer

  Emp->>pToken: balanceOfWithStatus idle
  Note right of pToken: OK - blocks if TransferAlreadyPending

  Emp->>Emp: computePTokenTwoWayFees at 2x live gas
  Note right of Emp: OK - avoids CallbackFeeTooLow

  alt BROKEN path - encrypted IT transfer
    Emp->>pToken: transfer to itUint256 callbackFee
    pToken->>COTI: cross-chain request
    Note right of COTI: BROKEN - callback never lands, sender stuck pending forever
  else Working path - public amount transfer
    Emp->>pToken: transfer to amount callbackFee plus value
    pToken->>COTI: cross-chain request
    COTI-->>pToken: Transfer event settled
    Note right of pToken: OK - facade receives garbled balance
  end

  Emp->>Emp: buildAckPoolIt AES and sign as admin
  Emp->>Facade: ackPoolCredit ackIt
  Facade->>MPC: ValidateCiphertext
  Note right of MPC: BROKEN - reverts ~28k gas, coti-ethers onboard fails on Fuji
  Note over Facade: Tokens sit on facade but encrypted pool balance stays 0
```

---

## Step status board

```mermaid
flowchart TD
  A[0. Optional: portal mint pToken to funder] -->|OK test only| B[1. Sender balance idle]
  B -->|OK| C[2. computePTokenTwoWayFees]
  C -->|OK| D{3. Which transfer?}
  D -->|IT encrypted| E[transfer itUint256]
  D -->|public uint256| F[transfer amount + fee]
  E -->|BROKEN| Stuck[Sender TransferAlreadyPending forever]
  F -->|OK| G[4. Wait Transfer / TransferFailed]
  G -->|OK| H[5. ackPoolCredit on facade]
  H -->|BROKEN| I[ValidateCiphertext revert]
  I --> J[Facade has tokens / pool ledger empty]
  H -.->|if it worked| K[6. Optional AVAX top-up]
  K -->|OK| L[Claims can draw pool]

  style E fill:#f8d7da,stroke:#721c24
  style Stuck fill:#f8d7da,stroke:#721c24
  style H fill:#f8d7da,stroke:#721c24
  style I fill:#f8d7da,stroke:#721c24
  style J fill:#f8d7da,stroke:#721c24
  style A fill:#d4edda,stroke:#155724
  style B fill:#d4edda,stroke:#155724
  style C fill:#d4edda,stroke:#155724
  style F fill:#d4edda,stroke:#155724
  style G fill:#d4edda,stroke:#155724
  style K fill:#d4edda,stroke:#155724
  style L fill:#fff3cd,stroke:#856404
```

| Step | Where | Status | Notes |
|------|--------|--------|-------|
| Portal MTT→pMTT mint | Fuji portal | OK | Used by fund test to seed funder |
| Idle sender check | pToken `balanceOfWithStatus` | OK | Hard-fails if stuck pending |
| Fee quote | `podFees.ts` | OK | **2× live Fuji gas**; stale ~0.3 gwei caused `CallbackFeeTooLow` |
| IT `transfer(to, it, fee)` | pToken | **BROKEN** | Never settle; bricks sender |
| Public `transfer(to, amount, fee)` | pToken | OK | Settles; amount is public |
| Settle wait | `Transfer` / `TransferFailed` logs | OK | Do not use receiver pending flag |
| `ackPoolCredit` | Facade + Fuji MPC | **BROKEN** | `ValidateCiphertext` reverts; Fuji onboard: `unable to onboard user` |
| AVAX top-up | Facade native | OK | Only after successful ack in UI |
| Claims after fund | Facade / vault | Blocked | Needs ack; else `InsufficientPoolBalance` |

---

## What works vs what breaks (summary)

```mermaid
flowchart TB
  subgraph works [Working today]
    W1[Create campaign]
    W2[Portal mint to funder]
    W3[Public pToken to facade]
    W4[Fee quote at 2x gas]
  end

  subgraph breaks [Broken today]
    B1[Encrypted pToken.transfer IT]
    B2[ackPoolCredit / ValidateCiphertext]
    B3[Claim against unacked pool]
  end

  W1 --> W2 --> W3
  W3 --> B2
  B2 --> B3
  B1 -.->|do not use| Dead[Stuck pending]
```

### Root cause notes (current understanding)

1. **IT transfer stall** — Encrypted `transfer(to, itUint256, …)` requests leave the sender
   `pending` forever on Fuji↔COTI testnet. Public-amount overload uses the portal settle path
   and completes. UI + tests use the public path on purpose.

2. **`ackPoolCredit` MPC** — Building / submitting the IT for `ackPoolCredit` hits Fuji MPC
   validation (`ValidateCiphertext` ~28k gas revert). `coti-ethers` user onboard on Fuji also
   fails with `unable to onboard user`. Until MPC/onboard works for the employer AES key on
   Fuji, the encrypted pool ledger cannot be credited even though the facade holds pTokens.

3. **Who signs ack** — Admin/employer must call `ackPoolCredit` (not an ephemeral funder).
   Tests already use the employer wallet for this step; the failure is MPC validation, not
   access control.

---

## Code map

| Concern | File |
|---------|------|
| UI fund mutation | `src/hooks/useFundCampaign.ts` |
| Fee math (2× gas) | `src/lib/podFees.ts` |
| Test + portal seed + COTI retries | `tests/testnet/fundCampaign.test.ts`, `tests/testnet/helpers.ts` |
| Ack IT builder | `buildAckPoolIt` (shared with UI) |
| Fuji MPC gas override | `FUJI_MPC_IT_GAS` |

---

## How to verify

```bash
cd ui
npm run test:testnet -- tests/testnet/fundCampaign.test.ts
```

**Expected today**

- Portal mint: pass  
- Public transfer + settle: pass  
- `ackPoolCredit`: fail (`ValidateCiphertext` / onboard)  
- Claim path: blocked until ack works  

When ack is green, the same test should complete funding and leave a non-zero encrypted pool
balance readable via the facade’s pool views.
