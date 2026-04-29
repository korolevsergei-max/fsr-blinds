"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitMilestoneCoverage } from "@/lib/unit-milestones";
import { deriveUnitStatusFromCounts } from "@/lib/unit-status-helpers";
import { UNIT_STATUS_LABELS } from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import { MetricTile } from "@/components/ui/metric-tile";
import { UnitProgressMilestonesPanel } from "@/components/units/unit-progress-milestones-panel";
import { useAppDatasetMaybe } from "@/lib/dataset-context";

export function StatusUpdate({
  data,
  milestones,
}: {
  data?: AppDataset;
  milestones: UnitMilestoneCoverage;
}) {
  const { id } = useParams<{ id: string }>();
  const datasetCtx = useAppDatasetMaybe();
  const datasetData = data ?? datasetCtx?.data;
  const unit = datasetData?.units.find((u) => u.id === id);
  const rooms = unit && datasetData ? getRoomsByUnit(datasetData, unit.id) : [];

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const totalWindows = rooms.reduce((s, r) => s + r.windowCount, 0);
  const measuredWindows = rooms.reduce((s, r) => s + r.completedWindows, 0);
  const effectiveStatus: UnitStatus = deriveUnitStatusFromCounts({
    totalWindows: milestones.totalWindows,
    measuredCount: milestones.measuredCount,
    bracketedCount: milestones.bracketedCount,
    manufacturedCount: milestones.manufacturedCount,
    installedCount: milestones.installedCount,
  });

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Progress"
        subtitle={`${unit.unitNumber} • ${unit.buildingName}`}
        backHref={`/scheduler/units/${unit.id}`}
        actions={<RefreshButton />}
      />

      <div className="flex-1 px-5 py-5 flex flex-col gap-6">
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
              {UNIT_STATUS_LABELS[effectiveStatus] ?? effectiveStatus}
            </span>
          </div>
        </motion.div>

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

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.12, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-4"
        >
          <UnitProgressMilestonesPanel
            unit={unit}
            milestones={milestones}
            layout="simple"
            title="Milestones"
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="rounded-2xl border border-border bg-surface px-4 py-3.5 text-[12px] text-secondary leading-relaxed pb-28"
        >
          Status updates automatically when measurements, bracketing photos, manufacturing QC, and installation are completed for the unit.
        </motion.div>
      </div>
    </div>
  );
}
