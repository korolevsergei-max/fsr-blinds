"use client";

import Image from "next/image";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { UNIT_PHOTO_STAGE_LABELS } from "@/lib/types";
import { buildWindowStageDisplaySets } from "@/lib/unit-media";

export function UnitStageSummaryGrid({
  items,
  showStageCounters = true,
}: {
  items: UnitStageMediaItem[];
  showStageCounters?: boolean;
}) {
  const groupedSets = buildWindowStageDisplaySets(items);
  const bracketedCount = groupedSets.filter((item) => Boolean(item.bracketed)).length;
  const installedCount = groupedSets.filter((item) => Boolean(item.installed)).length;
  const byRoom = new Map<string, typeof groupedSets>();
  for (const entry of groupedSets) {
    const roomList = byRoom.get(entry.roomName) ?? [];
    roomList.push(entry);
    byRoom.set(entry.roomName, roomList);
  }
  const windowComparisons = Array.from(byRoom.entries()).map(([roomName, windows]) => ({
    roomName,
    windows,
  }));

  return (
    <div className="flex flex-col gap-4">
      {showStageCounters && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {UNIT_PHOTO_STAGE_LABELS.bracketed_measured}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{bracketedCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              {UNIT_PHOTO_STAGE_LABELS.installed_pending_approval}
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{installedCount}</p>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3 py-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
              Window Sets
            </p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">
              {windowComparisons.reduce((sum, room) => sum + room.windows.length, 0)}
            </p>
          </div>
        </div>
      )}

      <section className="overflow-hidden rounded-[1.25rem] border border-border bg-white">
        <div className="border-b border-border bg-surface px-4 py-3.5">
          <p className="text-sm font-bold text-foreground">Bracketed &amp; Measured</p>
          <p className="mt-1 text-xs text-muted">
            Organized by room and window with before/bracketed/installed views.
          </p>
        </div>

        {windowComparisons.length === 0 ? (
          <div className="px-4 py-5 text-sm text-muted">No window photos are available yet.</div>
        ) : (
          <div className="flex flex-col gap-4 p-3">
            {windowComparisons.map((roomGroup) => (
              <div
                key={roomGroup.roomName}
                className="rounded-2xl border border-border bg-surface p-3"
              >
                <p className="text-xs font-bold uppercase tracking-wider text-zinc-600">
                  {roomGroup.roomName}
                </p>
                <div className="mt-2 flex flex-col gap-3">
                  {roomGroup.windows.map((windowGroup) => (
                    <div
                      key={windowGroup.windowId}
                      className="rounded-xl border border-border bg-white p-3"
                    >
                      <p className="mb-2 text-sm font-semibold text-foreground">
                        {windowGroup.windowName}
                      </p>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {([
                          { key: "before", title: "Before", item: windowGroup.before },
                          {
                            key: "bracketed",
                            title: "Bracketed",
                            item: windowGroup.bracketed,
                          },
                          {
                            key: "installed",
                            title: "Installed",
                            item: windowGroup.installed,
                          },
                        ] as const).map((slot) => (
                          <div key={`${windowGroup.windowId}-${slot.key}`}>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                              {slot.title}
                            </p>
                            {slot.item ? (
                              <div className="relative aspect-[4/3] overflow-hidden rounded-xl border border-border bg-surface">
                                <Image
                                  src={slot.item.publicUrl}
                                  alt={`${windowGroup.windowName} ${slot.title}`}
                                  fill
                                  unoptimized
                                  sizes="(min-width: 640px) 33vw, 100vw"
                                  className="object-cover"
                                />
                              </div>
                            ) : (
                              <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50 text-[11px] text-zinc-400">
                                Not added
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
