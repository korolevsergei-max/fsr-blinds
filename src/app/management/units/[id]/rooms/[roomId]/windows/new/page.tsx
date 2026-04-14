"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useUnitSupplementalData } from "@/lib/use-unit-supplemental";
import { WindowForm } from "@/components/windows/window-form";

export default function ManagementNewWindowPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const { activityLog, milestones } = useUnitSupplementalData(id);
  const t = searchParams.get("t");
  const formKey = t ?? "default";

  return (
    <WindowForm
      key={formKey}
      activityLog={activityLog}
      milestones={milestones}
      routeBasePath="/management/units"
    />
  );
}
