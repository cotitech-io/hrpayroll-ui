# Create campaign flow

**Status: working** on Avalanche Fuji + COTI testnet (addresses: iter08 redeploy
2026-07-20; reference facade runId `1`:
`0x401b9514a3CCA82c790d7F360F28C1B33F04227D`).

COTI mempool can drop `registerRun` / `registerLeaf` txs; the test helper retries with fee
bumps. The UI hook does not yet auto-retry — a dropped COTI tx leaves an **orphan facade**
on Fuji (factory succeeded, COTI roster incomplete).

---

## Sequence (happy path)

```mermaid
sequenceDiagram
  autonumber
  actor Emp as Employer wallet
  participant Fuji as Avalanche Fuji
  participant Fac as PayrollCampaignFactory
  participant Facade as Campaign facade
  participant COTI as PrivatePayrollCoti

  Note over Emp: Must be PrivatePayrollCoti.owner

  Emp->>Emp: Build merkle tree (AES-encrypted amounts)
  Emp->>Fac: createCampaign(admin, root, pToken, …)
  Fac->>Facade: deploy + wire vault run
  Fac-->>Emp: CampaignCreated(facade, runId)
  Note right of Fac: OK — Fuji factory path

  Emp->>COTI: registerRun(runId, root)
  Note right of COTI: FLAKY — retry + fee bump in tests
  loop each leaf
    Emp->>Emp: buildRegisterLeafIt (AES + sign)
    Emp->>COTI: registerLeaf(runId, index, recipient, commitment, itAmount)
    Note right of COTI: FLAKY — gas 5M + retries in tests
  end

  loop each leaf
    Emp->>Facade: registerLeaf(index, recipient, commitment)
    Note right of Facade: OK — public commitments only
  end

  Emp->>Emp: saveCampaign(localStorage claim packages)
  Note over Emp: OK — claim packages include facadeAddress
```

---

## Step status board

```mermaid
flowchart TD
  A[1. Check COTI owner] -->|OK| B[2. Build merkle tree]
  B -->|OK| C[3. Fuji factory createCampaign]
  C -->|OK| D[4. Switch to COTI]
  D -->|OK| E[5. registerRun]
  E -->|FLAKY mempool| F[6. registerLeaf × N on COTI]
  F -->|FLAKY mempool| G[7. Switch to Fuji]
  G -->|OK| H[8. registerLeaf × N on facade]
  H -->|OK| I[9. Persist claim packages]

  style E fill:#fff3cd,stroke:#856404
  style F fill:#fff3cd,stroke:#856404
  style A fill:#d4edda,stroke:#155724
  style B fill:#d4edda,stroke:#155724
  style C fill:#d4edda,stroke:#155724
  style D fill:#d4edda,stroke:#155724
  style G fill:#d4edda,stroke:#155724
  style H fill:#d4edda,stroke:#155724
  style I fill:#d4edda,stroke:#155724
```

| Step | Where | Status | Notes |
|------|--------|--------|-------|
| Owner gate | COTI `owner()` | OK | Prevents orphan facades when wallet ≠ COTI owner |
| Merkle tree | local | OK | `buildPayrollMerkleTree` |
| `createCampaign` | Fuji factory | OK | Emits `CampaignCreated` |
| `registerRun` | COTI | FLAKY | Test helper `writeCotiContract` retries |
| `registerLeaf` (IT) | COTI | FLAKY | Needs `COTI_REGISTER_LEAF_GAS` + retries |
| `registerLeaf` | Fuji facade | OK | Public amount commitments |
| Local save | browser / test | OK | Packages now require `facadeAddress` |

---

## Failure modes we have seen

```mermaid
flowchart LR
  F[Fuji createCampaign OK] --> O{COTI registerRun}
  O -->|success| L[registerLeaf…]
  O -->|mempool drop / nonce| X[Orphan facade]
  X --> M[Facade exists on Fuji / runId not on COTI]

  style X fill:#f8d7da,stroke:#721c24
  style M fill:#f8d7da,stroke:#721c24
  style F fill:#d4edda,stroke:#155724
  style L fill:#d4edda,stroke:#155724
```

| Failure | Symptom | Recovery |
|---------|---------|----------|
| COTI tx dropped | Fuji facade + runId exist; COTI has no run | Create a new campaign (orphan is abandoned). Tests retry automatically. |
| Wrong COTI owner | Hook / test throws before factory | Use wallet that owns `PrivatePayrollCoti` |
| Wallet chain drift | Mid-flow “wrong network” | UI re-asserts chain before each write |

---

## Contracts / config

| Piece | Address / source |
|-------|------------------|
| Factory (Fuji) | `0x17cad9fce18ef750e8626c2d1ee9be97f3d375e5` |
| PrivatePayrollCoti | `0xeddbb52a6b92db6ba088c39a96dd0b1a76082ecb` |
| Reference facade (runId 1) | `src/config/contracts.ts` |

Addresses current as of the 2026-07-20 redeploy
(`deployments/production-payroll-avalancheFuji.json`); always prefer
`src/config/contracts.ts` over this table if they ever drift.

---

## How to verify

```bash
cd ui
npm run test:testnet -- tests/testnet/createCampaign.test.ts
```

Expect: factory create → COTI registerRun/leaves → facade leaves → local packages saved.
