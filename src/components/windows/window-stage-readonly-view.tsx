"use client";

import { useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Camera } from "@phosphor-icons/react";
import Image from "next/image";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { PageHeader } from "@/components/ui/page-header";
import { WindowStageNav } from "@/components/window-stage-nav";

type StageMode = "before" | "bracketed" | "installed";

type StageRouteBasePath = "/management/units" | "/scheduler/units";

type WindowStageReadonlyViewProps = {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
  mode: StageMode;
  /** Read-only stage pages under management or scheduler. */
  routeBasePath?: StageRouteBasePath;
};

function pickLatestStagePhoto(
  mediaItems: UnitStageMediaItem[],
  windowId: string,
  stage: UnitStageMediaItem["stage"]
): string | null {
  const match = mediaItems
    .filter((item) => item.windowId === windowId && item.stage === stage)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  return match?.publicUrl ?? null;
}

export function WindowStageReadonlyView({
  data,
  mediaItems,
  mode,
  routeBasePath = "/management/units",
}: WindowStageReadonlyViewProps) {
  const params = useParams<{ id: string; roomId: string; windowId?: string }>();
  const searchParams = useSearchParams();
  const unitId = params.id;
  const roomId = params.roomId;
  const windowId = mode === "before" ? searchParams.get("edit") ?? "" : params.windowId ?? "";

  const unit = data.units.find((u) => u.id === unitId);
  const room = data.rooms.find((r) => r.id === roomId);
  const windowItem = data.windows.find((w) => w.id === windowId && w.roomId === roomId);

  const selectedPhotoUrl = useMemo(() => {
    if (!windowItem) return null;
    if (mode === "before") {
      return (
        pickLatestStagePhoto(mediaItems, windowItem.id, "scheduled_bracketing") ??
        windowItem.photoUrl ??
        null
      );
    }
    if (mode === "bracketed") {
      return pickLatestStagePhoto(mediaItems, windowItem.id, "bracketed_measured");
    }
    return pickLatestStagePhoto(mediaItems, windowItem.id, "installed_pending_approval");
  }, [mediaItems, mode, windowItem]);

  if (!unit || !room || !windowItem) {
    return <div className="p-6 text-center text-muted">Window not found</div>;
  }

  const modeTitle =
    mode === "before" ? "Before" : mode === "bracketed" ? "Bracketed" : "Installed";

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageHeader
        title={windowItem.label}
        subtitle={`${room.name} • ${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`${routeBasePath}/${unit.id}/rooms/${room.id}`}
        belowTitle={
          <WindowStageNav
            unitId={unit.id}
            roomId={room.id}
            windowId={windowItem.id}
            routeBasePath={routeBasePath}
            active={mode}
            flushBottom
          />
        }
      />

      <div className="flex flex-1 flex-col gap-6 px-5 py-5">
        {selectedPhotoUrl ? (
          <div className="relative aspect-video overflow-hidden rounded-2xl border border-border bg-surface">
            <Image
              src={selectedPhotoUrl}
              alt={`${windowItem.label} ${modeTitle} photo`}
              fill
              className="select-none object-cover [-webkit-touch-callout:none]"
              draggable={false}
            />
          </div>
        ) : (
          <div className="flex h-56 w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-300 bg-white">
            <Camera size={28} className="text-zinc-400" />
            <span className="text-sm font-medium text-zinc-500">
              No {modeTitle.toLowerCase()} photo uploaded yet
            </span>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-white p-4">
          <h2 className="mb-3 text-[10px] font-bold uppercase tracking-[0.12em] text-muted">
            Window Details
          </h2>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted">Width</p>
              <p className="mt-0.5 font-semibold text-foreground">{windowItem.width}&quot;</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted">Height</p>
              <p className="mt-0.5 font-semibold text-foreground">{windowItem.height}&quot;</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.1em] text-muted">Depth</p>
              <p className="mt-0.5 font-semibold text-foreground">
                {windowItem.depth ?? "—"}
              </p>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500">
            Type: <span className="font-semibold uppercase">{windowItem.blindType}</span>
          </p>
          {windowItem.notes && (
            <p className="mt-2 text-xs italic text-zinc-500">{windowItem.notes}</p>
          )}
        </div>
      </div>
    </div>
  );
}
