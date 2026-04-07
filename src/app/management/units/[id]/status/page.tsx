import { loadUnitDetail, loadUnitStageMedia } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { UnitStatusEditor } from "@/components/units/unit-status-editor";

export default async function ManagementStatusPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems, milestones] = await Promise.all([
    loadUnitDetail(id),
    loadUnitStageMedia(id),
    getUnitMilestoneCoverage(id),
  ]);
  return (
    <UnitStatusEditor
      data={data}
      mediaItems={mediaItems}
      milestones={milestones}
      unitsBasePath="/management/units"
    />
  );
}
