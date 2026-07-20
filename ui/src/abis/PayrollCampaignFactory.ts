export const PayrollCampaignFactoryAbi = [
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
        "internalType": "address",
        "name": "comptroller_",
        "type": "address"
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
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  {
    "anonymous": false,
    "inputs": [
      {
        "indexed": true,
        "internalType": "address",
        "name": "facade",
        "type": "address"
      },
      {
        "indexed": true,
        "internalType": "uint256",
        "name": "runId",
        "type": "uint256"
      },
      {
        "indexed": true,
        "internalType": "address",
        "name": "admin",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "creator",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "indexed": false,
        "internalType": "bytes32",
        "name": "merkleRoot",
        "type": "bytes32"
      }
    ],
    "name": "CampaignCreated",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "campaignCount",
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
        "name": "",
        "type": "uint256"
      }
    ],
    "name": "campaigns",
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
    "inputs": [],
    "name": "comptroller",
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
        "internalType": "address",
        "name": "admin",
        "type": "address"
      },
      {
        "internalType": "bytes32",
        "name": "merkleRoot",
        "type": "bytes32"
      },
      {
        "internalType": "address",
        "name": "token",
        "type": "address"
      },
      {
        "internalType": "uint40",
        "name": "campaignStartTime",
        "type": "uint40"
      },
      {
        "internalType": "uint40",
        "name": "expiration",
        "type": "uint40"
      },
      {
        "internalType": "string",
        "name": "campaignName",
        "type": "string"
      },
      {
        "internalType": "uint256",
        "name": "minFeeUSD",
        "type": "uint256"
      }
    ],
    "name": "createCampaign",
    "outputs": [
      {
        "internalType": "address",
        "name": "facade",
        "type": "address"
      },
      {
        "internalType": "uint256",
        "name": "runId",
        "type": "uint256"
      }
    ],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "vault",
    "outputs": [
      {
        "internalType": "contract PayrollVault",
        "name": "",
        "type": "address"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
