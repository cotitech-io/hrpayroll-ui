import { createFileRoute } from "@tanstack/react-router";
import { ActivityPage } from "@/features/ActivityPage";

export const Route = createFileRoute("/")({
  component: ActivityPage,
});
