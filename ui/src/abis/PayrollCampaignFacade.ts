export const PayrollCampaignFacadeAbi = [
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "amountCommitment",
        "type": "bytes32"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bool",
        "name": "viaSig",
        "type": "bool"
      }
    ],
    "name": "ClaimInstant",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "admin",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "Clawback",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      },
      {
        "indexed": false,
        "internalType": "uint256",
        "name": "totalCredited",
        "type": "uint256"
      }
    ],
    "name": "PoolCredited",
    "type": "event"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "caller",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "admin",
        "type": "address"
      }
    ],
    "name": "CallerNotAdmin",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "blockTimestamp",
        "type": "uint256"
      },
      {
        "internalType": "uint40",
        "name": "expiration",
        "type": "uint40"
      }
    ],
    "name": "CampaignExpired",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "blockTimestamp",
        "type": "uint256"
      },
      {
        "internalType": "uint40",
        "name": "campaignStartTime",
        "type": "uint40"
      }
    ],
    "name": "CampaignNotStarted",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "blockTimestamp",
        "type": "uint256"
      },
      {
        "internalType": "uint40",
        "name": "expiration",
        "type": "uint40"
      },
      {
        "internalType": "uint40",
        "name": "firstClaimTime",
        "type": "uint40"
      }
    ],
    "name": "ClawbackNotAllowed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "feeRecipient",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "feeAmount",
        "type": "uint256"
      }
    ],
    "name": "FeeTransferFailed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "IndexClaimed",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "feePaid",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "minFeeWei",
        "type": "uint256"
      }
    ],
    "name": "InsufficientFeePayment",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientPoolBalance",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidProof",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ToZeroAddress",
    "type": "error"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "admin_",
        "type": "address"
      },
      {
        "internalType": "address",
        "name": "comptroller_",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "merkleRoot_",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "token_",
        "type": "address"
      },
      {
        "internalType": "uint40",
        "name": "campaignStartTime_",
        "type": "uint40"
      },
      {
        "internalType": "uint40",
        "name": "expiration_",
        "type": "uint40"
      },
      {
        "internalType": "string",
        "name": "campaignName_",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "minFeeUSD_",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "stateMutability": "payable",
    "type": "receive"
  },
  {
    "inputs": [],
    "name": "CAMPAIGN_START_TIME",
    "outputs": [
      {
        "internalType": "uint40",
        "name": "",
        "type": "uint40"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "COMPTROLLER",
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
    "inputs": [],
    "name": "DEPLOYER",
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
    "inputs": [],
    "name": "EXPIRATION",
    "outputs": [
      {
        "internalType": "uint40",
        "name": "",
        "type": "uint40"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "MERKLE_ROOT",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "TOKEN",
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
    "inputs": [],
    "name": "admin",
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
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "amountCommitment",
    "outputs": [
      {
        "internalType": "bytes32",
        "name": "",
        "type": "bytes32"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "calculateMinFeeWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "callbackFeeWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "campaignName",
    "outputs": [
      {
        "internalType": "string",
        "name": "",
        "type": "string"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
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
      },
      {
        "internalType": "bytes32[]",
        "name": "merkleProof",
        "type": "bytes32[]"
      }
    ],
    "name": "claim",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "claimStore",
    "outputs": [
      {
        "internalType": "contract PodClaimStore",
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
        "name": "index",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
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
      },
      {
        "internalType": "bytes32[]",
        "name": "merkleProof",
        "type": "bytes32[]"
      }
    ],
    "name": "claimTo",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "clawback",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "firstClaimTime",
    "outputs": [
      {
        "internalType": "uint40",
        "name": "",
        "type": "uint40"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "hasClaimed",
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
    "name": "hasExpired",
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
    "name": "inboxFeeWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      }
    ],
    "name": "markClaimed",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "minFeeUSD",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "onPoolCredited",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pTokenCallbackFeeWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "pTokenTransferFeeWei",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "address",
        "name": "to",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "payoutTo",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "payrollVault",
    "outputs": [
      {
        "internalType": "contract PayrollVault",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "poolCreditedTotal",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "uint256",
        "name": "index",
        "type": "uint256"
      },
      {
        "internalType": "address",
        "name": "recipient",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "commitment",
        "type": "bytes32"
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
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "registeredRecipient",
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
        "name": "amount",
        "type": "uint256"
      }
    ],
    "name": "requestCreditPool",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "runId",
    "outputs": [
      {
        "internalType": "uint256",
        "name": "",
        "type": "uint256"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {
        "internalType": "contract PayrollVault",
        "name": "vault_",
        "type": "address"
      },
      {
        "internalType": "contract PodClaimStore",
        "name": "claimStore_",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "runId_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "callbackFeeWei_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "inboxFeeWei_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "pTokenTransferFeeWei_",
        "type": "uint256"
      },
      {
        "internalType": "uint256",
        "name": "pTokenCallbackFeeWei_",
        "type": "uint256"
      }
    ],
    "name": "wirePayroll",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  }
] as const
