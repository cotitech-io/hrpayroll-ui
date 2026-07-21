import { createFileRoute } from "@tanstack/react-router";
import { EmployeePage } from "@/features/EmployeePage";

export const Route = createFileRoute("/employee")({
  head: () => ({
    meta: [
      { title: "Employee — COTI Payroll" },
      {
        name: "description",
        content: "Claim your encrypted payroll payouts on Avalanche Fuji.",
      },
    ],
  }),
  component: EmployeePage,
});
