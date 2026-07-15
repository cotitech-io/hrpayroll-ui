import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureCotiPlugin } from '@coti-io/coti-wallet-plugin'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'
import App from './App.tsx'
import { AVAX_CHAIN_ID } from './config/contracts'

// Must run before any plugin hooks render. walletConnectProjectId is required for the
// WalletConnect connector to work — set VITE_WALLETCONNECT_PROJECT_ID in .env.local
// (get one at https://cloud.reown.com). Injected wallets (MetaMask, etc.) still work without it.
//
// defaultNetworkId: the plugin's own default enforcement target is COTI testnet
// (its Privacy Portal bridge use case). Our facade/vault writes happen on Avalanche
// Fuji, so NetworkGuard needs to be told that explicitly or it'll block the UI
// expecting the wrong chain.
configureCotiPlugin({
  walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  debug: import.meta.env.DEV,
  defaultNetworkId: String(AVAX_CHAIN_ID),
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
