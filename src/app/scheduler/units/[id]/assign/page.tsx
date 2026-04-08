"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { AssignUnitScheduler } from "./assign-unit-scheduler";

export default function SchedulerAssignPage() {
  const { data } = useAppDataset();
  return <AssignUnitScheduler data={data} />;
}
