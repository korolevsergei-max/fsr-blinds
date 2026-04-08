"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppDataset } from "@/lib/dataset-context";
import { fetchUnitSupplementalData, EMPTY_MILESTONES, type UnitSupplementalData } from "@/app/actions/dataset-queries";
import { ManagementUnitDetail } from "./management-unit-detail";

export default function ManagementUnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, user } = useAppDataset();
  const [supplemental, setSupplemental] = useState<UnitSupplementalData | null>(null);

  useEffect(() => {
    fetchUnitSupplementalData(id).then(setSupplemental);
  }, [id]);

  return (
    <ManagementUnitDetail
      data={data}
      activityLog={supplemental?.activityLog ?? []}
      mediaItems={supplemental?.mediaItems ?? []}
      milestones={supplemental?.milestones ?? EMPTY_MILESTONES}
      userRole={user.role}
    />
  );
}
