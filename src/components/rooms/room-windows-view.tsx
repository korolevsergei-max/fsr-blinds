"use client";

import { useMemo, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  Camera,
  CaretLeft,
  CaretRight,
  ChatCircleText,
  Check,
  CheckCircle,
  Images,
  Ruler,
  Trash,
  WarningCircle,
} from "@phosphor-icons/react";
import { getWindowsByRoom } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { WindowPostInstallIssue } from "@/lib/types";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { EmptyState } from "@/components/ui/empty-state";
import { WindowStageNav } from "@/components/window-stage-nav";
import { ManufacturingSummaryCard } from "@/components/windows/manufacturing-summary-card";
import { getEscalationSurfaceClasses, getHighestEscalationRiskFlag } from "@/lib/window-issues";
import {
  addPostInstallIssueNote,
  openPostInstallIssue,
  resolvePostInstallIssue,
} from "@/app/actions/post-install-issue-actions";
import { refreshDataset } from "@/app/actions/dataset-queries";
import { useDatasetSelectorMaybe, useDatasetActionsMaybe } from "@/lib/dataset-context";
import { DeleteWindowModal } from "@/components/rooms/delete-window-modal";
import { FlagIssueModal } from "@/components/rooms/flag-issue-modal";
import { GalleryModal } from "@/components/rooms/gallery-modal";
import { STAGE_META, type GalleryItem, type WindowStageKey } from "@/components/rooms/gallery-shared";

function formatIssueTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1);
}
type ImageOrientation = "portrait" | "landscape" | "square";

interface RoomWindowsViewProps {
  data: Pick<AppDataset, "windows" | "rooms" | "units" | "postInstallIssues">;
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
  const router = useRouter();
  const datasetActions = useDatasetActionsMaybe();
  const currentRole = useDatasetSelectorMaybe((value) => value.user.role);
  const windowsList = getWindowsByRoom(data, roomId);
  const room = data.rooms.find((item) => item.id === roomId);
  const unit = room ? data.units.find((item) => item.id === room.unitId) : null;
  const canManagePostInstallIssues = currentRole === "owner" || currentRole === "scheduler";
  const issueLoaderKind = currentRole === "scheduler" ? "scheduler" : currentRole === "installer" ? "installer" : "full";
  const [imageOrientationByUrl, setImageOrientationByUrl] = useState<
    Record<string, ImageOrientation>
  >({});
  const [galleryWindowId, setGalleryWindowId] = useState<string | null>(null);
  const [issueWindowId, setIssueWindowId] = useState<string | null>(null);
  const [issueNote, setIssueNote] = useState("");
  const [noteDraftByIssueId, setNoteDraftByIssueId] = useState<Record<string, string>>({});
  const [resolveDraftByIssueId, setResolveDraftByIssueId] = useState<Record<string, string>>({});
  const [issueError, setIssueError] = useState<string | null>(null);
  const [photoIndexByWindowId, setPhotoIndexByWindowId] = useState<Record<string, number>>({});
  // User-selected active stage per window card (defaults to furthest-along stage)
  const [activeStageByWindowId, setActiveStageByWindowId] = useState<
    Record<string, "before" | "bracketed" | "installed">
  >({});
  const [confirmDeleteWindowId, setConfirmDeleteWindowId] = useState<string | null>(null);
  const [isPendingDelete, startDeleteTransition] = useTransition();
  const [isPendingIssueAction, startIssueTransition] = useTransition();

  const refreshIssueData = () =>
    refreshDataset(issueLoaderKind).then((freshData) => {
      if (freshData) datasetActions?.setData(freshData);
      router.refresh();
    });

  const handleConfirmDelete = () => {
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
  };

  const issueWindow = issueWindowId
    ? windowsList.find((windowItem) => windowItem.id === issueWindowId) ?? null
    : null;

  const issuesByWindowId = useMemo(() => {
    const map = new Map<string, WindowPostInstallIssue[]>();
    for (const issue of data.postInstallIssues ?? []) {
      const existing = map.get(issue.windowId) ?? [];
      existing.push(issue);
      map.set(issue.windowId, existing);
    }
    for (const issues of map.values()) {
      issues.sort((a, b) => {
        if (a.status !== b.status) return a.status === "open" ? -1 : 1;
        return b.openedAt.localeCompare(a.openedAt);
      });
    }
    return map;
  }, [data.postInstallIssues]);

  const handleOpenIssue = () => {
    if (!issueWindow || !unit) return;
    const body = issueNote.trim();
    if (!body) {
      setIssueError("Note is required.");
      return;
    }
    setIssueError(null);
    startIssueTransition(async () => {
      const result = await openPostInstallIssue({
        windowId: issueWindow.id,
        unitId: unit.id,
        body,
      });
      if (!result.ok) {
        setIssueError(result.error);
        return;
      }
      setIssueWindowId(null);
      setIssueNote("");
      await refreshIssueData();
    });
  };

  const handleAddIssueNote = (issueId: string) => {
    const body = noteDraftByIssueId[issueId]?.trim() ?? "";
    if (!body) return;
    setIssueError(null);
    startIssueTransition(async () => {
      const result = await addPostInstallIssueNote({ issueId, body });
      if (!result.ok) {
        setIssueError(result.error);
        return;
      }
      setNoteDraftByIssueId((prev) => ({ ...prev, [issueId]: "" }));
      await refreshIssueData();
    });
  };

  const handleResolveIssue = (issueId: string) => {
    const closingNote = resolveDraftByIssueId[issueId]?.trim() ?? "";
    setIssueError(null);
    startIssueTransition(async () => {
      const result = await resolvePostInstallIssue({ issueId, closingNote });
      if (!result.ok) {
        setIssueError(result.error);
        return;
      }
      setResolveDraftByIssueId((prev) => ({ ...prev, [issueId]: "" }));
      await refreshIssueData();
    });
  };

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
          const postInstallIssues = issuesByWindowId.get(win.id) ?? [];
          const openPostInstallIssues = postInstallIssues.filter((issue) => issue.status === "open");
          const escalationFlag = getHighestEscalationRiskFlag([win.riskFlag]);
          const cardTone = getEscalationSurfaceClasses(
            openPostInstallIssues.length > 0 ? "red" : escalationFlag,
            "card"
          );
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
            <div
              key={win.id}
              id={`window-${win.id}`}
              className="scroll-mt-24"
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
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <div className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1">
                        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-500">
                          Type
                        </span>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-700">
                          {win.blindType}
                        </span>
                      </div>
                      {openPostInstallIssues.length > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">
                          <WarningCircle size={12} weight="fill" />
                          Post-install issue
                        </span>
                      )}
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

                {win.installed && canManagePostInstallIssues && openPostInstallIssues.length === 0 && (
                  <div
                    className="mb-2"
                    onClick={(event) => event.stopPropagation()}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setIssueWindowId(win.id);
                        setIssueNote("");
                        setIssueError(null);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50"
                    >
                      <WarningCircle size={13} weight="bold" />
                      Flag post-install issue
                    </button>
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

                {activeNavStage === "before" && win.measured && (
                  <div
                    className="mt-3"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <ManufacturingSummaryCard
                      width={win.width}
                      height={win.height}
                      depth={win.depth}
                      windowInstallation={win.windowInstallation}
                      wandChain={win.wandChain}
                      fabricAdjustmentSide={win.fabricAdjustmentSide}
                      fabricAdjustmentInches={win.fabricAdjustmentInches}
                      blindType={win.blindType}
                      chainSide={win.chainSide}
                    />
                  </div>
                )}

                {postInstallIssues.length > 0 && (
                  <div
                    className="mt-3 rounded-2xl border border-red-100 bg-red-50/60 p-3"
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.stopPropagation()}
                  >
                    <div className="mb-2 flex items-center gap-2">
                      <ChatCircleText size={15} className="text-red-600" />
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-red-700">
                        Post-install issue thread
                      </p>
                    </div>
                    {issueError && (
                      <p className="mb-2 rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-700">
                        {issueError}
                      </p>
                    )}
                    <div className="flex flex-col gap-3">
                      {postInstallIssues.map((issue) => (
                        <div
                          key={issue.id}
                          className="rounded-xl border border-red-100 bg-white px-3 py-2.5"
                        >
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                issue.status === "open"
                                  ? "bg-red-100 text-red-700"
                                  : "bg-zinc-100 text-zinc-600"
                              }`}
                            >
                              {issue.status === "open" ? "Open" : "Resolved"}
                            </span>
                            <span className="text-[10px] text-zinc-400">
                              Opened {formatIssueTime(issue.openedAt)}
                            </span>
                          </div>
                          <div className="flex flex-col gap-2">
                            {issue.notes.map((note) => (
                              <div key={note.id} className="border-l-2 border-red-200 pl-2">
                                <p className="text-[12px] text-foreground">{note.body}</p>
                                <p className="mt-0.5 text-[10px] text-zinc-500">
                                  {note.authorName ?? roleLabel(note.authorRole)} ·{" "}
                                  {formatIssueTime(note.createdAt)}
                                </p>
                              </div>
                            ))}
                          </div>
                          {issue.status === "resolved" && issue.resolvedAt && (
                            <p className="mt-2 text-[10px] font-medium text-zinc-500">
                              Resolved by {issue.resolvedByName ?? "staff"} ·{" "}
                              {formatIssueTime(issue.resolvedAt)}
                            </p>
                          )}
                          {canManagePostInstallIssues && issue.status === "open" && (
                            <div className="mt-3 flex flex-col gap-2">
                              <textarea
                                value={noteDraftByIssueId[issue.id] ?? ""}
                                onChange={(event) =>
                                  setNoteDraftByIssueId((prev) => ({
                                    ...prev,
                                    [issue.id]: event.target.value,
                                  }))
                                }
                                placeholder="Add note"
                                rows={2}
                                className="w-full resize-none rounded-xl border border-border bg-white px-3 py-2 text-[12px] text-foreground outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  disabled={isPendingIssueAction || !(noteDraftByIssueId[issue.id] ?? "").trim()}
                                  onClick={() => handleAddIssueNote(issue.id)}
                                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-[12px] font-semibold text-foreground disabled:opacity-50"
                                >
                                  <ChatCircleText size={13} />
                                  Add note
                                </button>
                                <input
                                  value={resolveDraftByIssueId[issue.id] ?? ""}
                                  onChange={(event) =>
                                    setResolveDraftByIssueId((prev) => ({
                                      ...prev,
                                      [issue.id]: event.target.value,
                                    }))
                                  }
                                  placeholder="Closing note"
                                  className="min-w-0 flex-1 rounded-xl border border-border bg-white px-3 py-2 text-[12px] outline-none focus:border-red-300 focus:ring-2 focus:ring-red-100"
                                />
                                <button
                                  type="button"
                                  disabled={isPendingIssueAction}
                                  onClick={() => handleResolveIssue(issue.id)}
                                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-600 px-3 py-2 text-[12px] font-semibold text-white disabled:opacity-50"
                                >
                                  <Check size={13} weight="bold" />
                                  Resolve
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
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
            </div>
          );
        })}
      </div>

      <DeleteWindowModal
        open={Boolean(confirmDeleteWindowId)}
        pending={isPendingDelete}
        onCancel={() => setConfirmDeleteWindowId(null)}
        onConfirm={handleConfirmDelete}
      />

      <FlagIssueModal
        issueWindow={issueWindow}
        unit={unit ?? null}
        room={room ?? null}
        note={issueNote}
        error={issueError}
        pending={isPendingIssueAction}
        onNoteChange={(value) => {
          setIssueNote(value);
          setIssueError(null);
        }}
        onCancel={() => setIssueWindowId(null)}
        onSubmit={handleOpenIssue}
      />

      <GalleryModal
        galleryWindow={galleryWindow}
        items={galleryItems}
        onClose={() => setGalleryWindowId(null)}
      />
    </>
  );
}
