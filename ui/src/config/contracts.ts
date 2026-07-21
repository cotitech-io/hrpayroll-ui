import { InboxFeeManagerAbi } from "../abis/InboxFeeManager";
import { PayrollCampaignFacadeAbi } from "../abis/PayrollCampaignFacade";
import { PayrollCampaignFactoryAbi } from "../abis/PayrollCampaignFactory";
import { PayrollVaultAbi } from "../abis/PayrollVault";
import { PodClaimStoreAbi } from "../abis/PodClaimStore";
import { PodErc20MintableAbi } from "../abis/PodErc20Mintable";
import { PrivatePayrollCotiAbi } from "../abis/PrivatePayrollCoti";

// Live testnet deployment (Avalanche Fuji = client chain, COTI testnet = MPC server chain).
// Redeployed 2026-07-21 — pod-dapp-ports iter08-thin-fuji-facade
// (deployments/production-payroll-avalancheFuji.json, runId 1, same architecture as
// the 2026-07-20 redeploy — only addresses moved):
//   fundPath: public pToken.transfer(facade) → requestCreditPool → COTI creditPool
//   claimPath: claim → COTI verifyAndCredit → public payoutTo(uint256)
// Facade no longer calls local MpcCore at 0x64 on Fuji.
// Inbox fees are never baked in: quote live via PayrollVault.estimateFee() (oracle prices ×
// tx.gasprice) — the old setInboxFees/inboxFeeWei/payoutCallbackFeeWei constants are gone.
export const AVAX_CHAIN_ID = 43113; // Avalanche Fuji
export const COTI_TESTNET_CHAIN_ID = 7082400;

export const avaxContracts = {
  payrollVault: {
    address: "0x5c8f11c891bf884a153a98535a65f37903df509c",
    abi: PayrollVaultAbi,
  },
  // Single entrypoint for campaign creation. Fees are never stored here — callers quote
  // PayrollVault.estimateFee() live at use time.
  payrollCampaignFactory: {
    address: "0x40eca0ffc86c83bcde80504926a1dd7f8d84a25b",
    abi: PayrollCampaignFactoryAbi,
  },
  payrollCampaignFacade: {
    // ABI host + reference campaign facade from the iter08 deploy (runId 1, pMTT).
    // Employee claims resolve the target facade from the claim package's facadeAddress —
    // this address is not the only campaign the UI can talk to. Activity scans every
    // vault-linked facade.
    address: "0xd01e50071FDf432BA74552Ea0d0Cd22367461848",
    abi: PayrollCampaignFacadeAbi,
  },
  payrollClaimStore: {
    address: "0x5889141489b4f4377cb575888231ebdd7f492064",
    abi: PodClaimStoreAbi,
  },
  pToken: {
    // pMTT ("Private MyTestToken") — deployed as an EIP-1167 minimal proxy to the same
    // PodErc20MintableInitializable implementation as the previous pUSDC deployment
    // (0xcee95959573618ee8464526c591fe70ae56ab293), so the existing ABI still applies.
    // Unlike pUSDC (6 decimals), pMTT uses 18 — see PTOKEN_DECIMALS in the pages that display it.
    // Redeployed again 2026-07-21 (new proxy instance); decimals/ABI unchanged.
    address: "0xFC6283a9000d7D5Cf8A058A04A9ED90265Af1634",
    abi: PodErc20MintableAbi,
  },
  comptroller: {
    address: "0x920189a7688b1653573916438b3c3bf566c3c03f",
  },
  // Same address as cotiTestnetContracts.inbox — PoD inbox contracts deploy deterministically
  // to identical addresses across chains. Used by the fund flow's pToken fee computation.
  inbox: {
    address: "0x3b8B70819f27e0438cBcE7f31894f799da52648F",
    abi: InboxFeeManagerAbi,
  },
} as const;

export const cotiTestnetContracts = {
  privatePayrollCoti: {
    address: "0xd523915b48d7985837f5b10ffc6c41dc66313f04",
    abi: PrivatePayrollCotiAbi,
  },
  mpcExecutor: {
    address: "0x6804961167c3c8ef2bf6839ddcf51ec1fbe800c3",
  },
  inbox: {
    address: "0x3b8B70819f27e0438cBcE7f31894f799da52648F",
  },
} as const;
