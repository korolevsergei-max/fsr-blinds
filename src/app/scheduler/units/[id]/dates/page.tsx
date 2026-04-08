"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { UnitKeyDatesEditor } from "@/components/units/unit-key-dates-editor";

export default function SchedulerUnitDatesPage() {
  const { data } = useAppDataset();
  return <UnitKeyDatesEditor data={data} unitsBasePath="/scheduler/units" />;
}
