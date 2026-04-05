import { loadSchedulerDataset, loadUnitStageMedia } from "@/lib/server-data";
import { getUnitMilestoneCoverage } from "@/lib/unit-milestones";
import { StatusUpdate } from "./status-update";

export default async function StatusUpdatePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems, milestones] = await Promise.all([
    loadSchedulerDataset(),
    loadUnitStageMedia(id),
    getUnitMilestoneCoverage(id),
  ]);
  return <StatusUpdate data={data} mediaItems={mediaItems} milestones={milestones} />;
}
