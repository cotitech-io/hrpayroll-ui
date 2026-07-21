import { createFileRoute } from "@tanstack/react-router";
import { OrganizationNeedsFunding } from "@/components/organization/OrganizationNeedsFunding";

export const Route = createFileRoute("/organization/needs-funding")({
  // See src/routes/organization.tsx for why these sibling tabs stay un-split.
  codeSplitGroupings: [],
  component: OrganizationNeedsFunding,
});
