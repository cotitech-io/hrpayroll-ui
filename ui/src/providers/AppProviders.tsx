import { useEffect, useState, type ReactNode } from "react";
import { avalancheFuji } from "viem/chains";
import {
  WagmiRainbowKitProvider,
  PrivacyBridgeProvider,
  NetworkGuard,
  configureCotiPlugin,
} from "@coti-io/coti-wallet-plugin";
import "@rainbow-me/rainbowkit/styles.css";
import { ThemeProvider } from "./ThemeProvider";
import { AVAX_CHAIN_ID } from "@/config/contracts";

// Runs exactly once in the browser before any wallet-plugin hook mounts.
let cotiConfigured = false;
function ensureCotiConfigured() {
  if (cotiConfigured) return;
  cotiConfigured = true;
  // A WalletConnect project ID is required by the COTI wallet plugin even to
  // initialise. Injected wallets (MetaMask, etc.) still work without a real
  // one — but WalletConnect flows won't. Set VITE_WALLETCONNECT_PROJECT_ID in
  // your environment for full WalletConnect support (https://cloud.reown.com).
  const walletConnectProjectId =
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
    "00000000000000000000000000000000";
  configureCotiPlugin({
    walletConnectProjectId,
    debug: import.meta.env.DEV,
    defaultNetworkId: String(AVAX_CHAIN_ID),
  });
}

/**
 * Wraps the app with wagmi + RainbowKit + COTI wallet-plugin providers.
 * Intended to be rendered exclusively on the client (see `<ClientOnly>`
 * gating in `__root.tsx`) because the COTI wallet plugin and MetaMask
 * providers both touch browser globals at module scope.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ensureCotiConfigured();
    setReady(true);
  }, []);

  if (!ready) return null;

  const walletConnectProjectId =
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ||
    "00000000000000000000000000000000";

  return (
    <ThemeProvider>
      <WagmiRainbowKitProvider
        appName="PodPay"
        initialChain={avalancheFuji}
        useEip6963MetaMask
        walletConnectProjectId={walletConnectProjectId}
      >
        <PrivacyBridgeProvider>
          <NetworkGuard>{children}</NetworkGuard>
        </PrivacyBridgeProvider>
      </WagmiRainbowKitProvider>
    </ThemeProvider>
  );
}
