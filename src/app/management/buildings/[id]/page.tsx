"use client";

import { useAppDataset } from "@/lib/dataset-context";
import { BuildingDetail } from "./building-detail";

export default function BuildingDetailPage() {
  const { data, user, isHydratingInitialData } = useAppDataset();
  return (
    <BuildingDetail
      data={data}
      userRole={user.role}
      isHydratingInitialData={isHydratingInitialData}
    />
  );
}
