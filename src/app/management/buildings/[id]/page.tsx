"use client";

import { useDatasetSlices, useDatasetSelector } from "@/lib/dataset-context";
import { BuildingDetail } from "./building-detail";

export default function BuildingDetailPage() {
  const data = useDatasetSlices(["buildings", "clients", "units"]);
  const userRole = useDatasetSelector((value) => value.user.role);
  const isHydratingInitialData = useDatasetSelector((value) => value.isHydratingInitialData);
  return (
    <BuildingDetail
      data={data}
      userRole={userRole}
      isHydratingInitialData={isHydratingInitialData}
    />
  );
}
