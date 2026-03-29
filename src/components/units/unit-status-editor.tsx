"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { CheckCircle, Circle } from "@phosphor-icons/react";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { UNIT_STATUSES, UNIT_STATUS_LABELS, UNIT_STATUS_ORDER } from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";

type UnitStatusEditorProps = {
  data: AppDataset;
  mediaItems?: unknown;
  unitsBasePath: "/management/units" | "/scheduler/units";
};

export function UnitStatusEditor({ data, unitsBasePath }: UnitStatusEditorProps) {
  const { id } = useParams<{ id: string }>();
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const detailHref = `${unitsBasePath}/${unit.id}`;
  const currentStep = UNIT_STATUS_ORDER[unit.status as UnitStatus] ?? 0;

  const totalWindows = rooms.reduce((s, r) => s + r.windowCount, 0);
  const measuredWindows = rooms.reduce((s, r) => s + r.completedWindows, 0);

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Unit Progress"
        subtitle={`${unit.unitNumber} · ${unit.buildingName}`}
        backHref={detailHref}
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
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
              {UNIT_STATUS_LABELS[unit.status as UnitStatus] ?? unit.status}
            </span>
          </div>
        </motion.div>

        {/* Window stats */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-4"
        >
          <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-3">
            Window progress
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: totalWindows > 0 ? `${(measuredWindows / totalWindows) * 100}%` : "0%" }}
              />
            </div>
            <span className="text-[12px] font-semibold font-mono text-foreground flex-shrink-0">
              {measuredWindows}/{totalWindows} measured
            </span>
          </div>
        </motion.div>

        {/* Progress timeline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
                      <span className="ml-1.5 text-[10px] text-tertiary font-normal">(owner approval)</span>
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
          transition={{ delay: 0.18, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border bg-surface px-4 py-3.5 text-[12px] text-secondary leading-relaxed"
        >
          Status advances automatically as the installer uploads bracketing and installed photos for each window.
        </motion.div>
      </div>
    </div>
  );
}
