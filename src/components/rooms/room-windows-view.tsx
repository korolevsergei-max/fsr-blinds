"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CheckCircle, Images, Ruler, X } from "@phosphor-icons/react";
import { getWindowsByRoom } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { EmptyState } from "@/components/ui/empty-state";
import { RiskBadge } from "@/components/ui/risk-badge";

type WindowStageKey = "pre" | "bracketed" | "installed";
type ImageOrientation = "portrait" | "landscape" | "square";
type GalleryItem = {
  key: string;
  stage: WindowStageKey;
  stageLabel: string;
  url: string;
  title: string;
  createdAt: string | null;
};

interface RoomWindowsViewProps {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
  roomId: string;
  /** When provided, renders an edit link per window (installer only). */
  getEditHref?: (windowId: string) => string;
  /** When provided, renders an "Add Window" CTA (installer only). */
  addWindowHref?: string;
}

const STAGE_META: Record<
  WindowStageKey,
  { itemStage: UnitStageMediaItem["stage"]; label: string }
> = {
  pre: { itemStage: "scheduled_bracketing", label: "Pre-bracketed" },
  bracketed: { itemStage: "bracketed_measured", label: "Bracketed" },
  installed: { itemStage: "installed_pending_approval", label: "Installed" },
};

export function RoomWindowsView({
  data,
  mediaItems,
  roomId,
  getEditHref,
  addWindowHref,
}: RoomWindowsViewProps) {
  const windowsList = getWindowsByRoom(data, roomId);
  const [selectedStageByWindow, setSelectedStageByWindow] = useState<
    Record<string, WindowStageKey>
  >({});
  const [imageOrientationByUrl, setImageOrientationByUrl] = useState<
    Record<string, ImageOrientation>
  >({});
  const [galleryWindowId, setGalleryWindowId] = useState<string | null>(null);

  const windowStageMediaMap = useMemo(() => {
    const map = new Map<string, Partial<Record<WindowStageKey, string>>>();
    for (const item of mediaItems) {
      if (!item.windowId) continue;
      const current = map.get(item.windowId) ?? {};
      if (item.stage === "scheduled_bracketing" && !current.pre) current.pre = item.publicUrl;
      if (item.stage === "bracketed_measured" && !current.bracketed) current.bracketed = item.publicUrl;
      if (item.stage === "installed_pending_approval" && !current.installed) {
        current.installed = item.publicUrl;
      }
      map.set(item.windowId, current);
    }
    return map;
  }, [mediaItems]);

  const windowGalleryMap = useMemo(() => {
    const map = new Map<string, GalleryItem[]>();

    for (const win of windowsList) {
      const items: GalleryItem[] = [];

      if (win.photoUrl) {
        items.push({
          key: `fallback-${win.id}`,
          stage: "pre",
          stageLabel: STAGE_META.pre.label,
          url: win.photoUrl,
          title: `${win.label} ${STAGE_META.pre.label}`,
          createdAt: null,
        });
      }

      const windowMedia = mediaItems
        .filter((item) => item.windowId === win.id)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      for (const item of windowMedia) {
        const stage =
          item.stage === "scheduled_bracketing"
            ? "pre"
            : item.stage === "bracketed_measured"
              ? "bracketed"
              : "installed";

        if (items.some((existing) => existing.url === item.publicUrl)) continue;

        items.push({
          key: item.id,
          stage,
          stageLabel: STAGE_META[stage].label,
          url: item.publicUrl,
          title: item.label?.trim() || `${win.label} ${STAGE_META[stage].label}`,
          createdAt: item.createdAt,
        });
      }

      map.set(win.id, items);
    }

    return map;
  }, [mediaItems, windowsList]);

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

  const galleryWindow = galleryWindowId
    ? windowsList.find((windowItem) => windowItem.id === galleryWindowId) ?? null
    : null;
  const galleryItems = galleryWindowId ? windowGalleryMap.get(galleryWindowId) ?? [] : [];

  if (windowsList.length === 0) {
    return (
      <EmptyState
        icon={Ruler}
        title="No windows yet"
        description="No windows have been added to this room yet."
        action={
          addWindowHref ? (
            <a
              href={addWindowHref}
              className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white"
            >
              Add First Window
            </a>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <div className="flex flex-col gap-3">
        <p className="text-[10px] font-bold text-muted uppercase tracking-wider">
          {windowsList.length} window{windowsList.length !== 1 ? "s" : ""}
        </p>

        {windowsList.map((win, i) => {
          const stageMedia = windowStageMediaMap.get(win.id) ?? {};
          const stageOptions: { key: WindowStageKey; label: string; url: string }[] = [];
          const preUrl = stageMedia.pre ?? win.photoUrl ?? "";
          if (preUrl) stageOptions.push({ key: "pre", label: STAGE_META.pre.label, url: preUrl });
          if (stageMedia.bracketed) {
            stageOptions.push({
              key: "bracketed",
              label: STAGE_META.bracketed.label,
              url: stageMedia.bracketed,
            });
          }
          if (stageMedia.installed) {
            stageOptions.push({
              key: "installed",
              label: STAGE_META.installed.label,
              url: stageMedia.installed,
            });
          }

          const galleryCount = windowGalleryMap.get(win.id)?.length ?? 0;
          const selectedStage =
            selectedStageByWindow[win.id] ??
            (stageOptions.find((o) => o.key === "pre")?.key ?? stageOptions[0]?.key ?? "pre");
          const selectedImageUrl =
            stageOptions.find((o) => o.key === selectedStage)?.url ??
            stageOptions[0]?.url ??
            null;

          const openGallery = () => {
            if (galleryCount > 0) setGalleryWindowId(win.id);
          };

          return (
            <motion.div
              key={win.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                role={galleryCount > 0 ? "button" : undefined}
                tabIndex={galleryCount > 0 ? 0 : undefined}
                onClick={openGallery}
                onKeyDown={(event) => {
                  if (galleryCount === 0) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openGallery();
                  }
                }}
                className={`rounded-2xl border border-border bg-white p-4 transition-all ${
                  galleryCount > 0
                    ? "cursor-pointer hover:border-zinc-300 hover:shadow-[var(--shadow-sm)]"
                    : ""
                }`}
              >
                {selectedImageUrl && (
                  <div
                    className={`mb-3 overflow-hidden rounded-xl border border-border bg-surface ${
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
                        const next: ImageOrientation =
                          img.naturalHeight > img.naturalWidth
                            ? "portrait"
                            : img.naturalHeight < img.naturalWidth
                              ? "landscape"
                              : "square";
                        setImageOrientationByUrl((cur) => {
                          if (cur[selectedImageUrl] === next) return cur;
                          return { ...cur, [selectedImageUrl]: next };
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
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedStageByWindow((cur) => ({ ...cur, [win.id]: option.key }));
                        }}
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

                <div className="mb-2.5 flex items-start justify-between">
                  <div>
                    <p className="text-sm font-bold tracking-tight text-foreground">{win.label}</p>
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

                {galleryCount > 0 && (
                  <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-accent/15 bg-accent/5 px-2.5 py-1 text-[11px] font-semibold text-accent">
                    <Images size={13} />
                    View all images ({galleryCount})
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
                    {galleryCount > 0 ? (
                      <CheckCircle size={14} weight="fill" className="text-accent" />
                    ) : (
                      "Required"
                    )}
                  </span>
                </div>

                {win.notes && (
                  <p className="mt-2 line-clamp-1 text-xs italic text-zinc-500">{win.notes}</p>
                )}

                {getEditHref && (
                  <div className="mt-3">
                    <a
                      href={getEditHref(win.id)}
                      onClick={(event) => event.stopPropagation()}
                      className="inline-flex items-center rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-foreground"
                    >
                      Edit Window
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {galleryWindow && (
          <>
            <motion.button
              type="button"
              aria-label="Close window image gallery"
              className="fixed inset-0 z-40 bg-zinc-950/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setGalleryWindowId(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-0 bottom-0 top-16 z-50 flex flex-col overflow-hidden rounded-t-[2rem] border border-border bg-white shadow-2xl sm:inset-6 sm:mx-auto sm:max-w-5xl sm:rounded-[2rem]"
            >
              <div className="flex items-center gap-3 border-b border-border px-5 py-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent/8 text-accent">
                  <Images size={22} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold tracking-tight text-foreground">
                    {galleryWindow.label} Images
                  </p>
                  <p className="text-xs text-muted">
                    Review every saved photo for this window across all stages.
                  </p>
                </div>
                <button
                  type="button"
                  aria-label="Close window image gallery"
                  onClick={() => setGalleryWindowId(null)}
                  className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white text-zinc-500 transition-colors hover:text-foreground"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-5">
                {galleryItems.length === 0 ? (
                  <div className="flex min-h-full flex-col items-center justify-center gap-3 rounded-[1.75rem] border border-dashed border-border bg-surface px-6 py-12 text-center">
                    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-400">
                      <Camera size={28} />
                    </div>
                    <p className="text-sm font-semibold text-foreground">No images saved yet</p>
                    <p className="max-w-sm text-sm leading-relaxed text-muted">
                      When bracketing, measured, or installed photos are uploaded for this window,
                      they will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-5 pb-3">
                    {(["pre", "bracketed", "installed"] as WindowStageKey[]).map((stage) => {
                      const stageItems = galleryItems.filter((item) => item.stage === stage);
                      if (stageItems.length === 0) return null;

                      return (
                        <section
                          key={stage}
                          className="overflow-hidden rounded-[1.75rem] border border-border bg-white"
                        >
                          <div className="border-b border-border bg-surface px-4 py-3.5">
                            <p className="text-sm font-bold text-foreground">
                              {STAGE_META[stage].label}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {stageItems.length} image{stageItems.length !== 1 ? "s" : ""} saved
                            </p>
                          </div>
                          <div className="grid grid-cols-2 gap-3 px-4 py-4 sm:grid-cols-3">
                            {stageItems.map((item) => (
                              <a
                                key={item.key}
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="group overflow-hidden rounded-2xl border border-border bg-surface transition-colors hover:border-zinc-300"
                              >
                                <div className="aspect-square overflow-hidden bg-zinc-100">
                                  <img
                                    src={item.url}
                                    alt={item.title}
                                    className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                  />
                                </div>
                                <div className="px-3 py-2.5">
                                  <p className="line-clamp-1 text-xs font-semibold text-foreground">
                                    {item.title}
                                  </p>
                                  <p className="mt-1 text-[11px] text-muted">
                                    {item.createdAt
                                      ? new Date(item.createdAt).toLocaleDateString("en-CA", {
                                          month: "short",
                                          day: "numeric",
                                          year: "numeric",
                                        })
                                      : "Existing window photo"}
                                  </p>
                                </div>
                              </a>
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
