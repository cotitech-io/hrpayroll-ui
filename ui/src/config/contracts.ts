import { InboxFeeManagerAbi } from "../abis/InboxFeeManager";
import { PayrollCampaignFacadeAbi } from "../abis/PayrollCampaignFacade";
import { PayrollCampaignFactoryAbi } from "../abis/PayrollCampaignFactory";
import { PayrollVaultAbi } from "../abis/PayrollVault";
import { PodClaimStoreAbi } from "../abis/PodClaimStore";
import { PodErc20MintableAbi } from "../abis/PodErc20Mintable";
import { PrivatePayrollCotiAbi } from "../abis/PrivatePayrollCoti";

// Live testnet deployment (Avalanche Fuji = client chain, COTI testnet = MPC server chain).
// Redeployed 2026-07-19 — pod-dapp-ports iter08-thin-fuji-facade
// (deployments/production-payroll-avalancheFuji.json):
//   fundPath: public pToken.transfer(facade) → requestCreditPool → COTI creditPool
//   claimPath: claim → COTI verifyAndCredit → public payoutTo(uint256)
// Facade no longer calls local MpcCore at 0x64 on Fuji.
export const AVAX_CHAIN_ID = 43113; // Avalanche Fuji
export const COTI_TESTNET_CHAIN_ID = 7082400;

export const avaxContracts = {
  payrollVault: {
    address: "0x5befe6a1a38881eb1e2be092c1dd730f45811801",
    abi: PayrollVaultAbi,
  },
  // Single entrypoint for campaign creation. Holds the wire fees (callback/inbox/pToken)
  // as state set at deploy time — the UI no longer computes them per-create.
  payrollCampaignFactory: {
    address: "0x4d2613a8fa165a54171a2d8ba7befe0f9afcbdbd",
    abi: PayrollCampaignFactoryAbi,
  },
  payrollCampaignFacade: {
    // ABI host + reference campaign facade from the iter08 deploy (runId 1, pMTT).
    // Employee claims resolve the target facade from the claim package's facadeAddress —
    // this address is not the only campaign the UI can talk to. Activity scans every
    // vault-linked facade.
    address: "0x458851b4f87C9B2cdb53A9Fb0DB3f4189584dF67",
    abi: PayrollCampaignFacadeAbi,
  },
  payrollClaimStore: {
    address: "0xea79652ea1c5a053e86f9433d86016a1358b6bb2",
    abi: PodClaimStoreAbi,
  },
  pToken: {
    // pMTT ("Private MyTestToken") — deployed as an EIP-1167 minimal proxy to the same
    // PodErc20MintableInitializable implementation as the previous pUSDC deployment
    // (0xcee95959573618ee8464526c591fe70ae56ab293), so the existing ABI still applies.
    // Unlike pUSDC (6 decimals), pMTT uses 18 — see PTOKEN_DECIMALS in the pages that display it.
    // Unchanged across the 2026-07-15 / 07-17 / 07-19 redeploys.
    address: "0x8F34570CEAD49273D5DA8A0E25e728eCC28af267",
    abi: PodErc20MintableAbi,
  },
  comptroller: {
    address: "0xc444ea253dfc8ab8fd9eacd4c8e140975d891eb0",
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
    address: "0x0483a18becb2b1311b7fee7be7168bc2356f3b8a",
    abi: PrivatePayrollCotiAbi,
  },
  mpcExecutor: {
    address: "0x68e151b78d51cea01eef6ee354579e044606a739",
  },
  inbox: {
    address: "0xAb625bE229F603f6BBF964474AFf6d5487e364De",
  },
} as const;
