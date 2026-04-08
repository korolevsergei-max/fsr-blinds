"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAppDataset } from "@/lib/dataset-context";
import { fetchUnitSupplementalData, EMPTY_MILESTONES, type UnitSupplementalData } from "@/app/actions/dataset-queries";
import { UnitDetail } from "./unit-detail";

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data } = useAppDataset();
  const [supplemental, setSupplemental] = useState<UnitSupplementalData | null>(null);

  useEffect(() => {
    fetchUnitSupplementalData(id).then(setSupplemental);
  }, [id]);

  return (
    <UnitDetail
      data={data}
      mediaItems={supplemental?.mediaItems ?? []}
      activityLog={supplemental?.activityLog ?? []}
      milestones={supplemental?.milestones ?? EMPTY_MILESTONES}
    />
  );
}
