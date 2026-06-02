"use client";

import { useDatasetSlices } from "@/lib/dataset-context";
import { UnitKeyDatesEditor } from "@/components/units/unit-key-dates-editor";

export default function ManagementUnitDatesPage() {
  const data = useDatasetSlices(["units"]);
  return <UnitKeyDatesEditor data={data} unitsBasePath="/management/units" showCompleteBy />;
}
