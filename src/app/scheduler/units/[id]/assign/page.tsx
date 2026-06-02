"use client";

import { useDatasetSlices } from "@/lib/dataset-context";
import { AssignUnitScheduler } from "./assign-unit-scheduler";

export default function SchedulerAssignPage() {
  const data = useDatasetSlices(["units", "installers"]);
  return <AssignUnitScheduler data={data} />;
}
