import { InboxFeeManagerAbi } from "../abis/InboxFeeManager";
import { PayrollCampaignFacadeAbi } from "../abis/PayrollCampaignFacade";
import { PayrollVaultAbi } from "../abis/PayrollVault";
import { PodClaimStoreAbi } from "../abis/PodClaimStore";
import { PodErc20MintableAbi } from "../abis/PodErc20Mintable";
import { PrivatePayrollCotiAbi } from "../abis/PrivatePayrollCoti";

// Live testnet deployment (Avalanche Fuji = client chain, COTI testnet = MPC server chain).
// Redeployed 2026-07-15 targeting Fuji instead of Sepolia. Verified against deployed
// bytecode — see git history for the selector-matching check.
export const AVAX_CHAIN_ID = 43113; // Avalanche Fuji
export const COTI_TESTNET_CHAIN_ID = 7082400;

export const avaxContracts = {
  payrollVault: {
    address: "0xa8583516419d9ad1491b85e1b884bcd12241a78d",
    abi: PayrollVaultAbi,
  },
  payrollCampaignFacade: {
    address: "0xc7a1a9cd3d6d9571254b7f4c3eee33bb26ab8e2f",
    abi: PayrollCampaignFacadeAbi,
  },
  payrollClaimStore: {
    address: "0xfd5c63d966121650ca68becb3f06cdf15822d875",
    abi: PodClaimStoreAbi,
  },
  pToken: {
    // Deployed as an EIP-1167 minimal proxy — calls go to this proxy address, but the ABI
    // is the real implementation's (0xcee95959573618ee8464526c591fe70ae56ab293, verified
    // 57/57 selector match).
    address: "0x4C8dD09336BB7A219bef9448914a9E4621cE3645",
    abi: PodErc20MintableAbi,
  },
  comptroller: {
    address: "0x6c08aad1b031e51333010304a85e31a5f8aade7f",
  },
  // Same address as cotiTestnetContracts.inbox — PoD inbox contracts deploy deterministically
  // to identical addresses across chains. Confirmed live: PayrollVault.inbox() on Fuji returns
  // this exact address. Used to compute wirePayroll's fee params client-side.
  inbox: {
    address: "0xAb625bE229F603f6BBF964474AFf6d5487e364De",
    abi: InboxFeeManagerAbi,
  },
} as const;

// Unchanged from the Sepolia-targeting deployment — the COTI-side contracts didn't move,
// only the source/client chain did.
export const cotiTestnetContracts = {
  privatePayrollCoti: {
    address: "0xcdf4d94b3f2ff46e5468fde76d0282be718122dc",
    abi: PrivatePayrollCotiAbi,
  },
  mpcExecutor: {
    address: "0x68e151b78d51cea01eef6ee354579e044606a739",
  },
  inbox: {
    address: "0xAb625bE229F603f6BBF964474AFf6d5487e364De",
  },
} as const;

// The vault run this UI operates against. A future "create campaign" flow (Phase 3)
// will register additional runs; this is the one already live on-chain today.
export const DEFAULT_RUN_ID = 1;
