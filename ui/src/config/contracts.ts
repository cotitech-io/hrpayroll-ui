import { PayrollCampaignFacadeAbi } from "../abis/PayrollCampaignFacade";
import { PayrollVaultAbi } from "../abis/PayrollVault";
import { PodClaimStoreAbi } from "../abis/PodClaimStore";
import { PrivatePayrollCotiAbi } from "../abis/PrivatePayrollCoti";

// Live testnet deployment (Sepolia = client chain, COTI testnet = MPC server chain).
// Verified against deployed bytecode — see git history for the selector-matching check.
export const SEPOLIA_CHAIN_ID = 11155111;
export const COTI_TESTNET_CHAIN_ID = 7082400;

export const sepoliaContracts = {
  payrollVault: {
    address: "0xfcc5b82baef5bf829ccd1950a614e02f6c805d10",
    abi: PayrollVaultAbi,
  },
  payrollCampaignFacade: {
    address: "0xb0cb44730c6c8b3920f276c4a7bd302bb722bcba",
    abi: PayrollCampaignFacadeAbi,
  },
  payrollClaimStore: {
    address: "0x7d40ccfeac1bb6ead7a48487f0e67a76ff4fde13",
    abi: PodClaimStoreAbi,
  },
  pToken: {
    address: "0xc727D2Ab43bF0d4cab75FD5C046BA38899ca988a",
  },
  comptroller: {
    address: "0xe21e1b33057efaafa7320b010759ed0a9c8c9b60",
  },
} as const;

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
