import { createFileRoute } from "@tanstack/react-router";
import { OrganizationRuns } from "@/features/OrganizationPage";

export const Route = createFileRoute("/organization/runs")({
  // See src/routes/organization.tsx for why these sibling tabs stay un-split.
  codeSplitGroupings: [],
  component: OrganizationRuns,
});
