"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, CaretLeft, CaretRight, CheckCircle, Images, Ruler, Trash, User, X } from "@phosphor-icons/react";
import { getWindowsByRoom } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { EmptyState } from "@/components/ui/empty-state";
import { WindowStageNav } from "@/components/window-stage-nav";
import { getEscalationSurfaceClasses, getHighestEscalationRiskFlag } from "@/lib/window-issues";

type WindowStageKey = "pre" | "bracketed" | "installed";

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
type ImageOrientation = "portrait" | "landscape" | "square";
type GalleryItem = {
  key: string;
  stage: WindowStageKey;
  stageLabel: string;
  url: string;
  title: string;
  createdAt: string | null;
  uploadedByName: string | null;
  uploadedByRole: string | null;
};

interface RoomWindowsViewProps {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
  roomId: string;
  /**
   * When provided, stage tabs become non-navigating buttons and a stage-aware
   * Edit button is shown. Props are used to build edit page URLs per stage.
   */
  getStageNavProps?: (windowId: string) => {
    unitId: string;
    roomId: string;
    windowId: string;
    routeBasePath?: "/installer/units" | "/management/units" | "/scheduler/units";
  };
  /** When provided, renders an "Add Window" CTA. */
  addWindowHref?: string;
  /** When provided, renders a Delete button per window with confirmation. */
  onDeleteWindow?: (windowId: string) => Promise<void>;
  isManufacturedComplete?: boolean;
  /** Window IDs that have been individually QC-approved. Takes precedence over isManufacturedComplete for per-window Built status. */
  manufacturedWindowIds?: string[];
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
  getStageNavProps,
  addWindowHref,
  onDeleteWindow,
  isManufacturedComplete = false,
  manufacturedWindowIds,
}: RoomWindowsViewProps) {
  const windowsList = getWindowsByRoom(data, roomId);
  const [imageOrientationByUrl, setImageOrientationByUrl] = useState<
    Record<string, ImageOrientation>
  >({});
  const [galleryWindowId, setGalleryWindowId] = useState<string | null>(null);
  const [photoIndexByWindowId, setPhotoIndexByWindowId] = useState<Record<string, number>>({});
  // User-selected active stage per window card (defaults to furthest-along stage)
  const [activeStageByWindowId, setActiveStageByWindowId] = useState<
    Record<string, "before" | "bracketed" | "installed">
  >({});
  const [confirmDeleteWindowId, setConfirmDeleteWindowId] = useState<string | null>(null);
  const [isPendingDelete, startDeleteTransition] = useTransition();

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

  const windowMediaByWindowId = useMemo(() => {
    const map = new Map<string, UnitStageMediaItem[]>();
    for (const item of mediaItems) {
      if (!item.windowId) continue;
      const existing = map.get(item.windowId) ?? [];
      existing.push(item);
      map.set(item.windowId, existing);
    }
    for (const items of map.values()) {
      items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
          uploadedByName: null,
          uploadedByRole: null,
        });
      }

      const windowMedia = windowMediaByWindowId.get(win.id) ?? [];

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
          uploadedByName: item.uploadedByName ?? null,
          uploadedByRole: item.uploadedByRole ?? null,
        });
      }

      map.set(win.id, items);
    }

    return map;
  }, [windowMediaByWindowId, windowsList]);

  const postBracketingWindowIds = useMemo(
    () =>
      new Set(
        mediaItems
          .filter(
            (item) =>
              item.roomId === roomId &&
              item.stage === "bracketed_measured" &&
              item.uploadKind === "window_measure" &&
              item.windowId
          )
          .map((item) => item.windowId as string)
      ),
    [mediaItems, roomId]
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
            <Link
              href={addWindowHref}
              className="inline-flex items-center rounded-lg bg-accent px-3 py-2 text-[13px] font-semibold text-white"
            >
              Add First Window
            </Link>
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
          const escalationFlag = getHighestEscalationRiskFlag([win.riskFlag]);
          const cardTone = getEscalationSurfaceClasses(escalationFlag, "card");

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
          // Default to furthest-along stage; user can tap a pill to switch
          const defaultStage: "before" | "bracketed" | "installed" = win.installed
            ? "installed"
            : win.bracketed
              ? "bracketed"
              : "before";
          const activeNavStage = activeStageByWindowId[win.id] ?? defaultStage;
          const activeStageKey: WindowStageKey =
            activeNavStage === "before" ? "pre" : activeNavStage;

          // Collect all photos for the active stage (newest first from media, legacy photoUrl appended for "pre")
          const activeStageItemStage = STAGE_META[activeStageKey].itemStage;
          const activeStageMediaPhotos = (windowMediaByWindowId.get(win.id) ?? []).filter(
            (item) => item.stage === activeStageItemStage
          );
          const activeStagePhotoUrls: string[] =
            activeStageKey === "pre" &&
            win.photoUrl &&
            !activeStageMediaPhotos.some((p) => p.publicUrl === win.photoUrl)
              ? [...activeStageMediaPhotos.map((p) => p.publicUrl), win.photoUrl]
              : activeStageMediaPhotos.map((p) => p.publicUrl);

          const photoCount = activeStagePhotoUrls.length;
          const photoIndex = Math.min(
            photoIndexByWindowId[win.id] ?? 0,
            Math.max(0, photoCount - 1)
          );
          const selectedImageUrl = activeStagePhotoUrls[photoIndex] ?? null;

          const openGallery = () => {
            if (galleryCount > 0) setGalleryWindowId(win.id);
          };

          return (
            <motion.div
              key={win.id}
              initial={false}
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
                className={`rounded-2xl border p-4 transition-all ${
                  cardTone
                } ${
                  galleryCount > 0
                    ? "cursor-pointer hover:border-zinc-300 hover:shadow-[var(--shadow-sm)]"
                    : ""
                }`}
              >
                {getStageNavProps && (
                  <div
                    className="mb-3"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <WindowStageNav
                      {...getStageNavProps(win.id)}
                      isMeasured={win.measured}
                      isBracketed={win.bracketed}
                      isManufactured={
                        manufacturedWindowIds
                          ? manufacturedWindowIds.includes(win.id)
                          : isManufacturedComplete
                      }
                      isInstalled={win.installed}
                      active={activeNavStage}
                      compact
                      onStageSelect={(stage) => {
                        setActiveStageByWindowId((prev) => ({ ...prev, [win.id]: stage }));
                        setPhotoIndexByWindowId((prev) => ({ ...prev, [win.id]: 0 }));
                      }}
                    />
                  </div>
                )}

                {selectedImageUrl && (
                  <div className="mb-3">
                    <div className="flex items-center gap-2">
                      {/* Left arrow — always occupies space to prevent image width shift */}
                      {photoCount > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhotoIndexByWindowId((prev) => ({
                              ...prev,
                              [win.id]: photoIndex - 1,
                            }));
                          }}
                          disabled={photoIndex === 0}
                          className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white shadow-sm text-zinc-700 disabled:opacity-20 active:scale-95 transition-transform"
                          aria-label="Previous photo"
                        >
                          <CaretLeft size={18} weight="bold" />
                        </button>
                      )}

                      <div
                        className={`flex-1 overflow-hidden rounded-xl border border-border bg-surface ${
                          imageOrientationByUrl[selectedImageUrl] === "portrait"
                            ? "flex justify-center"
                            : ""
                        }`}
                      >
                        <Image
                          src={selectedImageUrl}
                          alt={`${win.label} photo`}
                          width={800}
                          height={600}
                          sizes="(max-width: 640px) 100vw, 560px"
                          unoptimized={selectedImageUrl.startsWith("blob:")}
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
                          className={`w-full bg-surface h-auto ${
                            imageOrientationByUrl[selectedImageUrl] === "portrait"
                              ? "max-h-[28rem] object-contain"
                              : imageOrientationByUrl[selectedImageUrl] === "square"
                                ? "aspect-square object-cover"
                                : "aspect-[16/9] object-cover"
                          }`}
                        />
                      </div>

                      {/* Right arrow */}
                      {photoCount > 1 && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPhotoIndexByWindowId((prev) => ({
                              ...prev,
                              [win.id]: photoIndex + 1,
                            }));
                          }}
                          disabled={photoIndex === photoCount - 1}
                          className="flex-shrink-0 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-white shadow-sm text-zinc-700 disabled:opacity-20 active:scale-95 transition-transform"
                          aria-label="Next photo"
                        >
                          <CaretRight size={18} weight="bold" />
                        </button>
                      )}
                    </div>

                    {photoCount > 1 && (
                      <p className="mt-1.5 text-center text-[11px] font-semibold text-zinc-400">
                        {photoIndex + 1} of {photoCount}
                      </p>
                    )}
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
                </div>

                {postBracketingWindowIds.has(win.id) && !stageMedia.installed && (
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
                  <p className="mt-2 text-xs italic text-zinc-500">{win.notes}</p>
                )}

                {(getStageNavProps || onDeleteWindow) && (
                  <div
                    className="mt-4 flex items-center justify-center gap-2"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    {getStageNavProps && (() => {
                      const navProps = getStageNavProps(win.id);
                      const base = navProps.routeBasePath ?? "/installer/units";
                      const editHref =
                        activeNavStage === "bracketed"
                          ? `${base}/${navProps.unitId}/rooms/${navProps.roomId}/windows/${navProps.windowId}/bracketing`
                          : activeNavStage === "installed"
                            ? `${base}/${navProps.unitId}/rooms/${navProps.roomId}/windows/${navProps.windowId}/installed`
                            : `${base}/${navProps.unitId}/rooms/${navProps.roomId}/windows/new?edit=${navProps.windowId}`;
                      return (
                        <Link
                          href={editHref}
                          className="inline-flex flex-1 items-center justify-center rounded-xl border border-border bg-surface px-6 py-2.5 text-sm font-semibold text-foreground"
                        >
                          Edit
                        </Link>
                      );
                    })()}
                    {onDeleteWindow && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteWindowId(win.id)}
                        className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-600 transition-colors hover:bg-red-100"
                        aria-label="Delete window"
                      >
                        <Trash size={16} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {confirmDeleteWindowId && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-zinc-950/45"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmDeleteWindowId(null)}
            />
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-4 bottom-1/3 z-50 overflow-hidden rounded-2xl border border-border bg-white shadow-2xl sm:inset-x-auto sm:mx-auto sm:w-full sm:max-w-sm"
            >
              <div className="p-5">
                <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-red-50 text-red-500">
                  <Trash size={22} />
                </div>
                <p className="text-sm font-bold text-foreground">Delete window?</p>
                <p className="mt-1 text-xs text-muted">
                  This will permanently delete the window and all its photos. This cannot be undone.
                </p>
              </div>
              <div className="flex border-t border-border">
                <button
                  type="button"
                  className="flex-1 py-3.5 text-sm font-semibold text-muted"
                  onClick={() => setConfirmDeleteWindowId(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isPendingDelete}
                  className="flex-1 border-l border-border py-3.5 text-sm font-semibold text-red-600 disabled:opacity-50"
                  onClick={() => {
                    if (!onDeleteWindow || !confirmDeleteWindowId) return;
                    const idToDelete = confirmDeleteWindowId;
                    setConfirmDeleteWindowId(null);
                    startDeleteTransition(async () => {
                      try {
                        await onDeleteWindow(idToDelete);
                      } catch (error) {
                        const message =
                          error instanceof Error
                            ? error.message
                            : "Failed to delete the window.";
                        window.alert(message);
                      }
                    });
                  }}
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

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
                                <div className="relative aspect-square overflow-hidden bg-zinc-100">
                                  <Image
                                    src={item.url}
                                    alt={item.title}
                                    fill
                                    sizes="(max-width: 640px) 50vw, 240px"
                                    unoptimized={item.url.startsWith("blob:")}
                                    className="object-cover transition-transform duration-200 group-hover:scale-[1.02]"
                                  />
                                  {/* Uploader overlay */}
                                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6 pointer-events-none">
                                    <p className="flex items-center gap-1 text-[10px] font-medium text-white/90 leading-tight">
                                      <User size={10} />
                                      {item.uploadedByName ?? "Unknown"}
                                      {item.uploadedByRole && (
                                        <span className="capitalize opacity-70">
                                          · {item.uploadedByRole}
                                        </span>
                                      )}
                                    </p>
                                    <p className="text-[10px] text-white/60 mt-0.5">
                                      {item.createdAt
                                        ? formatRelativeTime(item.createdAt)
                                        : "Existing photo"}
                                    </p>
                                  </div>
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
