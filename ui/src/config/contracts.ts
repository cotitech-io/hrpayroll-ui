import { InboxFeeManagerAbi } from "../abis/InboxFeeManager";
import { PayrollCampaignFacadeAbi } from "../abis/PayrollCampaignFacade";
import { PayrollCampaignFactoryAbi } from "../abis/PayrollCampaignFactory";
import { PayrollVaultAbi } from "../abis/PayrollVault";
import { PodClaimStoreAbi } from "../abis/PodClaimStore";
import { PodErc20MintableAbi } from "../abis/PodErc20Mintable";
import { PrivatePayrollCotiAbi } from "../abis/PrivatePayrollCoti";

// Live testnet deployment (Avalanche Fuji = client chain, COTI testnet = MPC server chain).
// Redeployed 2026-07-22 08:42 UTC — pod-dapp-ports iteration 10 (commit a9fe8e9,
// deployments/production-payroll-avalancheFuji.json; supersedes the same-morning 08:26 deploy).
//   fundPath: public pToken.transfer(facade) → requestCreditPool → COTI creditPool
//   claimPath: claim(7 args) → COTI verifyAndCredit → public payoutTo(to, amount, callbackFeeWei)
// iter10 removed ALL on-chain fee estimation (vault.estimateFee is gone): claim/claimTo take
// four caller-quoted fee args (inboxTotal/inboxCallback/pTokenTotal/pTokenCallback wei) which
// the vault escrows per-request; clawback gained the two pToken fee args. Quote live via the
// inbox's calculateTwoWayFeeRequiredInLocalToken (podFees.ts gas/size heuristics).
// The claim inbox leg is paid from facade float; the payout-callback pToken leg from vault
// float (both pre-funded with native AVAX — see tests/testnet/helpers.ts claim flow).
export const AVAX_CHAIN_ID = 43113; // Avalanche Fuji
export const COTI_TESTNET_CHAIN_ID = 7082400;

export const avaxContracts = {
  payrollVault: {
    address: "0x41560d11e83369b24c9020a8ec59de98935be377",
    abi: PayrollVaultAbi,
  },
  // Single entrypoint for campaign creation. Fees are never stored here — callers quote
  // the inbox's calculateTwoWayFeeRequiredInLocalToken live at use time (podFees.ts).
  payrollCampaignFactory: {
    address: "0x056242ccb7c71165ba0c6e8d1a9b2330ec6aefd0",
    abi: PayrollCampaignFactoryAbi,
  },
  payrollCampaignFacade: {
    // ABI host + reference campaign facade from the iter10 deploy (runId 1, pMTT).
    // Employee claims resolve the target facade from the claim package's facadeAddress —
    // this address is not the only campaign the UI can talk to. Activity scans every
    // vault-linked facade.
    address: "0x5EC2693A0f014D32917A9801999B07011b1A9030",
    abi: PayrollCampaignFacadeAbi,
  },
  payrollClaimStore: {
    address: "0xd4418977eaa75de172157b456bfb63c1cff297a9",
    abi: PodClaimStoreAbi,
  },
  pToken: {
    // pMTT ("Private MyTestToken") — deployed as an EIP-1167 minimal proxy to the same
    // PodErc20MintableInitializable implementation as the previous pUSDC deployment
    // (0xcee95959573618ee8464526c591fe70ae56ab293), so the existing ABI still applies.
    // Unlike pUSDC (6 decimals), pMTT uses 18 — see PTOKEN_DECIMALS in the pages that display it.
    // Redeployed 2026-07-21 (new proxy instance); carried forward unchanged in the
    // 2026-07-22 redeploy. Decimals/ABI unchanged.
    address: "0xFC6283a9000d7D5Cf8A058A04A9ED90265Af1634",
    abi: PodErc20MintableAbi,
  },
  comptroller: {
    address: "0xaaef4e27ab0213b826a0db994122f971aefafdff",
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
    address: "0x81aa3b52ffcbb62bc4391008ceeb0965c0de8640",
    abi: PrivatePayrollCotiAbi,
  },
  mpcExecutor: {
    address: "0x6804961167c3c8ef2bf6839ddcf51ec1fbe800c3",
  },
  inbox: {
    address: "0x3b8B70819f27e0438cBcE7f31894f799da52648F",
  },
} as const;
