"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { SchedulerUnitsList } from "./scheduler-units-list";

export default function SchedulerUnitsPage() {
  const { data } = useAppDataset();
  return <SchedulerUnitsList data={data} />;
}
