"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Camera, CheckCircle, ArrowRight, Warning, UploadSimple } from "@phosphor-icons/react";
import { updateUnitStatus, uploadUnitStagePhotos } from "@/app/actions/fsr-data";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import {
  UNIT_PHOTO_STAGE_HELPERS,
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
} from "@/lib/types";
import type { UnitPhotoStage, UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";
import { UnitStageSummaryGrid } from "@/components/unit-stage-summary-grid";

function isPhotoRequiredStatus(status: UnitStatus | null): status is UnitPhotoStage {
  return status === "bracketed_measured" || status === "installed_pending_approval";
}

export function StatusUpdate({
  data,
  mediaItems,
}: {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];
  const stageInputRef = useRef<HTMLInputElement>(null);

  const [selectedStatus, setSelectedStatus] = useState<UnitStatus | null>(null);
  const [note, setNote] = useState("");
  const [stageLabel, setStageLabel] = useState("");
  const [stageFiles, setStageFiles] = useState<File[]>([]);
  const [stagePreviewUrls, setStagePreviewUrls] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    return () => {
      stagePreviewUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [stagePreviewUrls]);

  const resetStageDraft = () => {
    setStageLabel("");
    setStageFiles([]);
    if (stageInputRef.current) {
      stageInputRef.current.value = "";
    }
    setStagePreviewUrls((current) => {
      current.forEach((url) => URL.revokeObjectURL(url));
      return [];
    });
  };

  const handleStageFileChange = (list: FileList | null) => {
    const files = Array.from(list ?? []).filter((file) => file.size > 0);
    setSaveError("");
    setStageFiles(files);
    setStagePreviewUrls((current) => {
      current.forEach((url) => URL.revokeObjectURL(url));
      return files.map((file) => URL.createObjectURL(file));
    });
  };

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status];

  // scheduled_bracketing and install_date_scheduled are set automatically by the
  // scheduling system when dates are assigned. Installers cannot manually select them.
  const INSTALLER_BLOCKED_STATUSES = new Set<string>(["scheduled_bracketing", "install_date_scheduled"]);

  const allowedNext = UNIT_STATUSES.filter(
    (s) => UNIT_STATUS_ORDER[s] === currentStep + 1 && !INSTALLER_BLOCKED_STATUSES.has(s)
  );

  // Measurement progress for bracketing validation
  const totalWindows = rooms.reduce((s, r) => s + r.windowCount, 0);
  const measuredWindows = rooms.reduce((s, r) => s + r.completedWindows, 0);
  const allMeasured = totalWindows > 0 && measuredWindows >= totalWindows;
  const blockedByMeasurement =
    selectedStatus === "bracketed_measured" && !allMeasured;
  const selectedPhotoStage = isPhotoRequiredStatus(selectedStatus)
    ? selectedStatus
    : null;
  const beforeBracketingItems = mediaItems.filter(
    (item) => item.stage === "scheduled_bracketing"
  );
  const existingStageItems =
    selectedPhotoStage
      ? mediaItems.filter((item) => item.stage === selectedPhotoStage)
      : [];

  const blockedByMissingBeforePhotos =
    selectedStatus === "bracketed_measured" &&
    beforeBracketingItems.length === 0;

  const blockedByPhotos =
    selectedPhotoStage !== null &&
    existingStageItems.length === 0 &&
    stageFiles.length === 0;
  const showSummaryOnly =
    selectedPhotoStage === "bracketed_measured" && existingStageItems.length > 0;

  const handleSave = () => {
    if (
      !selectedStatus ||
      blockedByMeasurement ||
      blockedByMissingBeforePhotos ||
      blockedByPhotos
    )
      return;
    setSaveError("");
    startTransition(async () => {
      if (selectedPhotoStage && stageFiles.length > 0) {
        const stageData = new FormData();
        stageData.set("unitId", unit.id);
        stageData.set("stage", selectedPhotoStage);
        stageData.set("labelPrefix", stageLabel.trim());
        stageFiles.forEach((file) => stageData.append("photos", file));
        const uploadResult = await uploadUnitStagePhotos(stageData);
        if (!uploadResult.ok) {
          setSaveError(uploadResult.error);
          return;
        }
      }

      const result = await updateUnitStatus(unit.id, selectedStatus, note);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => router.push(`/installer/units/${unit.id}`), 900);
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Update Status"
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/installer/units/${unit.id}`}
      />

      <div className="flex-1 px-5 py-5 flex flex-col gap-6">
        {saveError && (
          <div className="rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] font-medium bg-danger-light border-[rgba(200,57,43,0.2)] text-danger">
            {saveError}
          </div>
        )}

        {blockedByMissingBeforePhotos && (
          <div className="rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] font-medium bg-amber-50 border-amber-200 text-amber-800">
            Add at least one <span className="font-bold">Before Bracketing</span> photo before
            marking this unit as Bracketed &amp; Measured.
          </div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Current Status
          </h2>
          <div className="flex items-center gap-3 surface-card px-4 py-3.5">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="text-sm font-bold text-foreground">
              {UNIT_STATUS_LABELS[unit.status]}
            </span>
          </div>
        </motion.div>

        {unit.status === "scheduled_bracketing" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
              Measurement Progress
            </h2>
            <div className="grid grid-cols-3 gap-3">
              <MetricTile value={rooms.length} label="Rooms" />
              <MetricTile value={measuredWindows} label="Measured" />
              <MetricTile value={totalWindows} label="Total" />
            </div>
            {totalWindows > 0 && !allMeasured && (
              <div className="mt-3 flex items-start gap-2.5 px-4 py-3 rounded-2xl bg-amber-50 border border-amber-200">
                <Warning size={16} weight="fill" className="text-amber-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700 font-medium leading-relaxed">
                  <span className="font-bold">{totalWindows - measuredWindows} window{totalWindows - measuredWindows !== 1 ? "s" : ""} still need measuring.</span>{" "}
                  You must measure and photograph all windows before marking this unit as Bracketed & Measured.
                </p>
              </div>
            )}
            {allMeasured && (
              <div className="mt-3 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200">
                <CheckCircle size={16} weight="fill" className="text-emerald-600 flex-shrink-0" />
                <p className="text-xs text-emerald-700 font-semibold">
                  All {totalWindows} windows measured — ready to mark as Bracketed & Measured.
                </p>
              </div>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Move To
          </h2>
          <div className="flex flex-col gap-2">
            {allowedNext.map((s) => {
              const locked = s === "bracketed_measured" && !allMeasured;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (locked) return;
                    if (selectedStatus !== s) {
                      resetStageDraft();
                    }
                    setSelectedStatus(s);
                  }}
                  disabled={locked}
                  className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-sm font-semibold transition-all ${
                    locked
                      ? "border-border bg-zinc-50 text-zinc-400 cursor-not-allowed"
                      : selectedStatus === s
                        ? "border-accent bg-accent/5 text-accent active:scale-[0.98]"
                        : "border-border bg-card text-foreground hover:bg-surface active:scale-[0.98]"
                  }`}
                >
                  {locked ? <Warning size={16} className="text-amber-400" /> : <ArrowRight size={16} />}
                  <span className="flex-1 text-left">{UNIT_STATUS_LABELS[s]}</span>
                  {locked && (
                    <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">
                      {measuredWindows}/{totalWindows} measured
                    </span>
                  )}
                </button>
              );
            })}

            {allowedNext.length === 0 && (
              <div className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-accent/5 border border-accent/20 text-accent text-sm font-semibold">
                <CheckCircle size={18} weight="fill" />
                Unit has reached final status
              </div>
            )}
          </div>
        </motion.div>

        {selectedPhotoStage && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="surface-card p-4"
          >
            <input
              ref={stageInputRef}
              type="file"
              accept="image/*"
              multiple
              className="sr-only"
              onChange={(e) => handleStageFileChange(e.target.files)}
            />

            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em]">
                  Stage Photos
                </h2>
                <p className="mt-1 text-sm font-semibold text-foreground">
                  {UNIT_STATUS_LABELS[selectedPhotoStage]}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  {UNIT_PHOTO_STAGE_HELPERS[selectedPhotoStage]}
                </p>
              </div>
              {!showSummaryOnly && (
                <button
                  type="button"
                  onClick={() => stageInputRef.current?.click()}
                  className="inline-flex h-11 items-center gap-2 rounded-2xl border border-border bg-surface px-4 text-sm font-semibold text-foreground transition-all active:scale-[0.98]"
                >
                  <Camera size={16} />
                  Add Photos
                </button>
              )}
            </div>

            {existingStageItems.length > 0 && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-medium leading-relaxed text-emerald-700">
                {existingStageItems.length} photo{existingStageItems.length === 1 ? "" : "s"} already saved for this stage. Add more if you need updated angles or extra room coverage.
              </div>
            )}

            {showSummaryOnly ? (
              <div className="mt-4">
                <UnitStageSummaryGrid items={mediaItems} showStageCounters={false} />
              </div>
            ) : (
              <>
                <div className="mt-4">
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    Photo Label (optional)
                  </label>
                  <input
                    value={stageLabel}
                    onChange={(e) => setStageLabel(e.target.value)}
                    placeholder="e.g. Lobby entry, Bedroom 2, Patio door"
                    className="w-full rounded-[var(--radius-lg)] border border-border bg-card px-4 py-3 text-[14px] text-foreground placeholder:text-tertiary focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[rgba(15,118,110,0.14)] transition-all"
                  />
                </div>

                {stagePreviewUrls.length > 0 ? (
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {stagePreviewUrls.map((url, index) => (
                      <div
                        key={url}
                        className="overflow-hidden rounded-2xl border border-border bg-surface"
                      >
                        <div className="relative h-32 w-full">
                          <Image
                          src={url}
                          alt={`Selected stage photo ${index + 1}`}
                            fill
                            unoptimized
                            sizes="50vw"
                            className="object-cover"
                          />
                        </div>
                        <div className="px-3 py-2 text-[11px] font-semibold text-zinc-600">
                          New photo {index + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => stageInputRef.current?.click()}
                    className={`mt-4 flex w-full flex-col items-center justify-center gap-2 rounded-[1.5rem] border-2 border-dashed px-4 py-8 text-center transition-all active:scale-[0.99] ${
                      blockedByPhotos
                        ? "border-amber-300 bg-amber-50"
                        : "border-zinc-300 bg-white hover:border-accent/40 hover:bg-accent/3"
                    }`}
                  >
                    <UploadSimple
                      size={24}
                      className={blockedByPhotos ? "text-amber-500" : "text-zinc-400"}
                    />
                    <span
                      className={`text-sm font-semibold ${
                        blockedByPhotos ? "text-amber-700" : "text-zinc-600"
                      }`}
                    >
                      Tap to add one or more photos
                    </span>
                    <span className="max-w-xs text-xs leading-relaxed text-muted">
                      You need at least one photo on file for this stage before the status can be saved.
                    </span>
                  </button>
                )}
              </>
            )}
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.21, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2 block">
            Status Note (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add context for this status change..."
            rows={3}
            className="w-full px-4 py-3 rounded-[var(--radius-lg)] border border-border text-[14px] text-foreground bg-card placeholder:text-tertiary focus:outline-none focus:ring-[3px] focus:ring-[rgba(15,118,110,0.14)] focus:border-accent transition-all resize-none"
          />
        </motion.div>

        <div className="pt-2 pb-24">
          {saved ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex items-center justify-center gap-2 h-13 rounded-2xl bg-accent text-white font-semibold"
            >
              <CheckCircle size={20} weight="fill" />
              Status Updated
            </motion.div>
          ) : (
            <Button
              fullWidth
              size="lg"
              disabled={
                !selectedStatus ||
                pending ||
                blockedByMeasurement ||
                blockedByMissingBeforePhotos ||
                blockedByPhotos
              }
              onClick={handleSave}
            >
              {pending ? "Saving…" : "Confirm Status Update"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
