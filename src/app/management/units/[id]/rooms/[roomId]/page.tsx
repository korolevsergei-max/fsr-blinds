import { loadCachedUnitMedia } from "@/lib/unit-route-data";
import { ManagementRoomDetail } from "./management-room-detail";

export default async function ManagementRoomDetailPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id } = await params;
  const mediaItems = await loadCachedUnitMedia(id);
  return <ManagementRoomDetail mediaItems={mediaItems} />;
}
