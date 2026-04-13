"use client";

import { useParams } from "next/navigation";
import { useUnitSupplementalData } from "@/lib/use-unit-supplemental";
import { UnitDetail } from "./unit-detail";

export default function UnitDetailPage() {
  const { id } = useParams<{ id: string }>();
  const supplemental = useUnitSupplementalData(id);

  return (
    <UnitDetail
      mediaItems={supplemental.mediaItems}
      activityLog={supplemental.activityLog}
      milestones={supplemental.milestones}
    />
  );
}
