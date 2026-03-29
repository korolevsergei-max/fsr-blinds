"use client";

import { useParams } from "next/navigation";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { PageHeader } from "@/components/ui/page-header";
import { RoomWindowsView } from "@/components/rooms/room-windows-view";

export function SchedulerRoomDetail({
  data,
  mediaItems,
}: {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
}) {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const unit = data.units.find((u) => u.id === id);
  const room = data.rooms.find((r) => r.id === roomId);

  if (!unit || !room) {
    return <div className="p-6 text-center text-muted">Room not found</div>;
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title={room.name}
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/scheduler/units/${unit.id}`}
      />

      <div className="flex-1 px-5 py-5">
        <RoomWindowsView
          data={data}
          mediaItems={mediaItems}
          roomId={roomId}
          getStageNavProps={(winId) => ({
            unitId: id,
            roomId,
            windowId: winId,
            routeBasePath: "/scheduler/units",
          })}
        />
      </div>
    </div>
  );
}
