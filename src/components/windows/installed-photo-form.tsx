"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { Camera, CheckCircle, Plus, Trash, UploadSimple, User } from "@phosphor-icons/react";
import {
  uploadWindowInstalledPhoto,
  deleteWindowStagePhoto,
  undoWindowStage,
} from "@/app/actions/fsr-data";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitMilestoneCoverage } from "@/lib/unit-milestones";
import type { UnitStageMediaItem } from "@/lib/server-data";
import type { RiskFlag } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { WindowStageNav } from "@/components/window-stage-nav";
import { WindowRiskNotesFields } from "@/components/windows/window-risk-notes-fields";
import { compressImageForUpload, validateUploadImage } from "@/lib/image-upload";
import { PhotoSourcePicker } from "@/components/ui/photo-source-picker";
import { useAppDatasetMaybe } from "@/lib/dataset-context";
import { reconcileUnitDerivedState } from "@/lib/unit-status-helpers";
import {
  removeUnitStageMediaItem,
  upsertUnitStageMediaItem,
} from "@/lib/use-unit-supplemental";

const MAX_PHOTOS = 3;

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

export function InstalledPhotoForm({
  data,
  mediaItems,
  milestones,
  routeBasePath = "/installer/units",
}: {
  data?: AppDataset;
  mediaItems: UnitStageMediaItem[];
  milestones: UnitMilestoneCoverage;
  routeBasePath?: "/installer/units" | "/scheduler/units" | "/management/units";
}) {
  const { id, roomId, windowId } = useParams<{
    id: string;
    roomId: string;
    windowId: string;
  }>();
  const router = useRouter();
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const datasetCtx = useAppDatasetMaybe();
  const datasetData = data ?? datasetCtx?.data;
  const initialWindowItem = datasetData?.windows.find(
    (w) => w.id === windowId && w.roomId === roomId
  );

  // All existing photos for this window/stage, newest first.
  const existingPhotos = mediaItems
    .filter(
      (item) =>
        item.windowId === windowId &&
        item.stage === "installed_pending_approval" &&
        item.uploadKind === "window_measure"
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [stagedPreview, setStagedPreview] = useState<string | null>(null);
  const [riskFlag, setRiskFlag] = useState<RiskFlag>(initialWindowItem?.riskFlag ?? "green");
  const [notes, setNotes] = useState(initialWindowItem?.notes ?? "");
  const [notesError, setNotesError] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [optimizingPhoto, setOptimizingPhoto] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const [confirmOverrideOpen, setConfirmOverrideOpen] = useState(false);

  if (!datasetData) {
    return <div className="p-6 text-center text-muted">Window not found</div>;
  }

  const unit = datasetData.units.find((u) => u.id === id);
  const room = datasetData.rooms.find((r) => r.id === roomId);
  const windowItem = datasetData.windows.find((w) => w.id === windowId && w.roomId === roomId);

  if (!unit || !room || !windowItem) {
    return <div className="p-6 text-center text-muted">Window not found</div>;
  }

  const isBracketingOverride =
    existingPhotos.length === 0 && windowItem.measured && !windowItem.bracketed;

  const installPhotosBlocked =
    existingPhotos.length === 0 &&
    !(windowItem.measured && windowItem.bracketed) &&
    !isBracketingOverride;

  const canAddMore = existingPhotos.length < MAX_PHOTOS && !stagedFile;
  const atLimit = existingPhotos.length >= MAX_PHOTOS && !stagedFile;

  const onFileChange = (file: File | null) => {
    setError("");
    if (file) {
      const validationError = validateUploadImage(file);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    setStagedFile(file);
    setStagedPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : null;
    });
  };

  const onDeleteExisting = async (photo: UnitStageMediaItem) => {
    setDeletingId(photo.id);
    try {
      const result = await deleteWindowStagePhoto(photo.id, unit.id);
      if (result.ok) {
        removeUnitStageMediaItem(unit.id, photo.id);
        datasetCtx?.patchData((prev) =>
          reconcileUnitDerivedState(prev, unit.id, { photoDelta: -1 })
        );
      } else {
        setError(result.error ?? "Failed to delete photo.");
      }
    } finally {
      setDeletingId(null);
    }
  };

  const onSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setError("");
    setNotesError("");

    if (installPhotosBlocked) {
      setError(
        "Measurements and bracketing must be completed for this window before installation can be marked complete."
      );
      return;
    }

    const isGreen = riskFlag === "green";
    if (!isGreen && !stagedFile && existingPhotos.length === 0) {
      setError("Installed photo is required for yellow or red risk.");
      return;
    }
    if ((riskFlag === "yellow" || riskFlag === "red") && !notes.trim()) {
      setNotesError("Notes are required for yellow or red risk.");
      return;
    }

    if (isBracketingOverride) {
      setConfirmOverrideOpen(true);
      return;
    }

    doSubmit(false);
  };

  const doSubmit = (overrideBracketing: boolean) => {
    startTransition(async () => {
      try {
        let compressedPhoto: File | null = null;
        if (stagedFile) {
          const validationError = validateUploadImage(stagedFile);
          if (validationError) {
            setError(validationError);
            return;
          }
          setOptimizingPhoto(true);
          try {
            compressedPhoto = await compressImageForUpload(stagedFile);
          } finally {
            setOptimizingPhoto(false);
          }
        }
        const fd = new FormData();
        fd.set("unitId", unit.id);
        fd.set("roomId", room.id);
        fd.set("windowId", windowItem.id);
        if (compressedPhoto) fd.set("photo", compressedPhoto, compressedPhoto.name);
        fd.set("riskFlag", riskFlag);
        fd.set("notes", notes);
        if (overrideBracketing) fd.set("overrideBracketing", "true");

        const result = await uploadWindowInstalledPhoto(fd);
        if (!result.ok) {
          setError(result.error ?? "Failed to save. Please try again.");
          return;
        }

        datasetCtx?.patchData((prev) =>
          reconcileUnitDerivedState(
            {
              ...prev,
              windows: prev.windows.map((w) =>
                w.id === windowItem.id
                  ? {
                      ...w,
                      installed: true,
                      ...(overrideBracketing ? { bracketed: true } : {}),
                      riskFlag,
                      notes: notes.trim(),
                    }
                  : w
              ),
            },
            unit.id,
            {
              unitStatus: result.unitStatus,
              photoDelta: result.photoCountDelta ?? 0,
            }
          )
        );

        if (result.mediaId && result.photoUrl) {
          upsertUnitStageMediaItem(unit.id, {
            id: result.mediaId,
            publicUrl: result.photoUrl,
            label: `${windowItem.label} — Installed`,
            unitId: unit.id,
            roomId: room.id,
            roomName: room.name,
            windowId: windowItem.id,
            windowLabel: windowItem.label,
            uploadKind: "window_measure",
            stage: "installed_pending_approval",
            createdAt: new Date().toISOString(),
            uploadedByUserId: null,
            uploadedByName: null,
            uploadedByRole: null,
          });
        }

        router.push(`${routeBasePath}/${id}/rooms/${roomId}`);
      } catch {
        setError("Something went wrong. Please try again.");
        setOptimizingPhoto(false);
      }
    });
  };

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <PageHeader
        title="Installed Photo"
        subtitle={`${windowItem.label} • ${room.name}`}
        backHref={`${routeBasePath}/${id}/rooms/${roomId}`}
      />

      <form onSubmit={onSubmit} className="flex flex-1 flex-col gap-6 px-5 py-5">
        <WindowStageNav
          unitId={id}
          roomId={roomId}
          windowId={windowItem.id}
          isMeasured={windowItem.measured}
          isBracketed={windowItem.bracketed}
          isManufactured={milestones.allManufactured}
          isInstalled={windowItem.installed}
          active="installed"
          routeBasePath={routeBasePath}
        />

        <PhotoSourcePicker
          open={photoPickerOpen}
          onClose={() => setPhotoPickerOpen(false)}
          onChange={(files) => onFileChange(files?.[0] ?? null)}
        />

        <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-[11px] text-zinc-500 leading-relaxed">
          <p className="font-bold text-zinc-700 mb-1 flex items-center gap-1.5">
            <UploadSimple size={14} weight="bold" />
            Installation Step
          </p>
          Confirm that the blind is installed correctly. A photo is{" "}
          {riskFlag === "green" ? (
            <span className="font-bold text-emerald-600">optional</span>
          ) : (
            <span className="font-bold text-amber-600 underline">required</span>
          )}{" "}
          for this window based on its status.
          {!milestones.allManufactured && (
            <span className="block mt-2">
              Manufacturing QC is tracked separately. Installation can still be completed here when
              this window is ready.
            </span>
          )}
        </div>

        {installPhotosBlocked && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-zinc-700 leading-snug">
            <p className="font-bold text-amber-900 mb-1">Pre-requisites Pending</p>
            Measurements and bracketing must be completed for this window before marking installation
            as complete.
          </div>
        )}

        {isBracketingOverride && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-zinc-700 leading-snug">
            <p className="font-bold text-blue-900 mb-1">Bracketing Incomplete</p>
            You can still mark installation as complete — you&apos;ll be asked to confirm that
            bracketing was also done.
          </div>
        )}

        {error && (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </p>
        )}

        {/* Photo grid */}
        <div>
          <h2 className="mb-1 text-[10px] font-bold uppercase tracking-[0.12em] text-muted flex items-center justify-between">
            <span>
              Installed Photos
              {riskFlag !== "green" && <span className="ml-1 text-red-500">*</span>}
            </span>
            <span className="font-normal normal-case text-zinc-400">
              {existingPhotos.length + (stagedFile ? 1 : 0)}/{MAX_PHOTOS}
            </span>
          </h2>
          <p className="text-[11px] text-zinc-400 mb-3">
            {riskFlag === "green"
              ? "Optional for green status windows."
              : "Required for yellow or red risk indicators."}
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Existing saved photos */}
            {existingPhotos.map((photo) => (
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
                {/* Uploader overlay */}
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
                {/* Delete button */}
                <button
                  type="button"
                  disabled={deletingId === photo.id}
                  onClick={() => onDeleteExisting(photo)}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm transition-opacity hover:bg-black/70 disabled:opacity-40"
                >
                  {deletingId === photo.id ? (
                    <span className="h-3 w-3 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                  ) : (
                    <Trash size={13} weight="bold" />
                  )}
                </button>
              </div>
            ))}

            {/* Staged (new) photo preview */}
            {stagedFile && stagedPreview && (
              <div className="relative aspect-square overflow-hidden rounded-2xl border-2 border-dashed border-emerald-400 bg-zinc-100">
                <Image
                  src={stagedPreview}
                  alt="New photo"
                  fill
                  sizes="(max-width: 640px) 50vw, 280px"
                  unoptimized
                  className="object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-4 pointer-events-none">
                  <p className="text-[10px] font-semibold text-emerald-300">Ready to save</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setStagedFile(null);
                    setStagedPreview((prev) => {
                      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                      return null;
                    });
                  }}
                  className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
                >
                  <Trash size={13} weight="bold" />
                </button>
              </div>
            )}

            {/* Add photo tile */}
            {canAddMore && !installPhotosBlocked && existingPhotos.length > 0 && (
              <button
                type="button"
                onClick={() => setPhotoPickerOpen(true)}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 transition-all active:scale-[0.97] hover:bg-zinc-100/60"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-zinc-200 shadow-sm">
                  <Plus size={20} className="text-zinc-500" />
                </div>
                <span className="text-[11px] font-semibold text-zinc-500">Add Photo</span>
              </button>
            )}

            {/* Empty state */}
            {existingPhotos.length === 0 && !stagedFile && (
              <button
                type="button"
                disabled={installPhotosBlocked}
                onClick={() => setPhotoPickerOpen(true)}
                className="col-span-2 flex h-40 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 transition-all active:scale-[0.98] hover:bg-zinc-100/50 disabled:opacity-50 disabled:pointer-events-none"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white border border-zinc-200 shadow-sm">
                  <Camera size={24} className="text-zinc-500" />
                </div>
                <div className="text-center">
                  <span className="block text-sm font-bold text-zinc-700">Take Installed Photo</span>
                  <span className="block text-[11px] text-zinc-500 uppercase tracking-wider mt-0.5">
                    Optional for green
                  </span>
                </div>
              </button>
            )}

            {atLimit && (
              <p className="col-span-2 text-center text-[11px] text-zinc-400 italic py-2">
                Maximum {MAX_PHOTOS} photos per stage reached.
              </p>
            )}
          </div>
        </div>

        <div>
          <WindowRiskNotesFields
            riskFlag={riskFlag}
            notes={notes}
            notesError={notesError}
            onRiskFlagChange={setRiskFlag}
            onNotesChange={(value) => {
              setNotes(value);
              if (notesError) setNotesError("");
            }}
          />
        </div>

        <div className="pb-24 pt-4 flex flex-col gap-3">
          <Button
            type="submit"
            fullWidth
            size="lg"
            disabled={pending || optimizingPhoto || installPhotosBlocked}
            className={
              !stagedFile && existingPhotos.length === 0 && !installPhotosBlocked
                ? "bg-emerald-600 hover:bg-emerald-700 shadow-md"
                : ""
            }
          >
            {optimizingPhoto ? (
              "Optimizing photo…"
            ) : pending ? (
              "Saving…"
            ) : stagedFile ? (
              <>
                <UploadSimple size={20} weight="bold" />
                Add Photo
              </>
            ) : existingPhotos.length === 0 ? (
              <>
                <CheckCircle size={20} weight="bold" />
                Mark Installation as Complete
              </>
            ) : (
              <>
                <CheckCircle size={20} weight="bold" />
                Save
              </>
            )}
          </Button>
          {!stagedFile && existingPhotos.length === 0 && !installPhotosBlocked && riskFlag === "green" && (
            <p className="text-center text-[11px] text-zinc-400 mt-3 italic">
              You can complete this stage without a photo for green status windows.
            </p>
          )}
          {windowItem.installed && (
            <button
              type="button"
              disabled={pending || undoing}
              onClick={async () => {
                if (
                  !window.confirm(
                    "Undo Installed? Measured and Bracketed will remain complete."
                  )
                )
                  return;
                setUndoing(true);
                try {
                  const result = await undoWindowStage(windowItem.id, "installed");
                  if (result.ok) {
                    datasetCtx?.patchData((prev) =>
                      reconcileUnitDerivedState(
                        {
                          ...prev,
                          windows: prev.windows.map((w) =>
                            w.id === windowItem.id ? { ...w, installed: false } : w
                          ),
                        },
                        unit.id,
                        { unitStatus: result.unitStatus }
                      )
                    );
                  } else {
                    alert(`Failed to undo: ${result.error}`);
                  }
                } finally {
                  setUndoing(false);
                }
              }}
              className="w-full rounded-2xl border border-border py-3 text-sm font-semibold text-zinc-500 hover:text-foreground transition-colors disabled:opacity-50"
            >
              {undoing ? "Undoing…" : "Undo Installed"}
            </button>
          )}
        </div>
      </form>

      {/* Bracketing override confirmation dialog */}
      {confirmOverrideOpen && (
        <>
          <div
            className="fixed inset-0 z-[55] bg-zinc-950/45"
            onClick={() => setConfirmOverrideOpen(false)}
          />
          <div className="fixed inset-x-4 top-1/2 z-[60] -translate-y-1/2 rounded-3xl border border-border bg-white shadow-2xl max-w-lg mx-auto p-6 flex flex-col gap-4">
            <div>
              <p className="text-base font-bold text-foreground">
                Confirm Bracketing &amp; Installation
              </p>
              <p className="mt-1.5 text-sm text-zinc-500 leading-relaxed">
                Are you confirming that you completed{" "}
                <span className="font-semibold text-foreground">bracketing and installation</span>{" "}
                for this window at the same time?
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                fullWidth
                size="lg"
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  setConfirmOverrideOpen(false);
                  doSubmit(true);
                }}
              >
                <CheckCircle size={20} weight="bold" />
                Yes, Mark Both as Complete
              </Button>
              <button
                type="button"
                onClick={() => setConfirmOverrideOpen(false)}
                className="w-full rounded-2xl border border-border py-3 text-sm font-semibold text-zinc-500 hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
