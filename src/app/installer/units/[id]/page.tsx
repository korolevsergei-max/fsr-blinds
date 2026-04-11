import { loadCachedUnitSupplementalData } from "@/lib/unit-route-data";
import { UnitDetail } from "./unit-detail";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplemental = await loadCachedUnitSupplementalData(id);

  return (
    <UnitDetail
      mediaItems={supplemental.mediaItems}
      activityLog={supplemental.activityLog}
      milestones={supplemental.milestones}
    />
  );
}
