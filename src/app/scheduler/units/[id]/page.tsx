"use client";

import { useParams } from "next/navigation";
import { useUnitSupplementalData } from "@/lib/use-unit-supplemental";
import { SchedulerUnitDetail } from "./scheduler-unit-detail";

export default function SchedulerUnitPage() {
  const { id } = useParams<{ id: string }>();
  const supplemental = useUnitSupplementalData(id);

  return (
    <SchedulerUnitDetail
      activityLog={supplemental.activityLog}
      milestones={supplemental.milestones}
    />
  );
}
