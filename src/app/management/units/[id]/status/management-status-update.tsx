"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle,
  Warning,
  Door,
  Ruler,
  Camera,
} from "@phosphor-icons/react";
import { updateUnitStatus } from "@/app/actions/fsr-data";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import {
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
} from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";

/** Criteria check result for entering bracketed_measured */
function useBracketingCriteria(
  data: AppDataset,
  unitId: string,
  mediaItems: UnitStageMediaItem[]
) {
  const rooms = getRoomsByUnit(data, unitId);
  const totalWindows = rooms.reduce((s, r) => s + r.windowCount, 0);
  const measuredWindows = rooms.reduce((s, r) => s + r.completedWindows, 0);
  const allMeasured = totalWindows > 0 && measuredWindows >= totalWindows;

  const beforePhotos = mediaItems.filter((m) => m.stage === "scheduled_bracketing");
  const afterPhotos = mediaItems.filter((m) => m.stage === "bracketed_measured");
  const bracketingPhotos = [...beforePhotos, ...afterPhotos];

  const hasRooms = rooms.length > 0;
  const hasWindows = totalWindows > 0;
  const hasBeforePhotos = beforePhotos.length > 0;
  const hasAfterPhotos = afterPhotos.length > 0;

  return {
    rooms,
    totalWindows,
    measuredWindows,
    allMeasured,
    hasRooms,
    hasWindows,
    hasBeforePhotos,
    hasAfterPhotos,
    bracketingPhotos,
    ready: hasRooms && hasWindows && hasBeforePhotos && hasAfterPhotos && allMeasured,
  };
}

export function ManagementStatusUpdate({
  data,
  mediaItems,
}: {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
}) {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const unit = data.units.find((u) => u.id === id);

  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pending, startTransition] = useTransition();

  const criteria = useBracketingCriteria(data, id, mediaItems);

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status];

  const allowedNext = UNIT_STATUSES.filter(
    (s) => UNIT_STATUS_ORDER[s] === currentStep + 1
  );

  function isLocked(status: string): boolean {
    if (status === "bracketed_measured") {
      return !criteria.ready;
    }
    return false;
  }

  function lockReason(status: string): string | null {
    if (status !== "bracketed_measured") return null;
    const missing: string[] = [];
    if (!criteria.hasRooms) missing.push("rooms identified");
    if (!criteria.hasWindows) missing.push("windows identified");
    if (!criteria.allMeasured)
      missing.push(
        `${criteria.totalWindows - criteria.measuredWindows} window${criteria.totalWindows - criteria.measuredWindows !== 1 ? "s" : ""} not measured`
      );
    if (!criteria.hasBeforePhotos) missing.push("before photos on file");
    if (!criteria.hasAfterPhotos) missing.push("after photos on file");
    return missing.length > 0 ? missing.join(" · ") : null;
  }

  const blockedByMeasurement =
    selectedStatus === "bracketed_measured" && !criteria.ready;

  const handleSave = () => {
    if (!selectedStatus || blockedByMeasurement) return;
    setSaveError("");
    startTransition(async () => {
      const result = await updateUnitStatus(unit.id, selectedStatus as Parameters<typeof updateUnitStatus>[1], note);
      if (!result.ok) {
        setSaveError(result.error);
        return;
      }
      setSaved(true);
      router.refresh();
      setTimeout(() => router.push(`/management/units/${unit.id}`), 900);
    });
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Update Status"
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/management/units/${unit.id}`}
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
        {saveError && (
          <div className="rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] font-medium bg-danger-light border-[rgba(200,57,43,0.2)] text-danger">
            {saveError}
          </div>
        )}

        {/* Current status */}
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
            <span className="text-[14px] font-bold text-foreground">
              {UNIT_STATUS_LABELS[unit.status]}
            </span>
          </div>
        </motion.div>

        {/* Bracketing criteria check — shown when current status is scheduled_bracketing */}
        {unit.status === "scheduled_bracketing" && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
              Exit Criteria — Bracketed & Measured
            </h2>
            <div className="grid grid-cols-3 gap-2 mb-3">
              <MetricTile value={criteria.rooms.length} label="Rooms" />
              <MetricTile value={criteria.totalWindows} label="Windows" />
              <MetricTile value={criteria.bracketingPhotos.length} label="Photos" />
            </div>

            <div className="flex flex-col gap-2">
              <CriterionRow
                icon={Door}
                label="Rooms identified"
                met={criteria.hasRooms}
                hint={criteria.hasRooms ? `${criteria.rooms.length} room${criteria.rooms.length !== 1 ? "s" : ""} in system` : "No rooms added yet"}
              />
              <CriterionRow
                icon={Ruler}
                label="Windows identified & measured"
                met={criteria.hasWindows && criteria.allMeasured}
                hint={
                  !criteria.hasWindows
                    ? "No windows added yet"
                    : !criteria.allMeasured
                    ? `${criteria.measuredWindows}/${criteria.totalWindows} measured`
                    : `All ${criteria.totalWindows} measured`
                }
              />
              <CriterionRow
                icon={Camera}
                label="Before & after photos on file"
                met={criteria.hasBeforePhotos && criteria.hasAfterPhotos}
                hint={
                  criteria.hasBeforePhotos && criteria.hasAfterPhotos
                    ? `${criteria.bracketingPhotos.length} photo${criteria.bracketingPhotos.length !== 1 ? "s" : ""} uploaded`
                    : `${criteria.hasBeforePhotos ? "Before ✓" : "Before missing"} · ${
                        criteria.hasAfterPhotos ? "After ✓" : "After missing"
                      }`
                }
              />
            </div>
          </motion.div>
        )}

        {/* Move to */}
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
              const locked = isLocked(s);
              const reason = lockReason(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    if (locked) return;
                    setSelectedStatus(selectedStatus === s ? null : s);
                  }}
                  disabled={locked}
                  className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl border text-sm font-semibold transition-all ${
                    locked
                      ? "border-border bg-zinc-50 text-zinc-400 cursor-not-allowed"
                      : selectedStatus === s
                        ? "border-accent bg-accent/5 text-accent active:scale-[0.98]"
                        : "border-border bg-card text-foreground hover:bg-surface active:scale-[0.98]"
                  }`}
                >
                  {locked ? (
                    <Warning size={16} className="text-amber-400 mt-0.5 flex-shrink-0" />
                  ) : (
                    <ArrowRight size={16} className="mt-0.5 flex-shrink-0" />
                  )}
                  <div className="flex-1 text-left">
                    <p>{UNIT_STATUS_LABELS[s]}</p>
                    {locked && reason && (
                      <p className="text-[10px] font-normal text-amber-500 mt-0.5 leading-snug">
                        Requires: {reason}
                      </p>
                    )}
                  </div>
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

        {/* Note */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <label className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-2 block">
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
              disabled={!selectedStatus || pending || blockedByMeasurement}
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

function CriterionRow({
  icon: Icon,
  label,
  met,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  met: boolean;
  hint: string;
}) {
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border ${
        met ? "bg-emerald-50 border-emerald-200" : "bg-amber-50 border-amber-200"
      }`}
    >
      <Icon
        size={15}
        className={met ? "text-emerald-600 flex-shrink-0" : "text-amber-500 flex-shrink-0"}
      />
      <div className="flex-1 min-w-0">
        <p
          className={`text-[12px] font-semibold ${
            met ? "text-emerald-800" : "text-amber-800"
          }`}
        >
          {label}
        </p>
        <p
          className={`text-[11px] ${
            met ? "text-emerald-600" : "text-amber-600"
          }`}
        >
          {hint}
        </p>
      </div>
      {met ? (
        <CheckCircle size={16} weight="fill" className="text-emerald-500 flex-shrink-0" />
      ) : (
        <Warning size={16} weight="fill" className="text-amber-400 flex-shrink-0" />
      )}
    </div>
  );
}
