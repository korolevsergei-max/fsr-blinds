"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitMilestoneCoverage } from "@/lib/unit-milestones";
import { UNIT_STATUS_LABELS } from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { UnitProgressMilestonesPanel } from "@/components/units/unit-progress-milestones-panel";

type UnitStatusEditorProps = {
  data: AppDataset;
  mediaItems?: unknown;
  milestones: UnitMilestoneCoverage;
  unitsBasePath: "/management/units" | "/scheduler/units";
};

export function UnitStatusEditor({
  data,
  milestones,
  unitsBasePath,
}: UnitStatusEditorProps) {
  const { id } = useParams<{ id: string }>();
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const detailHref = `${unitsBasePath}/${unit.id}`;
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
                style={{
                  width: totalWindows > 0 ? `${(measuredWindows / totalWindows) * 100}%` : "0%",
                }}
              />
            </div>
            <span className="text-[12px] font-semibold font-mono text-foreground flex-shrink-0">
              {measuredWindows}/{totalWindows} measured
            </span>
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
          className="rounded-2xl border border-border bg-surface px-4 py-3.5 text-[12px] text-secondary leading-relaxed"
        >
          Status is derived from installer activity. Measurements and bracketing can finish in any order; both must be done before installation photos count toward completion.
        </motion.div>
      </div>
    </div>
  );
}
