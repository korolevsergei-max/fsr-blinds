"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import { SchedulerDashboard } from "./scheduler-dashboard";

export default function SchedulerPage() {
  const data = useDatasetSlices([
    "units",
    "buildings",
    "installers",
    "rooms",
    "windows",
    "manufacturingEscalations",
  ]);
  const userName = useDatasetSelector((value) => value.user.displayName);
  return <SchedulerDashboard data={data} userName={userName} />;
}
