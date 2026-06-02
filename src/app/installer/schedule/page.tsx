"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import { InstallerSchedule } from "./installer-schedule";

export default function SchedulePage() {
  const data = useDatasetSlices([
    "units",
    "installers",
    "schedule",
    "clients",
    "buildings",
    "manufacturingEscalations",
  ]);
  const installerId = useDatasetSelector((value) => value.linkedEntityId);
  return <InstallerSchedule data={data} installerId={installerId ?? "inst-1"} />;
}
