import { loadCachedUnitSupplementalData } from "@/lib/unit-route-data";
import { SchedulerUnitDetail } from "./scheduler-unit-detail";

export default async function SchedulerUnitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplemental = await loadCachedUnitSupplementalData(id);

  return (
    <SchedulerUnitDetail
      activityLog={supplemental.activityLog}
      milestones={supplemental.milestones}
    />
  );
}
