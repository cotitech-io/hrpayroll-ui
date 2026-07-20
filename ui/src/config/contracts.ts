import { InboxFeeManagerAbi } from "../abis/InboxFeeManager";
import { PayrollCampaignFacadeAbi } from "../abis/PayrollCampaignFacade";
import { PayrollCampaignFactoryAbi } from "../abis/PayrollCampaignFactory";
import { PayrollVaultAbi } from "../abis/PayrollVault";
import { PodClaimStoreAbi } from "../abis/PodClaimStore";
import { PodErc20MintableAbi } from "../abis/PodErc20Mintable";
import { PrivatePayrollCotiAbi } from "../abis/PrivatePayrollCoti";

// Live testnet deployment (Avalanche Fuji = client chain, COTI testnet = MPC server chain).
// Redeployed 2026-07-20 — pod-dapp-ports iter08-thin-fuji-facade
// (deployments/production-payroll-avalancheFuji.json):
//   fundPath: public pToken.transfer(facade) → requestCreditPool → COTI creditPool
//   claimPath: claim → COTI verifyAndCredit → public payoutTo(uint256)
// Facade no longer calls local MpcCore at 0x64 on Fuji.
// Inbox fees are never baked in: quote live via PayrollVault.estimateFee() (oracle prices ×
// tx.gasprice) — the old setInboxFees/inboxFeeWei/payoutCallbackFeeWei constants are gone.
export const AVAX_CHAIN_ID = 43113; // Avalanche Fuji
export const COTI_TESTNET_CHAIN_ID = 7082400;

export const avaxContracts = {
  payrollVault: {
    address: "0xd43b8c9015565f3c3f453e574418e17302c73dd9",
    abi: PayrollVaultAbi,
  },
  // Single entrypoint for campaign creation. Fees are never stored here — callers quote
  // PayrollVault.estimateFee() live at use time.
  payrollCampaignFactory: {
    address: "0x17cad9fce18ef750e8626c2d1ee9be97f3d375e5",
    abi: PayrollCampaignFactoryAbi,
  },
  payrollCampaignFacade: {
    // ABI host + reference campaign facade from the iter08 deploy (runId 1, pMTT).
    // Employee claims resolve the target facade from the claim package's facadeAddress —
    // this address is not the only campaign the UI can talk to. Activity scans every
    // vault-linked facade.
    address: "0x401b9514a3CCA82c790d7F360F28C1B33F04227D",
    abi: PayrollCampaignFacadeAbi,
  },
  payrollClaimStore: {
    address: "0x3b765d5d29093c08236566d954f52eaadfe5a4a2",
    abi: PodClaimStoreAbi,
  },
  pToken: {
    // pMTT ("Private MyTestToken") — deployed as an EIP-1167 minimal proxy to the same
    // PodErc20MintableInitializable implementation as the previous pUSDC deployment
    // (0xcee95959573618ee8464526c591fe70ae56ab293), so the existing ABI still applies.
    // Unlike pUSDC (6 decimals), pMTT uses 18 — see PTOKEN_DECIMALS in the pages that display it.
    // Unchanged across the 2026-07-15 / 07-17 / 07-19 / 07-20 redeploys.
    address: "0x8F34570CEAD49273D5DA8A0E25e728eCC28af267",
    abi: PodErc20MintableAbi,
  },
  comptroller: {
    address: "0x79f8cc90e9a1ce76335e75bc057ed6b446679010",
  },
  // Same address as cotiTestnetContracts.inbox — PoD inbox contracts deploy deterministically
  // to identical addresses across chains. Used by the fund flow's pToken fee computation.
  inbox: {
    address: "0xAb625bE229F603f6BBF964474AFf6d5487e364De",
    abi: InboxFeeManagerAbi,
  },
} as const;

export const cotiTestnetContracts = {
  privatePayrollCoti: {
    address: "0xeddbb52a6b92db6ba088c39a96dd0b1a76082ecb",
    abi: PrivatePayrollCotiAbi,
  },
  mpcExecutor: {
    address: "0x68e151b78d51cea01eef6ee354579e044606a739",
  },
  inbox: {
    address: "0xAb625bE229F603f6BBF964474AFf6d5487e364De",
  },
} as const;
