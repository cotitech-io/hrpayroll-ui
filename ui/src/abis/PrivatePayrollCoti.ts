export const PrivatePayrollCotiAbi = [
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "inbox_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "initialOwner",
        "type": "address"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "caller",
        "type": "address"
      }
    ],
    "name": "OnlyInbox",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "owner",
        "type": "address"
      }
    ],
    "name": "OwnableInvalidOwner",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "account",
        "type": "address"
      }
    ],
    "name": "OwnableUnauthorizedAccount",
    "type": "error"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "runId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "employee",
        "type": "address"
      }
    ],
    "name": "LeafRegistered",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "previousOwner",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "OwnershipTransferred",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "runId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "claimant",
        "type": "address"
      }
    ],
    "name": "PayoutVerified",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "runId",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "eligibilityRoot",
        "type": "bytes32"
      }
    ],
    "name": "RunRegistered",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "inbox",
    "outputs": [
      {
        "internalType": "contract IInbox",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "runId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "isSpent",
    "outputs": [
      {
        "internalType": "bool",
        "name": "",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [
      {
        "internalType": "address",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "runId",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "employee",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "amountCommitment",
        "type": "bytes32"
      },
      {
        "components": [
          {
            "components": [
              {
                "internalType": "ctUint128",
                "name": "ciphertextHigh",
                "type": "uint256"
              },
              {
                "internalType": "ctUint128",
                "name": "ciphertextLow",
                "type": "uint256"
              }
            ],
            "internalType": "struct ctUint256",
            "name": "ciphertext",
            "type": "tuple"
          },
          {
            "internalType": "bytes",
            "name": "signature",
            "type": "bytes"
          }
        ],
        "internalType": "struct itUint256",
        "name": "itAmount",
        "type": "tuple"
      }
    ],
    "name": "registerLeaf",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "runId",
        "type": "uint256"
      },
      {
        "internalType": "bytes32",
        "name": "eligibilityRoot",
        "type": "bytes32"
      }
    ],
    "name": "registerRun",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "renounceOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "runs",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "eligibilityRoot",
        "type": "bytes32"
      },
      {
        "internalType": "bool",
        "name": "exists",
        "type": "bool"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "newOwner",
        "type": "address"
      }
    ],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "runId",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "claimant",
        "type": "address"
      },
      {
        "internalType": "gtUint256",
        "name": "claimed",
        "type": "uint256"
      },
      {
        "internalType": "bytes",
        "name": "proofHandle",
        "type": "bytes"
      }
    ],
    "name": "verifyAndCredit",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const;
