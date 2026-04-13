"use client";

import { useParams } from "next/navigation";
import { useUnitMediaAndMilestones } from "@/lib/use-unit-supplemental";
import { RoomDetail } from "./room-detail";

export default function InstallerRoomDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { mediaItems, milestones } = useUnitMediaAndMilestones(id);
  return <RoomDetail mediaItems={mediaItems} milestones={milestones} />;
}
