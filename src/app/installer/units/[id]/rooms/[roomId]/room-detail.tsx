"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowRight } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import type { UnitMilestoneCoverage } from "@/lib/unit-milestones";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { RoomWindowsView } from "@/components/rooms/room-windows-view";
import { deleteWindow } from "@/app/actions/fsr-data";
import { RoomFinishedPhotos } from "@/components/rooms/room-finished-photos";
import { useAppDatasetMaybe } from "@/lib/dataset-context";
import { reconcileUnitDerivedState } from "@/lib/unit-status-helpers";

export function RoomDetail({
  data,
  mediaItems,
  milestones,
}: {
  data?: AppDataset;
  mediaItems: UnitStageMediaItem[];
  milestones: UnitMilestoneCoverage;
}) {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const datasetCtx = useAppDatasetMaybe();
  const datasetData = data ?? datasetCtx?.data;
  const unit = datasetData?.units.find((u) => u.id === id);
  const room = datasetData?.rooms.find((r) => r.id === roomId);
  const windowCount = datasetData?.windows.filter((w) => w.roomId === roomId).length ?? 0;

  if (!datasetData || !unit || !room) {
    return <div className="p-6 text-center text-muted">Room not found</div>;
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title={room.name}
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/installer/units/${unit.id}`}
      />

      <div className="flex-1 px-5 py-5">
        <div className="flex items-center justify-between mb-4">
          <span />
          <Link href={`/installer/units/${id}/rooms/${roomId}/windows/new`}>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline active:scale-[0.96]">
              <Plus size={14} weight="bold" />
              Add Window
            </button>
          </Link>
        </div>

        <RoomWindowsView
          data={datasetData}
          mediaItems={mediaItems}
          roomId={roomId}
          isManufacturedComplete={milestones.allManufactured}
          getEditHref={(winId) =>
            `/installer/units/${id}/rooms/${roomId}/windows/new?edit=${winId}`
          }
          getStageNavProps={(winId) => ({
            unitId: id,
            roomId,
            windowId: winId,
          })}
          addWindowHref={`/installer/units/${id}/rooms/${roomId}/windows/new`}
          onDeleteWindow={async (winId) => {
            const result = await deleteWindow(winId, id);
            if (!result.ok) {
              throw new Error(result.error ?? "Failed to delete window.");
            }
            datasetCtx?.patchData((prev) =>
              reconcileUnitDerivedState(
                {
                  ...prev,
                  windows: prev.windows.filter((w) => w.id !== winId),
                },
                unit.id,
                {
                  unitStatus: result.unitStatus,
                  photoDelta: result.photoCountDelta ?? 0,
                }
              )
            );
          }}
        />
      </div>

      {windowCount > 0 && (
        <div className="sticky bottom-20 px-5 pb-4 pt-3 bg-gradient-to-t from-white via-white to-transparent flex flex-col gap-2">
          <RoomFinishedPhotos
            unitId={id}
            roomId={roomId}
            existingPhotos={mediaItems.filter(
              (m) => m.uploadKind === "room_finished_photo" && m.roomId === roomId
            )}
            canUpload
          />
          <Link href={`/installer/units/${id}`}>
            <Button variant="secondary" fullWidth size="lg">
              Done with Room
              <ArrowRight size={16} weight="bold" />
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
