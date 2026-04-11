"use client";

import { useParams } from "next/navigation";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { PageHeader } from "@/components/ui/page-header";
import { RoomWindowsView } from "@/components/rooms/room-windows-view";
import { RoomFinishedPhotos } from "@/components/rooms/room-finished-photos";
import { useAppDatasetMaybe } from "@/lib/dataset-context";

export function ManagementRoomDetail({
  data,
  mediaItems,
}: {
  data?: AppDataset;
  mediaItems: UnitStageMediaItem[];
}) {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const datasetCtx = useAppDatasetMaybe();
  const datasetData = data ?? datasetCtx?.data;
  const unit = datasetData?.units.find((u) => u.id === id);
  const room = datasetData?.rooms.find((r) => r.id === roomId);

  if (!datasetData || !unit || !room) {
    return <div className="p-6 text-center text-muted">Room not found</div>;
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title={room.name}
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/management/units/${unit.id}`}
      />

      <div className="flex-1 px-5 py-5 flex flex-col gap-5">
        <RoomWindowsView
          data={datasetData}
          mediaItems={mediaItems}
          roomId={roomId}
          getStageNavProps={(winId) => ({
            unitId: id,
            roomId,
            windowId: winId,
            routeBasePath: "/management/units",
          })}
        />
        <RoomFinishedPhotos
          unitId={id}
          roomId={roomId}
          existingPhotos={mediaItems.filter(
            (m) => m.uploadKind === "room_finished_photo" && m.roomId === roomId
          )}
        />
      </div>
    </div>
  );
}
