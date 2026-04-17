"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, UserCircle, X } from "@phosphor-icons/react";
import { UNIT_STATUS_LABELS, type UnitStatus, type Unit } from "@/lib/types";
import { StatusChip } from "@/components/ui/status-chip";
import { computeUnitFlags, FLAG_LABELS, FLAG_CLASSES } from "@/lib/unit-flags";
import {
  type DashboardIssue,
  DASHBOARD_ISSUE_LABELS,
  DASHBOARD_ISSUE_CLASSES,
} from "@/lib/dashboard-issues";

interface ScopedResultsPanelProps {
  units: Unit[];
  today: string;
  unitHref: (id: string) => string;
  selectedStatus: UnitStatus | null;
  selectedIssue: DashboardIssue | null;
  onClearStatus: () => void;
  onClearIssue: () => void;
  issueDetailsByUnitId?: Map<string, string[]>;
  hideClient?: boolean;
}

export function ScopedResultsPanel({
  units,
  today,
  unitHref,
  selectedStatus,
  selectedIssue,
  onClearStatus,
  onClearIssue,
  issueDetailsByUnitId,
  hideClient = false,
}: ScopedResultsPanelProps) {
  const flaggedUnits = units.map((u) => ({
    ...u,
    flags: computeUnitFlags(u, today),
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3"
    >
      {/* Active selection chips + unit count */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {selectedStatus && (
            <button
              type="button"
              onClick={onClearStatus}
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-accent/10 border border-accent/20 text-[11px] font-semibold text-accent"
            >
              {UNIT_STATUS_LABELS[selectedStatus]}
              <X size={9} weight="bold" />
            </button>
          )}
          {selectedIssue && (
            <button
              type="button"
              onClick={onClearIssue}
              className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold ${DASHBOARD_ISSUE_CLASSES[selectedIssue].badge}`}
            >
              {DASHBOARD_ISSUE_LABELS[selectedIssue]}
              <X size={9} weight="bold" />
            </button>
          )}
        </div>
        <span className="text-[11px] font-semibold font-mono text-tertiary flex-shrink-0">
          {units.length} unit{units.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Unit cards */}
      {flaggedUnits.length === 0 ? (
        <div className="surface-card py-8 text-center">
          <p className="text-[13px] text-muted">No units match the current selection.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {flaggedUnits.map((unit) => (
            <Link
              key={unit.id}
              href={unitHref(unit.id)}
              className="surface-card px-4 py-3 flex flex-col gap-1.5 active:scale-[0.99] transition-all group"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-foreground leading-none mb-0.5">
                    {unit.unitNumber}
                  </p>
                  <p className="text-[11px] text-tertiary truncate">
                    {hideClient ? unit.buildingName : `${unit.buildingName} · ${unit.clientName}`}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <StatusChip status={unit.status} />
                  <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm">
                    <ArrowRight size={14} weight="bold" className="text-white" />
                  </div>
                </div>
              </div>

              {unit.flags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {unit.flags.map((f) => (
                    <span
                      key={f}
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${FLAG_CLASSES[f]}`}
                    >
                      {FLAG_LABELS[f]}
                    </span>
                  ))}
                </div>
              )}

              {issueDetailsByUnitId?.get(unit.id)?.length ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-800">
                  {issueDetailsByUnitId.get(unit.id)?.map((detail, index) => (
                    <p key={`${unit.id}-${index}`} className="leading-relaxed">
                      {detail}
                    </p>
                  ))}
                </div>
              ) : null}

              <div className="flex items-center justify-between text-[10px] font-mono text-muted border-t border-border/50 pt-1.5">
                <span>
                  Bracket: {unit.bracketingDate ?? "—"} · Install:{" "}
                  {unit.installationDate ?? "—"}
                </span>
                {unit.assignedInstallerName ? (
                  <span className="flex items-center gap-0.5 text-secondary">
                    <UserCircle size={10} />
                    {unit.assignedInstallerName}
                  </span>
                ) : (
                  <span className="text-zinc-400 italic">Unassigned</span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </motion.div>
  );
}
