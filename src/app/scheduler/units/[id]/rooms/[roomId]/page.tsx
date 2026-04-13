import { loadCachedUnitMediaAndMilestones } from "@/lib/unit-route-data";
import { RoomDetail } from "./room-detail";

export default async function SchedulerRoomDetailPage({
  params,
}: {
  params: Promise<{ id: string; roomId: string }>;
}) {
  const { id } = await params;
  const { mediaItems, milestones } = await loadCachedUnitMediaAndMilestones(id);
  return <RoomDetail mediaItems={mediaItems} milestones={milestones} />;
}
