import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useAccount } from "wagmi";
import { ConnectPrompt } from "@/components/ConnectPrompt";
import { OrganizationTabs } from "@/features/OrganizationPage";

export const Route = createFileRoute("/organization")({
  // Empty groupings = nothing is split out of the critical/eager file (the
  // default groups `component` into its own lazy chunk). Switching between
  // sibling /organization/* tabs was crossing a fresh dynamic-import/Suspense
  // boundary on first visit to each tab, which — combined with SSR hydration —
  // crashed React ("Root did not complete") and force-remounted the whole tree,
  // including the wagmi provider, dropping the wallet connection.
  codeSplitGroupings: [],
  head: () => ({
    meta: [
      { title: "Organization — COTI Payroll" },
      {
        name: "description",
        content:
          "Create, fund, and manage encrypted payroll runs on Avalanche Fuji.",
      },
    ],
  }),
  component: OrganizationLayout,
});

// Shared shell for every /organization/* tab. Lives on the parent route so it
// mounts once — switching tabs previously bounced between the "/organization/"
// index route and a "/organization/$" splat route, which are different route
// matches. Each swap unmounted this shell (tabs + wallet hooks) and remounted
// it fresh, dropping the wallet connection state until the user reconnected.
function OrganizationLayout() {
  const { isConnected } = useAccount();

  if (!isConnected) {
    return <ConnectPrompt message="Connect a wallet to create or fund a payroll." />;
  }

  return (
    <div className="space-y-6">
      <OrganizationTabs />
      <Outlet />
    </div>
  );
}
