"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import type { OwnerDashboardCounts } from "@/lib/owner-dashboard-counts";
import { ManagementDashboard } from "./management-dashboard";

export function ManagementPageClient({
  initialCounts,
}: {
  initialCounts: OwnerDashboardCounts;
}) {
  const data = useDatasetSlices([
    "units",
    "clients",
    "buildings",
    "installers",
    "schedulers",
    "rooms",
    "windows",
    "manufacturingEscalations",
  ]);
  const userName = useDatasetSelector((value) => value.user.displayName);
  return (
    <ManagementDashboard
      data={data}
      userName={userName}
      initialCounts={initialCounts}
    />
  );
}
