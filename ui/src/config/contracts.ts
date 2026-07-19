import { InboxFeeManagerAbi } from "../abis/InboxFeeManager";
import { PayrollCampaignFacadeAbi } from "../abis/PayrollCampaignFacade";
import { PayrollCampaignFactoryAbi } from "../abis/PayrollCampaignFactory";
import { PayrollVaultAbi } from "../abis/PayrollVault";
import { PodClaimStoreAbi } from "../abis/PodClaimStore";
import { PodErc20MintableAbi } from "../abis/PodErc20Mintable";
import { PrivatePayrollCotiAbi } from "../abis/PrivatePayrollCoti";

// Live testnet deployment (Avalanche Fuji = client chain, COTI testnet = MPC server chain).
// Redeployed 2026-07-17 (pod-dapp-ports `naiem-factory` branch,
// deployments/production-payroll-avalancheFuji.json): adds PayrollCampaignFactory so the UI
// creates a campaign in ONE tx (facade deploy + vault createRun + wirePayroll) instead of
// three. Wiring verified live on-chain: factory.vault/claimStore/comptroller match below,
// and vault.campaignFactory points back at the factory.
export const AVAX_CHAIN_ID = 43113; // Avalanche Fuji
export const COTI_TESTNET_CHAIN_ID = 7082400;

export const avaxContracts = {
  payrollVault: {
    address: "0x4b74b2ddeb21565b18292cf42ec950f44e99be87",
    abi: PayrollVaultAbi,
  },
  // Single entrypoint for campaign creation. Holds the wire fees (callback/inbox/pToken)
  // as state set at deploy time — the UI no longer computes them per-create.
  payrollCampaignFactory: {
    address: "0xb9029c2eb84666a0c6434795467184660a85d268",
    abi: PayrollCampaignFactoryAbi,
  },
  payrollCampaignFacade: {
    // ABI host + latest known campaign facade (runId 7, pMTT). Employee claims resolve the
    // target facade from the claim package's facadeAddress — this address is not the only
    // campaign the UI can talk to. Activity scans every vault-linked facade.
    address: "0x6FAC6cC6A874213F21B8352E341D7B4B60421773",
    abi: PayrollCampaignFacadeAbi,
  },
  payrollClaimStore: {
    address: "0xe0f315496d70a9f041c04d977b7b730b6b431c94",
    abi: PodClaimStoreAbi,
  },
  pToken: {
    // pMTT ("Private MyTestToken") — deployed as an EIP-1167 minimal proxy to the same
    // PodErc20MintableInitializable implementation as the previous pUSDC deployment
    // (0xcee95959573618ee8464526c591fe70ae56ab293), so the existing ABI still applies.
    // Unlike pUSDC (6 decimals), pMTT uses 18 — see PTOKEN_DECIMALS in the pages that display it.
    // Carried over unchanged from the 2026-07-15 deployment.
    address: "0x8F34570CEAD49273D5DA8A0E25e728eCC28af267",
    abi: PodErc20MintableAbi,
  },
  comptroller: {
    address: "0x70b48b95ab180906c1e0a8901a658f6f098e00c1",
  },
  // Same address as cotiTestnetContracts.inbox — PoD inbox contracts deploy deterministically
  // to identical addresses across chains. Used by the fund flow's pToken fee computation.
  inbox: {
    address: "0xAb625bE229F603f6BBF964474AFf6d5487e364De",
    abi: InboxFeeManagerAbi,
  },
} as const;

// Unchanged in the 2026-07-17 redeploy — the COTI-side contracts didn't move, only the
// Fuji-side vault/claim-store/factory did.
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
