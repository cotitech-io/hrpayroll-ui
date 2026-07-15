import { useAccount } from 'wagmi'
import { usePrivateUnlock } from '@coti-io/coti-wallet-plugin'
import { Button } from './ui/button'

// Triggers the plugin's onboarding/AES-key-unlock flow. The actual modal + wallet-sign
// prompt are rendered by PrivateUnlockProvider itself (mounted inside PrivacyBridgeProvider
// in App.tsx) — this button only needs to call unlock()/lock().
export function PrivateAccessButton() {
  const { isConnected } = useAccount()
  const { isUnlocked, isUnlocking, unlock, lock, statusMessage } = usePrivateUnlock()

  if (!isConnected) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <Button
        type="button"
        variant={isUnlocked ? 'secondary' : 'default'}
        size="sm"
        onClick={isUnlocked ? lock : unlock}
        disabled={isUnlocking}
      >
        {isUnlocking ? 'Unlocking…' : isUnlocked ? 'Private access unlocked' : 'Unlock private access'}
      </Button>
      {statusMessage && <span style={{ fontSize: '0.85rem', opacity: 0.7 }}>{statusMessage}</span>}
    </div>
  )
}
