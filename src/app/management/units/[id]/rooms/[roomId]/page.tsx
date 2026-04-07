import { loadUnitDetail, loadUnitStageMedia } from "@/lib/server-data";
import { ManagementRoomDetail } from "./management-room-detail";

export default async function ManagementRoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems] = await Promise.all([
    loadUnitDetail(id),
    loadUnitStageMedia(id),
  ]);
  return <ManagementRoomDetail data={data} mediaItems={mediaItems} />;
}
