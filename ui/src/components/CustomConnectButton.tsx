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
            <button
              type="button"
              onClick={openConnectModal}
              aria-hidden={!ready}
              className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-b from-violet-500 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 ring-1 ring-inset ring-white/15 transition-all hover:from-violet-400 hover:to-indigo-500 hover:shadow-violet-700/50"
            >
              Connect Wallet
              <span aria-hidden className="transition-transform group-hover:translate-x-0.5">→</span>
            </button>
          )
        }

        return (
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 shadow-sm">
            {isUnlocked && (
              <>
                <span
                  title={error ?? 'pMTT balance'}
                  className="text-xs text-slate-500"
                  style={{ opacity: isFetching ? 0.5 : 1, color: error ? 'crimson' : undefined }}
                >
                  pMTT {error ? 'error' : (balance ?? '—')}
                </span>
                <button
                  type="button"
                  aria-label="Refresh pMTT balance"
                  title="Refresh pMTT balance"
                  onClick={refresh}
                  disabled={isFetching}
                  className="text-slate-400 hover:text-slate-700 disabled:cursor-default"
                >
                  ↻
                </button>
                <span className="h-3 w-px bg-slate-200" />
              </>
            )}
            <button
              type="button"
              onClick={openAccountModal}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-800"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
              <span>{account.displayBalance}</span>
              <span className="text-slate-500">{account.displayName}</span>
            </button>
          </div>
        )
      }}
    </ConnectButton.Custom>
  )
}
