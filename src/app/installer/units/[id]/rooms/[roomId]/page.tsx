import { loadUnitDetail, loadUnitStageMedia } from "@/lib/server-data";
import { RoomDetail } from "./room-detail";

export default async function RoomDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [data, mediaItems] = await Promise.all([
    loadUnitDetail(id),
    loadUnitStageMedia(id),
  ]);
  return <RoomDetail data={data} mediaItems={mediaItems} />;
}
