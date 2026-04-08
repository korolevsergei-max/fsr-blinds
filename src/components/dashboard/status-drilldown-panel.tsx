"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, UserCircle, X } from "@phosphor-icons/react";
import type { Unit, UnitStatus } from "@/lib/types";
import { StatusChip } from "@/components/ui/status-chip";
import { SectionLabel } from "@/components/ui/section-label";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import {
  computeUnitFlags,
  FLAG_LABELS,
  FLAG_CLASSES,
  type UnitFlag,
} from "@/lib/unit-flags";

interface StatusDrilldownPanelProps {
  status: UnitStatus;
  units: Unit[];
  today: string;
  unitHref: (unitId: string) => string;
  onClose: () => void;
}

function FlagBadge({ flag }: { flag: UnitFlag }) {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${FLAG_CLASSES[flag]}`}
    >
      {FLAG_LABELS[flag]}
    </span>
  );
}

export function StatusDrilldownPanel({
  status,
  units,
  today,
  unitHref,
  onClose,
}: StatusDrilldownPanelProps) {
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string[]>([]);

  // Derive unique client options from the scoped units
  const clientOptions = useMemo(() => {
    const seen = new Map<string, string>();
    units.forEach((u) => {
      if (!seen.has(u.clientId)) seen.set(u.clientId, u.clientName);
    });
    return [
      { value: "all", label: "All clients" },
      ...Array.from(seen.entries()).map(([id, name]) => ({ value: id, label: name })),
    ];
  }, [units]);

  // Derive available buildings — cascade from selected client
  const buildingOptions = useMemo(() => {
    const seen = new Map<string, string>();
    units.forEach((u) => {
      if (clientFilter.length > 0 && !clientFilter.includes(u.clientId)) return;
      if (!seen.has(u.buildingId)) seen.set(u.buildingId, u.buildingName);
    });
    return [
      { value: "all", label: "All buildings" },
      ...Array.from(seen.entries()).map(([id, name]) => ({ value: id, label: name })),
    ];
  }, [units, clientFilter]);

  // Apply sub-filters to the status-scoped units
  const filteredUnits = useMemo(() => {
    return units.filter((u) => {
      if (clientFilter.length > 0 && !clientFilter.includes(u.clientId)) return false;
      if (buildingFilter.length > 0 && !buildingFilter.includes(u.buildingId)) return false;
      return true;
    });
  }, [units, clientFilter, buildingFilter]);

  const flaggedUnits = useMemo(
    () => filteredUnits.map((u) => ({ ...u, flags: computeUnitFlags(u, today) })),
    [filteredUnits, today]
  );

  // Count occurrences of each flag across the filtered units
  const flagCounts = useMemo(() => {
    const counts = new Map<UnitFlag, number>();
    flaggedUnits.forEach((u) => {
      u.flags.forEach((f) => counts.set(f, (counts.get(f) ?? 0) + 1));
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [flaggedUnits]);

  const hasSubFilter = clientFilter.length > 0 || buildingFilter.length > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-3"
    >
      {/* Panel header: status chip + count + clear */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <StatusChip status={status} />
          <span className="text-[11px] font-semibold text-tertiary font-mono">
            {filteredUnits.length}
            {hasSubFilter && filteredUnits.length !== units.length && (
              <span className="text-muted font-normal"> / {units.length}</span>
            )}{" "}
            unit{filteredUnits.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center gap-1 text-[11px] font-medium text-muted hover:text-secondary transition-colors"
        >
          <X size={12} />
          Clear
        </button>
      </div>

      {/* Sub-filters: only show when there are multiple clients or buildings */}
      {(clientOptions.length > 2 || buildingOptions.length > 2) && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {clientOptions.length > 2 && (
            <FilterDropdown
              multiple
              label="Client"
              values={clientFilter}
              options={clientOptions}
              onChange={(v) => {
                setClientFilter(v);
                setBuildingFilter([]);
              }}
            />
          )}
          {buildingOptions.length > 2 && (
            <FilterDropdown
              multiple
              label="Building"
              values={buildingFilter}
              options={buildingOptions}
              onChange={setBuildingFilter}
            />
          )}
          {hasSubFilter && (
            <button
              type="button"
              onClick={() => { setClientFilter([]); setBuildingFilter([]); }}
              className="flex-shrink-0 flex items-center gap-1 h-7 px-2 rounded-full text-[11px] font-medium text-red-500 border border-red-200 bg-red-50"
            >
              <X size={10} weight="bold" /> Reset
            </button>
          )}
        </div>
      )}

      {/* Exception summary — reacts to sub-filters */}
      {flagCounts.length > 0 && (
        <div>
          <SectionLabel noMargin className="mb-2">
            Exceptions
          </SectionLabel>
          <div
            className="surface-card divide-y divide-border-subtle overflow-hidden"
            style={{ padding: 0 }}
          >
            {flagCounts.map(([flag, count]) => (
              <div
                key={flag}
                className="flex items-center justify-between px-4 py-2.5 gap-3"
              >
                <span className="text-[12px] font-medium text-secondary">
                  {FLAG_LABELS[flag]}
                </span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${FLAG_CLASSES[flag]}`}
                >
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unit list — reacts to sub-filters */}
      <div>
        <SectionLabel noMargin className="mb-2">
          Units
        </SectionLabel>

        {filteredUnits.length === 0 ? (
          <div className="surface-card py-6 text-center">
            <p className="text-[12px] text-muted">
              No units match the selected filters.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {flaggedUnits.map((unit) => (
              <Link
                key={unit.id}
                href={unitHref(unit.id)}
                className="surface-card px-4 py-3 flex flex-col gap-1.5 active:scale-[0.99] transition-all group"
              >
                {/* Top row: unit number + building · client + arrow */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[13px] font-semibold text-foreground leading-none mb-0.5">
                      {unit.unitNumber}
                    </p>
                    <p className="text-[11px] text-tertiary truncate">
                      {unit.buildingName} · {unit.clientName}
                    </p>
                  </div>
                  <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm flex-shrink-0">
                    <ArrowRight size={14} weight="bold" className="text-white" />
                  </div>
                </div>

                {/* Flag badges */}
                {unit.flags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {unit.flags.map((f) => (
                      <FlagBadge key={f} flag={f} />
                    ))}
                  </div>
                )}

                {/* Date + installer row */}
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
      </div>
    </motion.div>
  );
}
