"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { InstallerSchedule } from "./installer-schedule";

export default function SchedulePage() {
  const { data, linkedEntityId } = useAppDataset();
  return <InstallerSchedule data={data} installerId={linkedEntityId ?? "inst-1"} />;
}
