"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  Camera,
  CheckCircle,
  ClockCounterClockwise,
  UploadSimple,
} from "@phosphor-icons/react";
import {
  createWindowWithPhoto,
  updateWindowWithOptionalPhoto,
} from "@/app/actions/fsr-data";
import type { AppDataset } from "@/lib/app-dataset";
import { type BlindType, type RiskFlag, type UnitActivityLog } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { WindowStageNav } from "@/components/window-stage-nav";
import { WindowRiskNotesFields } from "@/components/windows/window-risk-notes-fields";
import { compressImageForUpload, validateUploadImage } from "@/lib/image-upload";

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
    return "Window created with measurements and pre-bracketing photo.";
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
  routeBasePath = "/installer/units",
}: {
  data: AppDataset;
  activityLog: UnitActivityLog[];
  routeBasePath?: "/installer/units" | "/scheduler/units";
}) {
  const { id, roomId } = useParams<{ id: string; roomId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const fileRef = useRef<HTMLInputElement>(null);

  const unit = data.units.find((u) => u.id === id);
  const room = data.rooms.find((r) => r.id === roomId);
  const existingWindow = editId
    ? data.windows.find((w) => w.id === editId && w.roomId === roomId)
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
  const saveErrorRef = useRef<HTMLDivElement>(null);

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

  const validate = () => {
    const e: Record<string, string> = {};
    if (!label.trim()) e.label = "Window label is required";
    if (!width || parseFloat(width) <= 0) e.width = "Valid width required";
    if (!height || parseFloat(height) <= 0) e.height = "Valid height required";
    if ((riskFlag === "yellow" || riskFlag === "red") && !notes.trim()) {
      e.notes = "Notes are required for yellow or red risk";
    }
    const hasPhoto = photoFile || existingWindow?.photoUrl;
    if (!hasPhoto) e.photo = "Pre-bracketing photo is required";
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
      router.push(`${routeBasePath}/${id}/rooms/${roomId}`);
      router.refresh();
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
        onSubmit={handleSubmit}
        className="flex-1 px-5 py-5 flex flex-col gap-6"
      >
        {existingWindow && (
          <WindowStageNav
            unitId={id}
            roomId={roomId}
            windowId={existingWindow.id}
            active="before"
            routeBasePath={routeBasePath}
          />
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
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
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Pre-bracketing Photo
            <span className="text-red-500 ml-1">*</span>
          </h2>
          {photoPreview ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="relative w-full rounded-2xl overflow-hidden border border-border text-left"
            >
              <img
                src={photoPreview}
                alt="Window measurement"
                className={`w-full bg-surface ${
                  photoOrientation === "portrait"
                    ? "max-h-[70dvh] object-contain"
                    : photoOrientation === "square"
                      ? "aspect-square object-cover"
                      : "aspect-[16/9] object-cover"
                }`}
              />
              <div className="absolute top-3 right-3">
                <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-accent text-white text-xs font-semibold">
                  <CheckCircle size={14} weight="fill" />
                  {photoFile ? "New photo" : "Saved — tap to replace"}
                </span>
              </div>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
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

        <div className="pt-2 pb-24">
          <Button type="submit" fullWidth size="lg" disabled={pending || optimizingPhoto}>
            <UploadSimple size={18} weight="bold" />
            {optimizingPhoto
              ? "Optimizing photo…"
              : pending
              ? "Saving…"
              : existingWindow
                ? "Update Window"
                : "Save Window"}
          </Button>

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
