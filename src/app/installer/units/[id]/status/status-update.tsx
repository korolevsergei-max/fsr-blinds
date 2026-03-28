"use client";

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, ArrowRight, Warning } from "@phosphor-icons/react";
import { updateUnitStatus } from "@/app/actions/fsr-data";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import {
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
} from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";

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

  const [selectedStatus, setSelectedStatus] = useState<UnitStatus | null>(null);
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [pending, startTransition] = useTransition();

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
  const beforeBracketingItems = mediaItems.filter(
    (item) => item.stage === "scheduled_bracketing"
  );

  const blockedByMissingBeforePhotos =
    selectedStatus === "bracketed_measured" &&
    beforeBracketingItems.length === 0;

  const handleSave = () => {
    if (
      !selectedStatus ||
      blockedByMeasurement ||
      blockedByMissingBeforePhotos
    )
      return;
    setSaveError("");
    startTransition(async () => {
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
                blockedByMissingBeforePhotos
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
