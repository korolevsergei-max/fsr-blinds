import { loadFullDataset, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { ManagementUnitDetail } from "./management-unit-detail";

export default async function ManagementUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, activityLog, mediaItems, milestones] = await Promise.all([
    loadFullDataset(),
    loadUnitActivityLog(id),
    loadUnitStageMedia(id),
    getUnitMilestoneCoverage(id),
  ]);
  return <ManagementUnitDetail data={data} activityLog={activityLog} mediaItems={mediaItems} milestones={milestones} />;
}
