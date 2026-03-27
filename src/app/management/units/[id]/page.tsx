import { loadFullDataset, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { ManagementUnitDetail } from "./management-unit-detail";

export default async function ManagementUnitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, activityLog, mediaItems] = await Promise.all([
    loadFullDataset(),
    loadUnitActivityLog(id),
    loadUnitStageMedia(id),
  ]);
  return <ManagementUnitDetail data={data} activityLog={activityLog} mediaItems={mediaItems} />;
}
