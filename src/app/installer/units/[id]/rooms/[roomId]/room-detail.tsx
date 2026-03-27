"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Plus,
  Ruler,
  Camera,
  Warning,
  CheckCircle,
  ArrowRight,
} from "@phosphor-icons/react";
import { getWindowsByRoom } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { RiskBadge } from "@/components/ui/risk-badge";

type WindowStageKey = "pre" | "bracketed" | "installed";
type ImageOrientation = "portrait" | "landscape" | "square";

export function RoomDetail({
  data,
  mediaItems,
}: {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
}) {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const unit = data.units.find((u) => u.id === id);
  const room = data.rooms.find((r) => r.id === roomId);
  const windowsList = room ? getWindowsByRoom(data, room.id) : [];
  const [selectedStageByWindow, setSelectedStageByWindow] = useState<
    Record<string, WindowStageKey>
  >({});
  const [imageOrientationByUrl, setImageOrientationByUrl] = useState<
    Record<string, ImageOrientation>
  >({});

  const windowStageMediaMap = useMemo(() => {
    const map = new Map<string, Partial<Record<WindowStageKey, string>>>();

    for (const item of mediaItems) {
      if (!item.windowId) continue;
      const current = map.get(item.windowId) ?? {};
      if (item.stage === "scheduled_bracketing" && !current.pre) {
        current.pre = item.publicUrl;
      }
      if (item.stage === "bracketed_measured" && !current.bracketed) {
        current.bracketed = item.publicUrl;
      }
      if (item.stage === "installed_pending_approval" && !current.installed) {
        current.installed = item.publicUrl;
      }
      map.set(item.windowId, current);
    }

    return map;
  }, [mediaItems]);

  const postBracketingWindowIds = new Set(
    mediaItems
      .filter(
        (item) =>
          item.roomId === roomId &&
          item.stage === "bracketed_measured" &&
          item.uploadKind === "window_measure" &&
          item.windowId
      )
      .map((item) => item.windowId as string)
  );

  if (!unit || !room) {
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
        {windowsList.length === 0 ? (
          <EmptyState
            icon={Ruler}
            title="No windows yet"
            description="Add windows in this room to start recording measurements and photos."
            action={
              <Link href={`/installer/units/${id}/rooms/${roomId}/windows/new`}>
                <Button>
                  <Plus size={16} weight="bold" />
                  Add First Window
                </Button>
              </Link>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[10px] font-bold text-muted uppercase tracking-wider">
                {windowsList.length} window{windowsList.length !== 1 ? "s" : ""}
              </p>
              <Link href={`/installer/units/${id}/rooms/${roomId}/windows/new`}>
                <button className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline active:scale-[0.96]">
                  <Plus size={14} weight="bold" />
                  Add Window
                </button>
              </Link>
            </div>

            {windowsList.map((win, i) => (
              <motion.div
                key={win.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  delay: i * 0.05,
                  duration: 0.3,
                  ease: [0.16, 1, 0.3, 1],
                }}
              >
                <div className="bg-white rounded-2xl border border-border p-4 hover:border-zinc-300 transition-all">
                  {(() => {
                    const stageMedia = windowStageMediaMap.get(win.id) ?? {};
                    const stageOptions: { key: WindowStageKey; label: string; url: string }[] = [];
                    const preUrl = stageMedia.pre ?? win.photoUrl ?? "";
                    if (preUrl) stageOptions.push({ key: "pre", label: "Pre-bracketed", url: preUrl });
                    if (stageMedia.bracketed) {
                      stageOptions.push({
                        key: "bracketed",
                        label: "Bracketed",
                        url: stageMedia.bracketed,
                      });
                    }
                    if (stageMedia.installed) {
                      stageOptions.push({
                        key: "installed",
                        label: "Installed",
                        url: stageMedia.installed,
                      });
                    }

                    const selectedStage =
                      selectedStageByWindow[win.id] ??
                      (stageOptions.find((option) => option.key === "pre")?.key ??
                        stageOptions[0]?.key ??
                        "pre");
                    const selectedImageUrl =
                      stageOptions.find((option) => option.key === selectedStage)?.url ??
                      stageOptions[0]?.url ??
                      null;

                    return (
                      <>
                        {selectedImageUrl && (
                          <div
                            className={`mb-3 rounded-xl overflow-hidden border border-border bg-surface ${
                              imageOrientationByUrl[selectedImageUrl] === "portrait"
                                ? "flex justify-center"
                                : ""
                            }`}
                          >
                            <img
                              src={selectedImageUrl}
                              alt={`${win.label} ${selectedStage} photo`}
                              onLoad={(e) => {
                                const img = e.currentTarget;
                                const nextOrientation: ImageOrientation =
                                  img.naturalHeight > img.naturalWidth
                                    ? "portrait"
                                    : img.naturalHeight < img.naturalWidth
                                      ? "landscape"
                                      : "square";
                                setImageOrientationByUrl((current) => {
                                  if (current[selectedImageUrl] === nextOrientation) return current;
                                  return { ...current, [selectedImageUrl]: nextOrientation };
                                });
                              }}
                              className={`w-full bg-surface ${
                                imageOrientationByUrl[selectedImageUrl] === "portrait"
                                  ? "max-h-[28rem] object-contain"
                                  : imageOrientationByUrl[selectedImageUrl] === "square"
                                    ? "aspect-square object-cover"
                                    : "aspect-[16/9] object-cover"
                              }`}
                            />
                          </div>
                        )}

                        {stageOptions.length > 1 && (
                          <div className="mb-3 flex flex-wrap gap-2">
                            {stageOptions.map((option) => (
                              <button
                                key={option.key}
                                type="button"
                                onClick={() =>
                                  setSelectedStageByWindow((current) => ({
                                    ...current,
                                    [win.id]: option.key,
                                  }))
                                }
                                className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all ${
                                  selectedStage === option.key
                                    ? "border-accent bg-accent text-white"
                                    : "border-border bg-surface text-zinc-600"
                                }`}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    );
                  })()}

                  <div className="flex items-start justify-between mb-2.5">
                    <div>
                      <p className="text-sm font-bold text-foreground tracking-tight">
                        {win.label}
                      </p>
                      <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Type
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                          {win.blindType}
                        </span>
                      </div>
                    </div>
                    <RiskBadge flag={win.riskFlag} />
                  </div>
                  {postBracketingWindowIds.has(win.id) && (
                    <div className="mb-2 rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-medium text-emerald-700">
                      Post-bracketing photo saved
                    </div>
                  )}

                  <div className="flex items-center gap-4 text-xs text-muted">
                    <span className="flex items-center gap-1.5">
                      <Ruler size={14} />
                      {win.measured ? (
                        <span className="font-mono font-semibold text-foreground">
                          {win.width}&quot; x {win.height}&quot;
                        </span>
                      ) : (
                        "Not measured"
                      )}
                    </span>
                    <span className="flex items-center gap-1">
                      <Camera size={14} />
                      {win.photoUrl ? (
                        <CheckCircle
                          size={14}
                          weight="fill"
                          className="text-accent"
                        />
                      ) : (
                        "Required"
                      )}
                    </span>
                  </div>

                  {win.notes && (
                    <p className="mt-2 text-xs text-zinc-500 line-clamp-1 italic">
                      {win.notes}
                    </p>
                  )}
                  <div className="mt-3">
                    <Link
                      href={`/installer/units/${id}/rooms/${roomId}/windows/new?edit=${win.id}`}
                      className="inline-flex items-center rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-foreground"
                    >
                      Edit Window
                    </Link>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {windowsList.length > 0 && (
        <div className="sticky bottom-20 px-5 pb-4 pt-3 bg-gradient-to-t from-white via-white to-transparent">
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
