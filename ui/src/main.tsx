import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { configureCotiPlugin } from '@coti-io/coti-wallet-plugin'
import '@rainbow-me/rainbowkit/styles.css'
import './index.css'
import App from './App.tsx'

// Must run before any plugin hooks render. walletConnectProjectId is required for the
// WalletConnect connector to work — set VITE_WALLETCONNECT_PROJECT_ID in .env.local
// (get one at https://cloud.reown.com). Injected wallets (MetaMask, etc.) still work without it.
configureCotiPlugin({
  walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  debug: import.meta.env.DEV,
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
