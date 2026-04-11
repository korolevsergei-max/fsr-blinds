import { loadCachedUnitMedia } from "@/lib/unit-route-data";
import { RoomDetail } from "./room-detail";

export default async function InstallerRoomDetailPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id } = await params;
  const mediaItems = await loadCachedUnitMedia(id);
  return <RoomDetail mediaItems={mediaItems} />;
}
