export const PodClaimStoreAbi = [
  {
    inputs: [
      {
        internalType: 'address',
        name: 'facade',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'index',
        type: 'uint256',
      },
      {
        internalType: 'address',
        name: 'claimant',
        type: 'address',
      },
    ],
    name: 'consumePayload',
    outputs: [
      {
        components: [
          {
            components: [
              {
                internalType: 'ctUint128',
                name: 'ciphertextHigh',
                type: 'uint256',
              },
              {
                internalType: 'ctUint128',
                name: 'ciphertextLow',
                type: 'uint256',
              },
            ],
            internalType: 'struct ctUint256',
            name: 'ciphertext',
            type: 'tuple',
          },
          {
            internalType: 'bytes',
            name: 'signature',
            type: 'bytes',
          },
        ],
        internalType: 'struct itUint256',
        name: 'itAmount',
        type: 'tuple',
      },
      {
        internalType: 'bytes',
        name: 'proofHandle',
        type: 'bytes',
      },
    ],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      {
        internalType: 'address',
        name: 'facade',
        type: 'address',
      },
      {
        internalType: 'uint256',
        name: 'index',
        type: 'uint256',
      },
      {
        components: [
          {
            components: [
              {
                internalType: 'ctUint128',
                name: 'ciphertextHigh',
                type: 'uint256',
              },
              {
                internalType: 'ctUint128',
                name: 'ciphertextLow',
                type: 'uint256',
              },
            ],
            internalType: 'struct ctUint256',
            name: 'ciphertext',
            type: 'tuple',
          },
          {
            internalType: 'bytes',
            name: 'signature',
            type: 'bytes',
          },
        ],
        internalType: 'struct itUint256',
        name: 'itAmount',
        type: 'tuple',
      },
      {
        internalType: 'bytes',
        name: 'proofHandle',
        type: 'bytes',
      },
    ],
    name: 'submitPayload',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
] as const
