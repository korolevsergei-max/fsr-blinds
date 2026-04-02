"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, ArrowRight } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
  const windowCount = data.windows.filter((w) => w.roomId === roomId).length;

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
        <div className="flex items-center justify-between mb-4">
          <span />
          <Link href={`/scheduler/units/${id}/rooms/${roomId}/windows/new`}>
            <button className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline active:scale-[0.96]">
              <Plus size={14} weight="bold" />
              Add Window
            </button>
          </Link>
        </div>

        <RoomWindowsView
          data={data}
          mediaItems={mediaItems}
          roomId={roomId}
          getEditHref={(winId) =>
            `/scheduler/units/${id}/rooms/${roomId}/windows/new?edit=${winId}`
          }
          getStageNavProps={(winId) => ({
            unitId: id,
            roomId,
            windowId: winId,
            routeBasePath: "/scheduler/units",
          })}
          addWindowHref={`/scheduler/units/${id}/rooms/${roomId}/windows/new`}
        />
      </div>

      {windowCount > 0 && (
        <div className="sticky bottom-20 px-5 pb-4 pt-3 bg-gradient-to-t from-white via-white to-transparent">
          <Link href={`/scheduler/units/${id}`}>
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
