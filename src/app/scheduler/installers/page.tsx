"use client";

import { useDatasetSlices } from "@/lib/dataset-context";
import { SchedulerInstallers } from "./scheduler-installers";

export default function SchedulerInstallersPage() {
  const data = useDatasetSlices(["installers", "units"]);
  return <SchedulerInstallers data={data} />;
}
