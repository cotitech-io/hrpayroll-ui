// Read-only fee-estimation surface exposed by PoD inbox contracts (IInboxFeeManager).
// The same inbox address is deployed deterministically on both the client chain (Fuji)
// and COTI testnet — confirmed live: PayrollVault.inbox() on Fuji returns the identical
// address already used for cotiTestnetContracts.inbox.
export const InboxFeeManagerAbi = [
  {
    inputs: [
      { internalType: 'uint256', name: 'remoteMethodCallSize', type: 'uint256' },
      { internalType: 'uint256', name: 'callBackMethodCallSize', type: 'uint256' },
      { internalType: 'uint256', name: 'remoteMethodExecutionGas', type: 'uint256' },
      { internalType: 'uint256', name: 'callBackMethodExecutionGas', type: 'uint256' },
      { internalType: 'uint256', name: 'gasPrice', type: 'uint256' },
    ],
    name: 'calculateTwoWayFeeRequiredInLocalToken',
    outputs: [
      { internalType: 'uint256', name: 'targetFeeLocalWei', type: 'uint256' },
      { internalType: 'uint256', name: 'callerFeeLocalWei', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const
