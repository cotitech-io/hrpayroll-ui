import { useAccount, useReadContract } from 'wagmi'
import { cotiTestnetContracts, COTI_TESTNET_CHAIN_ID } from '../../config/contracts'

// Campaign creation on Fuji is permissionless via the factory, but registering the roster on
// COTI (registerRun/registerLeaf) is still onlyOwner on PrivatePayrollCoti — that owner is the
// effective gate now, not the vault owner.
export function CampaignOwnerCheck() {
  const { address } = useAccount()
  const { data: owner } = useReadContract({
    ...cotiTestnetContracts.privatePayrollCoti,
    functionName: 'owner',
    chainId: COTI_TESTNET_CHAIN_ID,
  })
  if (!owner || !address) return null
  if (owner.toLowerCase() === address.toLowerCase()) return null
  return (
    <p style={{ color: 'crimson' }}>
      Connected wallet is not the PrivatePayrollCoti owner ({owner}). Campaign creation will fail at the
      COTI roster-registration step until you connect that wallet.
    </p>
  )
}
