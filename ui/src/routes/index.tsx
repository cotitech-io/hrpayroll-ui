import { createFileRoute, redirect } from "@tanstack/react-router";

// Activity page removed 2026-07-22 — "/" now lands on the organization view.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/organization" });
  },
});
