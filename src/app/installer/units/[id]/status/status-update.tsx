"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  CheckCircle,
  Circle,
  Warning,
} from "@phosphor-icons/react";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { UNIT_STATUSES, UNIT_STATUS_LABELS, UNIT_STATUS_ORDER } from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { MetricTile } from "@/components/ui/metric-tile";

export function StatusUpdate({
  data,
  mediaItems,
}: {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
}) {
  const { id } = useParams<{ id: string }>();
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const totalWindows = rooms.reduce((s, r) => s + r.windowCount, 0);
  const measuredWindows = rooms.reduce((s, r) => s + r.completedWindows, 0);
  const allMeasured = totalWindows > 0 && measuredWindows >= totalWindows;

  const bracketedWindowIds = new Set(
    mediaItems
      .filter((m) => m.stage === "bracketed_measured" && m.uploadKind === "window_measure" && m.windowId)
      .map((m) => m.windowId!)
  );
  const installedWindowIds = new Set(
    mediaItems
      .filter((m) => m.stage === "installed_pending_approval" && m.uploadKind === "window_measure" && m.windowId)
      .map((m) => m.windowId!)
  );

  const allWindowIds = new Set(
    mediaItems.filter((m) => m.windowId).map((m) => m.windowId!)
  );

  const bracketedCount = [...allWindowIds].filter((wid) => bracketedWindowIds.has(wid)).length;
  const installedCount = [...allWindowIds].filter((wid) => installedWindowIds.has(wid)).length;

  const currentStep = UNIT_STATUS_ORDER[unit.status as UnitStatus] ?? 0;

  const readinessChecks = [
    {
      label: "All windows measured",
      met: allMeasured,
      hint: allMeasured
        ? `${totalWindows} windows measured`
        : `${measuredWindows}/${totalWindows} windows measured`,
    },
    {
      label: "Bracketing photos uploaded",
      met: totalWindows > 0 && bracketedCount >= totalWindows,
      hint: `${bracketedCount}/${totalWindows} windows have bracketing photos`,
    },
    {
      label: "Installed photos uploaded",
      met: totalWindows > 0 && installedCount >= totalWindows,
      hint: `${installedCount}/${totalWindows} windows have installed photos`,
    },
  ];

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Progress"
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/installer/units/${unit.id}`}
      />

      <div className="flex-1 px-5 py-5 flex flex-col gap-6">
        {/* Current status */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Current Progress
          </h2>
          <div className="flex items-center gap-3 surface-card px-4 py-3.5">
            <div className="w-2.5 h-2.5 rounded-full bg-accent" />
            <span className="text-sm font-bold text-foreground">
              {UNIT_STATUS_LABELS[unit.status as UnitStatus] ?? unit.status}
            </span>
          </div>
        </motion.div>

        {/* Window stats */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Window Progress
          </h2>
          <div className="grid grid-cols-3 gap-3">
            <MetricTile value={rooms.length} label="Rooms" />
            <MetricTile value={measuredWindows} label="Measured" />
            <MetricTile value={totalWindows} label="Total" />
          </div>
        </motion.div>

        {/* Readiness checks */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Completion Criteria
          </h2>
          <div className="flex flex-col gap-2">
            {readinessChecks.map(({ label, met, hint }) => (
              <div
                key={label}
                className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border ${
                  met ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-border"
                }`}
              >
                {met ? (
                  <CheckCircle size={16} weight="fill" className="text-emerald-500 flex-shrink-0" />
                ) : (
                  <Warning size={16} weight="fill" className="text-amber-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-semibold ${met ? "text-emerald-800" : "text-foreground"}`}>
                    {label}
                  </p>
                  <p className={`text-[11px] ${met ? "text-emerald-600" : "text-tertiary"}`}>
                    {hint}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Timeline ladder */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
            Progress Timeline
          </h2>
          <div className="flex flex-col">
            {UNIT_STATUSES.map((status, i) => {
              const step = UNIT_STATUS_ORDER[status];
              const isComplete = step < currentStep;
              const isCurrent = step === currentStep;
              return (
                <div key={status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    {isComplete ? (
                      <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                    ) : isCurrent ? (
                      <div className="w-[18px] h-[18px] rounded-full bg-accent flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    ) : (
                      <Circle size={18} className="text-zinc-300" />
                    )}
                    {i < UNIT_STATUSES.length - 1 && (
                      <div className={`w-px h-5 ${isComplete ? "bg-emerald-300" : "bg-zinc-200"}`} />
                    )}
                  </div>
                  <span
                    className={`text-[12px] pb-4 ${
                      isCurrent
                        ? "font-semibold text-foreground"
                        : isComplete
                          ? "text-secondary"
                          : "text-tertiary"
                    }`}
                  >
                    {UNIT_STATUS_LABELS[status]}
                    {status === "client_approved" && (
                      <span className="ml-1.5 text-[10px] text-tertiary font-normal">(owner approval required)</span>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border bg-surface px-4 py-3.5 text-[12px] text-secondary leading-relaxed pb-28"
        >
          Status advances automatically as you upload bracketing and installed photos for each window. No manual update needed.
        </motion.div>
      </div>
    </div>
  );
}
