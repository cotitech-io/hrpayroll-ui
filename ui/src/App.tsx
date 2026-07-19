import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { avalancheFuji } from 'viem/chains'
import { WagmiRainbowKitProvider, PrivacyBridgeProvider, NetworkGuard } from '@coti-io/coti-wallet-plugin'
import { ThemeProvider } from './providers/ThemeProvider'
import { Layout } from './components/Layout'
import { ActivityPage } from './pages/ActivityPage'
import { EmployeePage } from './pages/EmployeePage'
import { OrganizationPage } from './pages/OrganizationPage'

function App() {
  return (
    <ThemeProvider>
      {/* coti-wallet-plugin's own chain configs include Fuji (CHAIN_CONFIGS), but it
          doesn't export a top-level `avalancheFuji` Chain object like it does for
          `sepolia` — using viem's own definition for the initialChain prop instead. */}
      <WagmiRainbowKitProvider appName="PodPay" initialChain={avalancheFuji} useEip6963MetaMask>
        <PrivacyBridgeProvider>
          {/* Only blocks when a wallet is connected AND on the wrong chain — read-only
              browsing while disconnected (or before switching) is unaffected. */}
          <NetworkGuard>
            <BrowserRouter>
              <Layout>
                <Routes>
                  <Route path="/" element={<ActivityPage />} />
                  <Route path="/employee" element={<EmployeePage />} />
                  <Route path="/organization/*" element={<OrganizationPage />} />
                </Routes>
              </Layout>
            </BrowserRouter>
          </NetworkGuard>
        </PrivacyBridgeProvider>
      </WagmiRainbowKitProvider>
    </ThemeProvider>
  )
}

export default App
