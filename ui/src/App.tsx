import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { WagmiRainbowKitProvider, PrivacyBridgeProvider, sepolia } from '@coti-io/coti-wallet-plugin'
import { Layout } from './components/Layout'
import { ActivityPage } from './pages/ActivityPage'
import { EmployeePage } from './pages/EmployeePage'
import { EmployerPage } from './pages/EmployerPage'

function App() {
  return (
    <WagmiRainbowKitProvider appName="COTI Payroll" initialChain={sepolia} useEip6963MetaMask>
      <PrivacyBridgeProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<ActivityPage />} />
              <Route path="/employee" element={<EmployeePage />} />
              <Route path="/employer" element={<EmployerPage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </PrivacyBridgeProvider>
    </WagmiRainbowKitProvider>
  )
}

export default App
