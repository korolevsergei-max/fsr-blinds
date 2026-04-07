import { loadUnitDetail, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { UnitDetail } from "./unit-detail";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems, activityLog, milestones] = await Promise.all([
    loadUnitDetail(id),
    loadUnitStageMedia(id),
    loadUnitActivityLog(id),
    getUnitMilestoneCoverage(id),
  ]);
  return <UnitDetail data={data} mediaItems={mediaItems} activityLog={activityLog} milestones={milestones} />;
}
