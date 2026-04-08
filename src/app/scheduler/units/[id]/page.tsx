"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAppDataset } from "@/lib/dataset-context";
import { fetchUnitSupplementalData, EMPTY_MILESTONES, type UnitSupplementalData } from "@/app/actions/dataset-queries";
import { SchedulerUnitDetail } from "./scheduler-unit-detail";

export default function SchedulerUnitPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data } = useAppDataset();
  const [supplemental, setSupplemental] = useState<UnitSupplementalData | null>(null);

  const unit = data.units.find((u) => u.id === id);

  useEffect(() => {
    if (!unit) {
      router.replace("/scheduler/units");
      return;
    }
    fetchUnitSupplementalData(id).then(setSupplemental);
  }, [id, unit, router]);

  if (!unit) return null;

  return (
    <SchedulerUnitDetail
      data={data}
      activityLog={supplemental?.activityLog ?? []}
      milestones={supplemental?.milestones ?? EMPTY_MILESTONES}
    />
  );
}
