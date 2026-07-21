import { createFileRoute } from "@tanstack/react-router";
import { OrganizationOverview } from "@/components/organization/OrganizationOverview";

export const Route = createFileRoute("/organization/")({
  // See src/routes/organization.tsx for why these sibling tabs stay un-split.
  codeSplitGroupings: [],
  component: OrganizationOverview,
});
