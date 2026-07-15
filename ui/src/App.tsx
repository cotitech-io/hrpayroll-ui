import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WagmiRainbowKitProvider, PrivacyBridgeProvider, NetworkGuard, sepolia } from '@coti-io/coti-wallet-plugin'
import { Layout } from './components/Layout'
import { ActivityPage } from './pages/ActivityPage'
import { EmployeePage } from './pages/EmployeePage'
import { EmployerPage } from './pages/EmployerPage'

function App() {
  return (
    <WagmiRainbowKitProvider appName="COTI Payroll" initialChain={sepolia} useEip6963MetaMask>
      <PrivacyBridgeProvider>
        {/* Only blocks when a wallet is connected AND on the wrong chain — read-only
            browsing while disconnected (or before switching) is unaffected. */}
        <NetworkGuard>
          <BrowserRouter>
            <Layout>
              <Routes>
                <Route path="/" element={<ActivityPage />} />
                <Route path="/employee" element={<EmployeePage />} />
                <Route path="/employer" element={<EmployerPage />} />
              </Routes>
            </Layout>
          </BrowserRouter>
        </NetworkGuard>
      </PrivacyBridgeProvider>
    </WagmiRainbowKitProvider>
  )
}

export default App
