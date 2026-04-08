"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { UnitKeyDatesEditor } from "@/components/units/unit-key-dates-editor";

export default function ManagementUnitDatesPage() {
  const { data } = useAppDataset();
  return <UnitKeyDatesEditor data={data} unitsBasePath="/management/units" showCompleteBy />;
}
