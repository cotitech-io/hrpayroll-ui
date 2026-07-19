import { defineConfig } from 'vitest/config'

// Real-network integration tests (Avalanche Fuji + COTI testnet). Deliberately a separate
// config so no default `vitest` invocation ever picks these up: they submit funded
// transactions signed with keys from the repo-root .env (PRIVATE_KEY3). Run via
// `npm run test:testnet`. sim-coti is not an option here — @coti-io/coti-wallet-plugin's
// crypto stack (coti-sdk-typescript) only speaks the real COTI MPC network.
export default defineConfig({
  test: {
    include: ['tests/testnet/**/*.test.ts'],
    // A full create flow is ~6 sequential txs across two testnets, plus a possible
    // COTI onboarding tx; COTI blocks alone can take ~5-10s each.
    // Create + fund spans many Fuji/COTI txs; COTI writes may retry with fee bumps.
    testTimeout: 900_000,
    hookTimeout: 300_000,
    fileParallelism: false,
  },
})
