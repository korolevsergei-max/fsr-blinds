import { loadFullDataset, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { UnitDetail } from "./unit-detail";

export const dynamic = "force-dynamic";

export default async function UnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems, activityLog, milestones] = await Promise.all([
    loadFullDataset(),
    loadUnitStageMedia(id),
    loadUnitActivityLog(id),
    getUnitMilestoneCoverage(id),
  ]);
  return <UnitDetail data={data} mediaItems={mediaItems} activityLog={activityLog} milestones={milestones} />;
}
