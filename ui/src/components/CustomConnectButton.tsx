import { ConnectButton } from '@rainbow-me/rainbowkit'
import { usePMttBalance } from '../hooks/usePMttBalance'

// Custom-rendered in place of the default <ConnectButton /> so the pMTT balance can sit
// inside the same pill as the native AVAX balance, rather than as a separate element next to
// it — RainbowKit's own account button has no slot for injecting extra content.
export function CustomConnectButton() {
  const { balance, isFetching, error, refresh, isUnlocked } = usePMttBalance()

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openConnectModal, mounted }) => {
        const ready = mounted
        const connected = ready && !!account && !!chain

        if (!connected) {
          return (
            <button type="button" onClick={openConnectModal} aria-hidden={!ready}>
              Connect Wallet
            </button>
          )
        }

        return (
          <div
            className="bg-card border border-border rounded-lg"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.75rem' }}
          >
            {isUnlocked && (
              // Two separate real buttons, not one nested inside the other — a <button>
              // cannot validly contain another interactive element, which made the refresh
              // icon's clicks behave unreliably when it was nested inside the account button.
              <>
                <span
                  title={error ?? 'pMTT balance'}
                  style={{ fontSize: '0.9rem', opacity: isFetching ? 0.5 : 0.85, color: error ? 'crimson' : undefined }}
                >
                  pMTT {error ? 'error' : (balance ?? '—')}
                </span>
                <button
                  type="button"
                  aria-label="Refresh pMTT balance"
                  title="Refresh pMTT balance"
                  onClick={refresh}
                  disabled={isFetching}
                  style={{ cursor: isFetching ? 'default' : 'pointer', lineHeight: 1 }}
                >
                  ↻
                </button>
                <span style={{ opacity: 0.6 }}>|</span>
              </>
            )}
            <button type="button" onClick={openAccountModal} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.9rem' }}>{account.displayBalance}</span>
              <span style={{ fontSize: '0.9rem' }}>{account.displayName}</span>
            </button>
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
