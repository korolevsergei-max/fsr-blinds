import { loadFullDataset, loadUnitStageMedia } from "@/lib/server-data";
import { SchedulerRoomDetail } from "./scheduler-room-detail";

export default async function SchedulerRoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems] = await Promise.all([
    loadFullDataset(),
    loadUnitStageMedia(id),
  ]);
  return <SchedulerRoomDetail data={data} mediaItems={mediaItems} />;
}
