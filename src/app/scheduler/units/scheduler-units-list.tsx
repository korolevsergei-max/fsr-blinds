"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, FunnelSimple, MagnifyingGlass, UserCircle, X } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader } from "@/components/ui/page-header";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { computeUnitFlags, FLAG_LABELS, FLAG_CLASSES, type UnitFlag } from "@/lib/unit-flags";

function FlagBadge({ flag }: { flag: UnitFlag }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-semibold ${FLAG_CLASSES[flag]}`}>
      {FLAG_LABELS[flag]}
    </span>
  );
}

export function SchedulerUnitsList({ data }: { data: AppDataset }) {
  const { units, clients, buildings, installers } = data;
  const today = new Date().toISOString().split("T")[0];

  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [installerFilter, setInstallerFilter] = useState("all");
  const [flagFilter, setFlagFilter] = useState("all");

  const availableBuildings = useMemo(
    () => clientFilter === "all" ? buildings : buildings.filter((b) => b.clientId === clientFilter),
    [buildings, clientFilter]
  );

  const filteredUnits = useMemo(() => {
    return units
      .map((u) => ({ ...u, flags: computeUnitFlags(u, today) }))
      .filter((u) => {
        if (search && !u.unitNumber.toLowerCase().includes(search.toLowerCase()) &&
            !u.buildingName.toLowerCase().includes(search.toLowerCase())) return false;
        if (clientFilter !== "all" && u.clientId !== clientFilter) return false;
        if (buildingFilter !== "all" && u.buildingId !== buildingFilter) return false;
        if (installerFilter === "__unassigned__") {
          if (u.assignedInstallerId) return false;
        } else if (installerFilter !== "all" && u.assignedInstallerId !== installerFilter) {
          return false;
        }
        if (flagFilter !== "all" && !u.flags.includes(flagFilter as UnitFlag)) return false;
        return true;
      });
  }, [units, today, search, clientFilter, buildingFilter, installerFilter, flagFilter]);

  const clientOptions = [
    { value: "all", label: "All clients" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];
  const buildingOptions = [
    { value: "all", label: "All buildings" },
    ...availableBuildings.map((b) => ({ value: b.id, label: b.name })),
  ];
  const installerOptions = [
    { value: "all", label: "All installers" },
    { value: "__unassigned__", label: "Unassigned" },
    ...installers.map((i) => ({ value: i.id, label: i.name })),
  ];
  const flagOptions = [
    { value: "all", label: "All units" },
    { value: "past_install_due", label: "Past Install Date" },
    { value: "past_bracketing_due", label: "Past Bracketing Date" },
    { value: "missing_installer", label: "No Installer" },
    { value: "missing_bracketing_date", label: "No Bracket Date" },
    { value: "at_risk", label: "At Risk" },
  ];

  const activeFilterCount = [
    clientFilter !== "all",
    buildingFilter !== "all",
    installerFilter !== "all",
    flagFilter !== "all",
  ].filter(Boolean).length;

  return (
    <div className="flex flex-col">
      <PageHeader title="Units" />

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 px-3 h-10 rounded-[var(--radius-md)] border border-border bg-surface">
          <MagnifyingGlass size={15} className="text-zinc-400 flex-shrink-0" />
          <input
            type="search"
            placeholder="Search by unit or building…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-transparent text-[13px] outline-none text-foreground placeholder:text-muted"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")}>
              <X size={13} className="text-zinc-400" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 pb-3 flex items-center gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 flex-shrink-0 text-zinc-400">
          <FunnelSimple size={13} />
          {activeFilterCount > 0 && (
            <span className="text-[9px] font-bold bg-accent text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </div>
        <FilterDropdown
          label="Client"
          value={clientFilter}
          options={clientOptions}
          onChange={(v) => { setClientFilter(v); setBuildingFilter("all"); }}
        />
        <FilterDropdown label="Building" value={buildingFilter} options={buildingOptions} onChange={setBuildingFilter} />
        <FilterDropdown label="Installer" value={installerFilter} options={installerOptions} onChange={setInstallerFilter} />
        <FilterDropdown label="Flag" value={flagFilter} options={flagOptions} onChange={setFlagFilter} />
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => { setClientFilter("all"); setBuildingFilter("all"); setInstallerFilter("all"); setFlagFilter("all"); }}
            className="flex-shrink-0 flex items-center gap-1 h-7 px-2 rounded-full text-[11px] font-medium text-red-500 border border-red-200 bg-red-50"
          >
            <X size={10} weight="bold" /> Clear
          </button>
        )}
      </div>

      {/* Count */}
      <div className="px-4 pb-2">
        <p className="text-[11px] text-muted font-medium">
          {filteredUnits.length} unit{filteredUnits.length !== 1 ? "s" : ""}
        </p>
      </div>

      {/* List */}
      <div className="px-4 flex flex-col gap-2 pb-24">
        {filteredUnits.length === 0 && (
          <div className="text-center py-12 text-[13px] text-tertiary">
            No units match your filters.
          </div>
        )}
        {filteredUnits.map((unit) => (
          <Link
            key={unit.id}
            href={`/scheduler/units/${unit.id}`}
            className="group surface-card px-4 py-3.5 flex flex-col gap-2 active:scale-[0.99] transition-all"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[14px] font-semibold text-foreground">{unit.unitNumber}</p>
                <p className="text-[12px] text-tertiary">{unit.buildingName} · {unit.clientName}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip status={unit.status} />
                <ArrowRight size={13} className="text-zinc-300 group-hover:text-accent transition-colors flex-shrink-0" />
              </div>
            </div>

            {unit.flags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {unit.flags.map((f) => <FlagBadge key={f} flag={f} />)}
              </div>
            )}

            <div className="flex items-center justify-between text-[11px] font-mono text-muted border-t border-border/60 pt-2">
              <span>
                Bracket: {unit.bracketingDate ?? "—"} · Install: {unit.installationDate ?? "—"}
              </span>
              {unit.assignedInstallerName ? (
                <span className="flex items-center gap-1 text-secondary">
                  <UserCircle size={11} />
                  {unit.assignedInstallerName}
                </span>
              ) : (
                <span className="text-zinc-400 italic">Unassigned</span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
