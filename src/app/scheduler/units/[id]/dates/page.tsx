"use client";

import { useDatasetSlices } from "@/lib/dataset-context";
import { UnitKeyDatesEditor } from "@/components/units/unit-key-dates-editor";

export default function SchedulerUnitDatesPage() {
  const data = useDatasetSlices(["units"]);
  return <UnitKeyDatesEditor data={data} unitsBasePath="/scheduler/units" />;
}
