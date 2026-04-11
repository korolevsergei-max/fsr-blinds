import { loadCachedUnitSupplementalData } from "@/lib/unit-route-data";
import { ManagementUnitDetail } from "./management-unit-detail";

export default async function ManagementUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supplemental = await loadCachedUnitSupplementalData(id);

  return (
    <ManagementUnitDetail
      activityLog={supplemental.activityLog}
      mediaItems={supplemental.mediaItems}
      milestones={supplemental.milestones}
    />
  );
}
