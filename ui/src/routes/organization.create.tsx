import { createFileRoute } from "@tanstack/react-router";
import { OrganizationCreate } from "@/features/OrganizationPage";

export const Route = createFileRoute("/organization/create")({
  // See src/routes/organization.tsx for why these sibling tabs stay un-split.
  codeSplitGroupings: [],
  component: OrganizationCreate,
});
