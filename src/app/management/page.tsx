"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import { ManagementDashboard } from "./management-dashboard";

export default function ManagementPage() {
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
  return <ManagementDashboard data={data} userName={userName} />;
}
