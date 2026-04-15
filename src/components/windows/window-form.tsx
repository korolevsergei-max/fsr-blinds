"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Camera,
  CheckCircle,
  ClockCounterClockwise,
  Plus,
  Trash,
  UploadSimple,
  User,
} from "@phosphor-icons/react";
import {
  createWindowWithPhoto,
  deleteWindow,
  deleteWindowMeasurementPhoto,
  deleteWindowStagePhoto,
  undoWindowStage,
  updateWindowWithOptionalPhoto,
} from "@/app/actions/fsr-data";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitMilestoneCoverage } from "@/lib/unit-milestones";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { type BlindType, type ChainSide, type RiskFlag, type UnitActivityLog } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WindowStageNav } from "@/components/window-stage-nav";
import { WindowRiskNotesFields } from "@/components/windows/window-risk-notes-fields";
import { compressImageForUpload, validateUploadImage } from "@/lib/image-upload";
import { useAppDatasetMaybe } from "@/lib/dataset-context";
import { PhotoSourcePicker } from "@/components/ui/photo-source-picker";
import { reconcileUnitDerivedState } from "@/lib/unit-status-helpers";
import { removeUnitStageMediaItem } from "@/lib/use-unit-supplemental";

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

function formatActivityDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildWindowActivityDescription(log: UnitActivityLog): string {
  const details = log.details ?? {};
  if (log.action === "window_created") {
    const w = details.width != null ? details.width : null;
    const h = details.height != null ? details.height : null;
    const d = details.depth != null ? details.depth : null;
    const measurementParts = [
      w != null ? `W: ${w}"` : null,
      h != null ? `H: ${h}"` : null,
      d != null ? `D: ${d}"` : null,
    ].filter(Boolean);
    const measurementStr = measurementParts.length > 0
      ? `Measurements set (${measurementParts.join(", ")}).`
      : "Window created.";
    const photoStr = details.hasPhoto ? " Photo uploaded." : " No photo uploaded.";
    return measurementStr + photoStr;
  }
  if (log.action === "window_updated") {
    return details.replacedPhoto
      ? "Window details updated and photo replaced."
      : "Window details updated.";
  }
  if (log.action === "post_bracketing_photo_added") {
    return "Post-bracketing photo uploaded.";
  }
  if (log.action === "installed_photo_added") {
    return "Installed photo uploaded.";
  }
  return "Window activity recorded.";
}

export function WindowForm({
  data,
  activityLog,
  mediaItems = [],
  milestones,
  routeBasePath = "/installer/units",
}: {
  data?: AppDataset;
  activityLog: UnitActivityLog[];
  mediaItems?: UnitStageMediaItem[];
  milestones: UnitMilestoneCoverage;
  routeBasePath?: "/installer/units" | "/scheduler/units" | "/management/units";
}) {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const datasetCtx = useAppDatasetMaybe();
  const datasetData = data ?? datasetCtx?.data;
  const editId = searchParams.get("edit");
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);

  const unit = datasetData?.units.find((u) => u.id === id);
  const room = datasetData?.rooms.find((r) => r.id === roomId);
  const existingWindow = editId
    ? datasetData?.windows.find((w) => w.id === editId && w.roomId === roomId)
    : undefined;
  const windowHistory = existingWindow
    ? activityLog.filter((log) => {
        const details = log.details as Record<string, unknown> | null;
        return (
          log.action === "window_created" ||
          log.action === "window_updated" ||
          log.action === "post_bracketing_photo_added"
        ) && details?.windowId === existingWindow.id;
      })
    : [];

  const [label, setLabel] = useState(existingWindow?.label ?? "");
  const [blindType, setBlindType] = useState<BlindType>(
    existingWindow?.blindType ?? "screen"
  );
  const [chainSide, setChainSide] = useState<ChainSide | null>(
    existingWindow?.chainSide ?? null
  );
  const [riskFlag, setRiskFlag] = useState<RiskFlag>(
    existingWindow?.riskFlag ?? "green"
  );
  const [width, setWidth] = useState(
    existingWindow?.width != null ? String(existingWindow.width) : ""
  );
  const [height, setHeight] = useState(
    existingWindow?.height != null ? String(existingWindow.height) : ""
  );
  const [depth, setDepth] = useState(
    existingWindow?.depth != null ? String(existingWindow.depth) : ""
  );
  const [blindWidth, setBlindWidth] = useState(
    existingWindow?.blindWidth != null ? String(existingWindow.blindWidth) : ""
  );
  const [blindHeight, setBlindHeight] = useState(
    existingWindow?.blindHeight != null ? String(existingWindow.blindHeight) : ""
  );
  const [blindDepth, setBlindDepth] = useState(
    existingWindow?.blindDepth != null ? String(existingWindow.blindDepth) : ""
  );
  const [notes, setNotes] = useState(existingWindow?.notes ?? "");
  const [photoPreview, setPhotoPreview] = useState<string | null>(
    existingWindow?.photoUrl ?? null
  );
  const [photoOrientation, setPhotoOrientation] = useState<
    "portrait" | "landscape" | "square"
  >("landscape");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [pending, startTransition] = useTransition();
  const [optimizingPhoto, setOptimizingPhoto] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingMediaId, setDeletingMediaId] = useState<string | null>(null);
  const [undoing, setUndoing] = useState(false);
  const saveErrorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const addAnotherRef = useRef(false);

  useEffect(() => {
    return () => {
      if (photoPreview?.startsWith("blob:")) {
        URL.revokeObjectURL(photoPreview);
      }
    };
  }, [photoPreview]);

  useEffect(() => {
    if (!photoPreview) return;
    const probe = new window.Image();
    probe.onload = () => {
      if (probe.naturalHeight > probe.naturalWidth) {
        setPhotoOrientation("portrait");
      } else if (probe.naturalHeight < probe.naturalWidth) {
        setPhotoOrientation("landscape");
      } else {
        setPhotoOrientation("square");
      }
    };
    probe.src = photoPreview;
  }, [photoPreview]);

  useEffect(() => {
    router.prefetch(`${routeBasePath}/${id}/rooms/${roomId}`);
  }, [id, roomId, routeBasePath, router]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!label.trim()) e.label = "Window label is required";
    else {
      const duplicate = datasetData?.windows.find(
        (w) => w.roomId === roomId &&
          w.label.trim().toLowerCase() === label.trim().toLowerCase() &&
          w.id !== existingWindow?.id
      );
      if (duplicate) e.label = "A window with this name already exists in this room";
    }
    if (!chainSide) e.chainSide = "Chain side is required";
    if (!width || parseFloat(width) <= 0) e.width = "Valid width required";
    if (!height || parseFloat(height) <= 0) e.height = "Valid height required";
    if ((riskFlag === "yellow" || riskFlag === "red") && !notes.trim()) {
      e.notes = "Notes are required for yellow or red risk";
    }
    const isGreen = riskFlag === "green";
    const hasPhoto = photoFile || existingWindow?.photoUrl;
    if (!isGreen && !hasPhoto) e.photo = "Pre-bracketing photo is required for yellow or red risk";
    setErrors(e);
    const msgs = Object.values(e).filter(Boolean);
    if (msgs.length > 0) {
      setFormError(msgs.join(" · "));
      return false;
    }
    setFormError("");
    return true;
  };

  useEffect(() => {
    if (!formError || !saveErrorRef.current) return;
    saveErrorRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [formError]);

  const onFileChange = (f: File | null) => {
    setPhotoFile(f);
    setFormError("");
    if (f) {
      const validationError = validateUploadImage(f);
      if (validationError) {
        setErrors((prev) => ({ ...prev, photo: validationError }));
        return;
      }
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next.photo;
      return next;
    });
    setPhotoPreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : existingWindow?.photoUrl ?? null;
    });
  };

  const onDeletePhoto = async () => {
    if (!existingWindow || !unit) return;
    setDeleting(true);
    try {
      const result = await deleteWindowMeasurementPhoto(existingWindow.id, unit.id);
      if (result.ok) {
        setPhotoPreview(null);
        setPhotoFile(null);
        datasetCtx?.patchData((prev) =>
          reconcileUnitDerivedState(
            {
              ...prev,
              windows: prev.windows.map((w) =>
                w.id === existingWindow.id
                  ? { ...w, photoUrl: null, measured: false, installed: false }
                  : w
              ),
            },
            unit.id,
            {
              unitStatus: result.unitStatus,
              photoDelta: result.photoCountDelta ?? -1,
            }
          )
        );
      } else {
        setFormError(result.error ?? "Failed to delete photo.");
      }
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    setFormError("");
    if (!validate() || !unit || !room) return;

    startTransition(async () => {
      const fd = new FormData();
      fd.set("unitId", unit.id);
      fd.set("roomId", room.id);
      fd.set("label", label.trim());
      fd.set("blindType", blindType);
      fd.set("chainSide", chainSide ?? "");
      fd.set("riskFlag", riskFlag);
      fd.set("width", width);
      fd.set("height", height);
      fd.set("depth", depth);
      fd.set("blindWidth", blindWidth);
      fd.set("blindHeight", blindHeight);
      fd.set("blindDepth", blindDepth);
      fd.set("notes", notes);
      try {
        if (photoFile) {
          const validationError = validateUploadImage(photoFile);
          if (validationError) {
            setFormError(validationError);
            return;
          }
          setOptimizingPhoto(true);
          const compressedPhoto = await compressImageForUpload(photoFile);
          fd.set("photo", compressedPhoto, compressedPhoto.name);
        }
      } finally {
        setOptimizingPhoto(false);
      }

      let result;
      if (existingWindow) {
        fd.set("windowId", existingWindow.id);
        result = await updateWindowWithOptionalPhoto(fd);
      } else {
        result = await createWindowWithPhoto(fd);
      }

      if (!result.ok) {
        setFormError(result.error);
        return;
      }

      // Optimistically update in-memory dataset so the room page shows the
      // change immediately without waiting for a server re-render.
      if (datasetCtx && result.windowId) {
        const wId = result.windowId;
        const wRoomId = result.roomId ?? roomId;
        const newPhotoUrl = result.photoUrl ?? null;
        const parsedWidth = parseFloat(width) || null;
        const parsedHeight = parseFloat(height) || null;
        const parsedDepth = depth.trim() ? parseFloat(depth) || null : null;
        const parsedBw = blindWidth.trim() ? parseFloat(blindWidth) || null : null;
        const parsedBh = blindHeight.trim() ? parseFloat(blindHeight) || null : null;
        const parsedBd = blindDepth.trim() ? parseFloat(blindDepth) || null : null;

        datasetCtx.patchData((prev) => {
          const windowData = {
            id: wId,
            roomId: wRoomId,
            label: label.trim(),
            blindType,
            chainSide: chainSide ?? null,
            riskFlag,
            width: parsedWidth,
            height: parsedHeight,
            depth: parsedDepth,
            blindWidth: parsedBw,
            blindHeight: parsedBh,
            blindDepth: parsedBd,
            notes: notes.trim(),
            photoUrl: newPhotoUrl ?? existingWindow?.photoUrl ?? null,
            measured: true,
            bracketed: existingWindow?.bracketed ?? false,
            installed: existingWindow?.installed ?? false,
          };
          const next = existingWindow
            ? {
                ...prev,
                windows: prev.windows.map((w) => (w.id === wId ? windowData : w)),
              }
            : { ...prev, windows: [...prev.windows, windowData] };

          return reconcileUnitDerivedState(next, unit.id, {
            unitStatus: result.unitStatus,
            photoDelta: result.photoCountDelta ?? 0,
          });
        });
      }

      if (addAnotherRef.current) {
        addAnotherRef.current = false;
        router.push(`${routeBasePath}/${id}/rooms/${roomId}/windows/new?t=${Date.now()}`);
      } else {
        router.push(`${routeBasePath}/${id}/rooms/${roomId}`);
      }
    });
  };

  if (!unit || !room) {
    return <div className="p-6 text-center text-muted">Not found</div>;
  }

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title={existingWindow ? "Edit Window" : "Add Window"}
        subtitle={`${room.name} • ${unit.unitNumber}`}
        backHref={`${routeBasePath}/${id}/rooms/${roomId}`}
      />

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        className="flex-1 px-5 py-5 flex flex-col gap-6"
      >
        {existingWindow && (
          <WindowStageNav
            unitId={id}
            roomId={roomId}
            windowId={existingWindow.id}
            active="before"
            isMeasured={existingWindow.measured}
            isBracketed={existingWindow.bracketed}
            isManufactured={
              milestones.manufacturedWindowIds.length > 0
                ? milestones.manufacturedWindowIds.includes(existingWindow.id)
                : milestones.allManufactured
            }
            isInstalled={existingWindow.installed}
            routeBasePath={routeBasePath}
          />
        )}

        <PhotoSourcePicker
          open={photoPickerOpen}
          onClose={() => setPhotoPickerOpen(false)}
          onChange={(files) => onFileChange(files?.[0] ?? null)}
        />

        {formError && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
            {formError}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-5"
        >
          <Input
            label="Window Label"
            placeholder="e.g. Window A, Balcony Door"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            error={errors.label}
            autoFocus
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Blind Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(["screen", "blackout"] as BlindType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBlindType(t)}
                  className={`h-12 rounded-2xl border text-sm font-semibold tracking-tight transition-all active:scale-[0.97] ${
                    blindType === t
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-white text-zinc-600 hover:bg-surface"
                  }`}
                >
                  {t === "screen" ? "Screen" : "Blackout"}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Chain Side <span className="text-red-500">*</span>
            </label>
            <p className="text-[11px] text-zinc-400 -mt-0.5">Which side is the chain slot on when facing the window?</p>
            <div className="grid grid-cols-2 gap-2">
              {(["left", "right"] as ChainSide[]).map((side) => (
                <button
                  key={side}
                  type="button"
                  onClick={() => setChainSide(side)}
                  className={`h-12 rounded-2xl border text-sm font-semibold tracking-tight transition-all active:scale-[0.97] ${
                    chainSide === side
                      ? "border-accent bg-accent text-white"
                      : errors.chainSide
                        ? "border-red-300 bg-red-50 text-red-600"
                        : "border-border bg-white text-zinc-600 hover:bg-surface"
                  }`}
                >
                  {side === "left" ? "← Left" : "Right →"}
                </button>
              ))}
            </div>
            {errors.chainSide && (
              <p className="text-xs text-red-500">{errors.chainSide}</p>
            )}
          </div>

        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-5"
        >
          <div>
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
              Window Measurements (inches)
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Width"
                type="number"
                step="0.25"
                placeholder="48.5"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                error={errors.width}
              />
              <Input
                label="Height"
                type="number"
                step="0.25"
                placeholder="72"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                error={errors.height}
              />
              <Input
                label="Depth"
                type="number"
                step="0.25"
                placeholder="3.5"
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                helper="Optional"
              />
            </div>
          </div>

          <div>
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-1">
              Blind Size Measurements (inches)
            </h2>
            <p className="text-[11px] text-zinc-400 mb-3">Optional — fill in when blind sizing differs from window opening.</p>
            <div className="grid grid-cols-3 gap-3">
              <Input
                label="Width"
                type="number"
                step="0.25"
                placeholder="47"
                value={blindWidth}
                onChange={(e) => setBlindWidth(e.target.value)}
              />
              <Input
                label="Height"
                type="number"
                step="0.25"
                placeholder="70"
                value={blindHeight}
                onChange={(e) => setBlindHeight(e.target.value)}
              />
              <Input
                label="Depth"
                type="number"
                step="0.25"
                placeholder="3"
                value={blindDepth}
                onChange={(e) => setBlindDepth(e.target.value)}
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-1">
            Pre-bracketing Photo
            {riskFlag !== "green" && <span className="text-red-500 ml-1">*</span>}
          </h2>
          <p className="text-[11px] text-zinc-400 mb-3">
            {riskFlag === "green" 
              ? "Optional for green status windows." 
              : "Required for yellow or red risk indicators."}
          </p>
          {photoPreview ? (
            <div className="relative w-full rounded-2xl overflow-hidden border border-border">
              <button
                type="button"
                onClick={() => setPhotoPickerOpen(true)}
                className="relative w-full text-left"
              >
                <Image
                  src={photoPreview}
                  alt="Window measurement"
                  width={800}
                  height={600}
                  sizes="(max-width: 640px) 100vw, 560px"
                  unoptimized={photoPreview.startsWith("blob:")}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    if (img.naturalHeight > img.naturalWidth) {
                      setPhotoOrientation("portrait");
                    } else if (img.naturalHeight < img.naturalWidth) {
                      setPhotoOrientation("landscape");
                    } else {
                      setPhotoOrientation("square");
                    }
                  }}
                  className={`w-full bg-surface h-auto ${
                    photoOrientation === "portrait"
                      ? "max-h-[70dvh] object-contain"
                      : photoOrientation === "square"
                        ? "aspect-square object-cover"
                        : "aspect-[16/9] object-cover"
                  }`}
                />
                <div className="absolute top-3 left-3">
                  <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent text-white text-xs font-semibold">
                    <CheckCircle size={14} weight="fill" />
                    {photoFile ? "New photo" : "Saved — tap to replace"}
                  </span>
                </div>
              </button>
              {existingWindow?.photoUrl && !photoFile && (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={onDeletePhoto}
                  className="absolute right-3 top-3 flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white shadow-lg disabled:opacity-60"
                >
                  <Trash size={13} weight="bold" />
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPhotoPickerOpen(true)}
              className={`w-full h-40 rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-2 transition-colors active:scale-[0.99] ${
                errors.photo
                  ? "border-red-300 bg-red-50"
                  : "border-zinc-300 bg-white hover:border-accent/40 hover:bg-accent/3"
              }`}
            >
              <Camera
                size={28}
                className={errors.photo ? "text-red-400" : "text-zinc-400"}
              />
              <span
                className={`text-sm font-medium ${
                  errors.photo ? "text-red-500" : "text-zinc-500"
                }`}
              >
                Tap to take or choose a photo
              </span>
              {errors.photo && (
                <span className="text-xs text-red-500">{errors.photo}</span>
              )}
            </button>
          )}
        </motion.div>

        {/* Additional measured photos — edit mode only */}
        {existingWindow && unit && (() => {
          const additionalPhotos = mediaItems
            .filter(
              (item) =>
                item.windowId === existingWindow.id &&
                item.stage === "scheduled_bracketing" &&
                item.uploadKind === "window_measure"
            )
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

          if (additionalPhotos.length === 0) return null;

          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.20, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-1 flex items-center justify-between">
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
                          const result = await deleteWindowStagePhoto(photo.id, unit.id);
                          if (result.ok) {
                            removeUnitStageMediaItem(unit.id, photo.id);
                            datasetCtx?.patchData((prev) =>
                              reconcileUnitDerivedState(prev, unit.id, { photoDelta: -1 })
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
                    onClick={() => setPhotoPickerOpen(true)}
                    className="flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-zinc-200 bg-zinc-50 transition-all active:scale-[0.97] hover:bg-zinc-100/60"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-zinc-200 shadow-sm">
                      <Plus size={20} className="text-zinc-500" />
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500">Add Photo</span>
                  </button>
                )}
              </div>
            </motion.div>
          );
        })()}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <WindowRiskNotesFields
            riskFlag={riskFlag}
            notes={notes}
            notesError={errors.notes}
            onRiskFlagChange={setRiskFlag}
            onNotesChange={setNotes}
          />
        </motion.div>

        <div className="pt-2 pb-24 flex flex-col gap-3">
          <Button type="submit" fullWidth size="lg" disabled={pending || optimizingPhoto}>
            <UploadSimple size={18} weight="bold" />
            {optimizingPhoto
              ? "Optimizing photo…"
              : pending && !addAnotherRef.current
              ? "Saving…"
              : "Save Window & Back to Room"}
          </Button>

          <Button
            type="button"
            fullWidth
            size="lg"
            variant="secondary"
            disabled={pending || optimizingPhoto}
            onClick={() => {
              addAnotherRef.current = true;
              formRef.current?.requestSubmit();
            }}
          >
            {pending && addAnotherRef.current ? "Saving…" : "Save & Add Another Window"}
          </Button>

          {existingWindow?.measured && (
            <Button
              type="button"
              fullWidth
              size="lg"
              variant="secondary"
              disabled={pending || optimizingPhoto || undoing}
              onClick={async () => {
                const willAlsoRemoveInstalled = existingWindow.installed;
                const msg = willAlsoRemoveInstalled
                  ? "Undo Measured? This will also remove the Installed stage."
                  : "Undo Measured? This will mark the window as not yet measured.";
                if (!window.confirm(msg)) return;
                setUndoing(true);
                try {
                  const result = await undoWindowStage(existingWindow.id, "measured");
                  if (result.ok) {
                    datasetCtx?.patchData((prev) =>
                      reconcileUnitDerivedState(
                        {
                          ...prev,
                          windows: prev.windows.map((w) =>
                            w.id === existingWindow.id
                              ? { ...w, measured: false, installed: false }
                              : w
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
            >
              {undoing ? "Undoing…" : "Undo Measured"}
            </Button>
          )}

          {existingWindow && (
            <Button
              type="button"
              fullWidth
              size="lg"
              variant="danger"
              disabled={pending || optimizingPhoto}
              onClick={async () => {
                const confirmed = window.confirm(
                  `Delete "${existingWindow.label || "this window"}"? This cannot be undone.`
                );
                if (!confirmed) return;
                const result = await deleteWindow(existingWindow.id, id);
                if (result.ok) {
                  datasetCtx?.patchData((prev) =>
                    reconcileUnitDerivedState(
                      {
                        ...prev,
                        windows: prev.windows.filter((w) => w.id !== existingWindow.id),
                      },
                      unit.id,
                      {
                        unitStatus: result.unitStatus,
                        photoDelta: result.photoCountDelta ?? 0,
                      }
                    )
                  );
                  router.push(`${routeBasePath}/${id}/rooms/${roomId}`);
                } else {
                  alert(`Failed to delete: ${result.error}`);
                }
              }}
            >
              Delete Window
            </Button>
          )}

          {formError && (
            <div
              ref={saveErrorRef}
              className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-2xl px-4 py-3"
              role="alert"
            >
              {formError}
            </div>
          )}

          {existingWindow && (
            <div className="mt-4 rounded-2xl border border-border bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <ClockCounterClockwise size={16} className="text-zinc-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                  Window History
                </h3>
              </div>
              {windowHistory.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No changes logged yet for this window.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {windowHistory.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-xl border border-border bg-surface px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            {buildWindowActivityDescription(log)}
                          </p>
                          <p className="text-[11px] text-zinc-500 mt-0.5">
                            {log.actorName}
                          </p>
                        </div>
                        <span className="text-[10px] text-zinc-500 whitespace-nowrap">
                          {formatActivityDate(log.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </form>
    </div>
  );
}
