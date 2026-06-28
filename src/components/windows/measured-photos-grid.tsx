"use client";

import { useState } from "react";
import Image from "next/image";

import { Plus, Trash, User } from "@phosphor-icons/react";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { deleteWindowStagePhoto } from "@/app/actions/fsr-data";
import { reconcileUnitDerivedState } from "@/lib/unit-status-helpers";
import { removeUnitStageMediaItem } from "@/lib/use-unit-supplemental";
import { useDatasetActionsMaybe } from "@/lib/dataset-context";

const MAX_MEASURED_PHOTOS = 3;

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function MeasuredPhotosGrid({
  existingWindowId,
  unitId,
  mediaItems,
  photoFile,
  onAddPhoto,
}: {
  existingWindowId: string;
  unitId: string;
  mediaItems: UnitStageMediaItem[];
  photoFile: File | null;
  onAddPhoto: () => void;
}) {
  const datasetActions = useDatasetActionsMaybe();
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);

  const additionalPhotos = mediaItems
    .filter(
      (item) =>
        item.windowId === existingWindowId &&
        item.stage === "scheduled_bracketing" &&
        item.uploadKind === "window_measure"
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (additionalPhotos.length === 0) return null;

  return (
    <div
      className="animate-fade-up"
      style={{ "--anim-delay": "0.2s" } as React.CSSProperties}
    >
      <h2 className="text-xs font-bold text-zinc-600 uppercase tracking-[0.1em] mb-1 flex items-center justify-between">
        <span>All Measured Photos</span>
        <span className="font-normal normal-case text-zinc-400">
          {additionalPhotos.length}/{MAX_MEASURED_PHOTOS}
        </span>
      </h2>
      <div className="grid grid-cols-2 gap-2.5 mt-3">
        {additionalPhotos.map((photo) => (
          <div
            key={photo.id}
            className="relative aspect-square overflow-hidden rounded-2xl border border-border bg-zinc-100"
          >
            <Image
              src={photo.publicUrl}
              alt={photo.label ?? "Photo"}
              fill
              sizes="(max-width: 640px) 50vw, 280px"
              className="object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 pointer-events-none">
              <p className="flex items-center gap-1 text-[10px] font-medium text-white/90 leading-tight">
                <User size={10} />
                {photo.uploadedByName ?? "Unknown"}
                {photo.uploadedByRole && (
                  <span className="capitalize opacity-70">· {photo.uploadedByRole}</span>
                )}
              </p>
              <p className="text-[10px] text-white/60 mt-0.5">
                {formatRelativeTime(photo.createdAt)}
              </p>
            </div>
            <button
              type="button"
              disabled={deletingMediaId === photo.id}
              onClick={async () => {
                setDeletingMediaId(photo.id);
                try {
                  const result = await deleteWindowStagePhoto(photo.id, unitId);
                  if (result.ok) {
                    removeUnitStageMediaItem(unitId, photo.id);
                    datasetActions?.patchData((prev) =>
                      reconcileUnitDerivedState(prev, unitId, { photoDelta: -1 })
                    );
                  }
                } finally {
                  setDeletingMediaId(null);
                }
              }}
              className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70 disabled:opacity-40"
            >
              {deletingMediaId === photo.id ? (
                <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
              ) : (
                <Trash size={13} weight="bold" />
              )}
            </button>
          </div>
        ))}
        {additionalPhotos.length < MAX_MEASURED_PHOTOS && !photoFile && (
          <button
            type="button"
            onClick={onAddPhoto}
            className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 transition-all active:scale-[0.97] hover:bg-zinc-100/60"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-zinc-200 shadow-sm">
              <Plus size={20} className="text-zinc-500" />
            </div>
            <span className="text-[11px] font-semibold text-zinc-500">Add Photo</span>
          </button>
        )}
      </div>
    </div>
  );
}
