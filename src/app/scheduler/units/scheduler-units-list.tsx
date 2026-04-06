"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CheckSquare,
  FunnelSimple,
  MagnifyingGlass,
  Square,
  UserCircle,
  Users,
  X,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { getUnitIdsWithWindowEscalations } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader } from "@/components/ui/page-header";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { CreatedDateFilter } from "@/components/ui/created-date-filter";
import { Button } from "@/components/ui/button";
import { BulkAssignSheet } from "@/components/units/bulk-assign-sheet";
import { isCreatedOnLocalDay, isStoredDateOnLocalDay, formatStoredDateForDisplay, type AddedDateFilter } from "@/lib/created-date";
import { UNIT_STATUS_LABELS } from "@/lib/types";
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
  const [statusFilter, setStatusFilter] = useState("all");
  const [installerFilter, setInstallerFilter] = useState("all");
  const [dateAddedFilter, setDateAddedFilter] = useState<AddedDateFilter>("all");
  const [completeByFilter, setCompleteByFilter] = useState<AddedDateFilter>("all");
  const [sortOrder, setSortOrder] = useState<string>("none");
  const [flagFilter, setFlagFilter] = useState("all");
  const [issueFilter, setIssueFilter] = useState<"all" | "has_issues" | "no_issues">("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkSheet, setShowBulkSheet] = useState(false);

  const availableBuildings = useMemo(
    () => clientFilter === "all" ? buildings : buildings.filter((b) => b.clientId === clientFilter),
    [buildings, clientFilter]
  );

  const unitIdsWithIssues = useMemo(() => getUnitIdsWithWindowEscalations(data), [data]);

  const filteredUnits = useMemo(() => {
    return units
      .filter((u) => {
        if (search) {
          const q = search.toLowerCase();
          if (
            !u.unitNumber.toLowerCase().includes(q) &&
            !u.buildingName.toLowerCase().includes(q) &&
            !u.clientName.toLowerCase().includes(q)
          ) {
            return false;
          }
        }
        if (clientFilter !== "all" && u.clientId !== clientFilter) return false;
        if (buildingFilter !== "all" && u.buildingId !== buildingFilter) return false;
        if (statusFilter !== "all" && u.status !== statusFilter) return false;
        if (installerFilter === "__unassigned__") {
          if (u.assignedInstallerId) return false;
        } else if (installerFilter !== "all" && u.assignedInstallerId !== installerFilter) {
          return false;
        }
        if (dateAddedFilter !== "all" && !isCreatedOnLocalDay(u.createdAt, dateAddedFilter)) return false;
        if (completeByFilter !== "all" && !isStoredDateOnLocalDay(u.completeByDate, completeByFilter)) return false;
        if (issueFilter === "has_issues" && !unitIdsWithIssues.has(u.id)) return false;
        if (issueFilter === "no_issues" && unitIdsWithIssues.has(u.id)) return false;
        return true;
      })
      .map((u) => ({ ...u, flags: computeUnitFlags(u, today) }))
      .filter((u) => {
        if (flagFilter !== "all" && !u.flags.includes(flagFilter as UnitFlag)) return false;
        return true;
      });
  }, [
    units,
    today,
    search,
    clientFilter,
    buildingFilter,
    statusFilter,
    installerFilter,
    dateAddedFilter,
    completeByFilter,
    flagFilter,
    issueFilter,
    unitIdsWithIssues,
  ]);

  const sortedFilteredUnits = useMemo(() => {
    if (sortOrder === "none") return filteredUnits;
    return [...filteredUnits].sort((a, b) => {
      if (sortOrder === "install_asc" || sortOrder === "install_desc") {
        if (!a.installationDate && !b.installationDate) return 0;
        if (!a.installationDate) return 1;
        if (!b.installationDate) return -1;
        const cmp = a.installationDate.localeCompare(b.installationDate);
        return sortOrder === "install_asc" ? cmp : -cmp;
      }
      if (sortOrder === "unit_asc" || sortOrder === "unit_desc") {
        const cmp = a.unitNumber.localeCompare(b.unitNumber, undefined, {
          numeric: true,
          sensitivity: "base",
        });
        return sortOrder === "unit_asc" ? cmp : -cmp;
      }
      const ta = new Date(a.createdAt ?? 0).getTime();
      const tb = new Date(b.createdAt ?? 0).getTime();
      return sortOrder === "newest" ? tb - ta : ta - tb;
    });
  }, [filteredUnits, sortOrder]);

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
  const issueOptions = [
    { value: "all", label: "All" },
    { value: "has_issues", label: "Has issues / escalation" },
    { value: "no_issues", label: "No issues" },
  ];

  const statusOptions = [
    { value: "all", label: "All statuses" },
    ...Object.entries(UNIT_STATUS_LABELS).map(([v, label]) => ({ value: v, label })),
  ];

  const sortOptions = [
    { value: "none", label: "Default" },
    { value: "newest", label: "Added (Newest)" },
    { value: "oldest", label: "Added (Oldest)" },
    { value: "install_asc", label: "Installation (Earliest)" },
    { value: "install_desc", label: "Installation (Latest)" },
    { value: "unit_asc", label: "Unit Number (Ascending)" },
    { value: "unit_desc", label: "Unit Number (Descending)" },
  ];

  const activeFilterCount = [
    clientFilter !== "all",
    buildingFilter !== "all",
    statusFilter !== "all",
    installerFilter !== "all",
    dateAddedFilter !== "all",
    completeByFilter !== "all",
    sortOrder !== "none",
    flagFilter !== "all",
    issueFilter !== "all",
  ].filter(Boolean).length;

  const allFilteredSelected =
    sortedFilteredUnits.length > 0 && sortedFilteredUnits.every((unit) => selectedIds.has(unit.id));

  function toggleUnit(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAll() {
    if (allFilteredSelected) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        sortedFilteredUnits.forEach((unit) => next.delete(unit.id));
        return next;
      });
      return;
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      sortedFilteredUnits.forEach((unit) => next.add(unit.id));
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  return (
    <div className="flex flex-col pb-32">
      <PageHeader
        title="Units"
        subtitle={`${sortedFilteredUnits.length} of ${units.length} units`}
        actions={
          selectMode ? (
            <button
              type="button"
              onClick={exitSelectMode}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium text-zinc-600 border border-border bg-white hover:bg-zinc-50 transition-all"
            >
              <X size={14} />
              Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSelectMode(true)}
              className="flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-medium text-zinc-600 border border-border bg-white hover:bg-zinc-50 transition-all"
            >
              <CheckSquare size={16} />
              Select
            </button>
          )
        }
        belowTitle={
          <div className="flex flex-col">
            {/* Search */}
            <div className="pt-2 pb-2">
              <div className="flex items-center gap-2 px-3 h-10 rounded-[var(--radius-md)] border border-border bg-surface">
                <MagnifyingGlass size={15} className="text-zinc-400 flex-shrink-0" />
                <input
                  type="search"
                  placeholder="Search units, buildings, clients…"
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
            <div className="pb-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
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
              <FilterDropdown label="Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
              <FilterDropdown label="Installer" value={installerFilter} options={installerOptions} onChange={setInstallerFilter} />
              <CreatedDateFilter value={dateAddedFilter} onChange={setDateAddedFilter} />
              <CreatedDateFilter value={completeByFilter} onChange={setCompleteByFilter} label="Complete by" />
              <FilterDropdown
                label="Issues"
                value={issueFilter}
                options={issueOptions}
                onChange={(v) => setIssueFilter(v as typeof issueFilter)}
              />
              <FilterDropdown label="Sort" value={sortOrder} options={sortOptions} onChange={setSortOrder} />
              <FilterDropdown label="Flag" value={flagFilter} options={flagOptions} onChange={setFlagFilter} />
              {activeFilterCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setClientFilter("all");
                    setBuildingFilter("all");
                    setStatusFilter("all");
                    setInstallerFilter("all");
                    setDateAddedFilter("all");
                    setCompleteByFilter("all");
                    setIssueFilter("all");
                    setSortOrder("none");
                    setFlagFilter("all");
                  }}
                  className="flex-shrink-0 flex items-center gap-1 h-7 px-2 rounded-full text-[11px] font-medium text-red-500 border border-red-200 bg-red-50"
                >
                  <X size={10} weight="bold" /> Clear
                </button>
              )}
            </div>

            {/* Select-all row */}
            <AnimatePresence>
              {selectMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="pt-1 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={toggleAll}
                    className="flex items-center gap-2 text-xs font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
                  >
                    {allFilteredSelected ? (
                      <CheckSquare size={16} weight="fill" className="text-accent" />
                    ) : (
                      <Square size={16} className="text-zinc-400" />
                    )}
                    {allFilteredSelected ? "Deselect all" : `Select all ${sortedFilteredUnits.length}`}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        }
      />

      {/* List */}
      <div className="px-4 flex flex-col gap-2 pb-24">
        {sortedFilteredUnits.length === 0 && (
          <div className="text-center py-12 text-[13px] text-tertiary">
            No units match your filters.
          </div>
        )}
        {sortedFilteredUnits.map((unit, index) => {
          const isSelected = selectedIds.has(unit.id);

          return (
            <motion.div
              key={unit.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.03, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {selectMode ? (
                <button
                  type="button"
                  onClick={() => toggleUnit(unit.id)}
                  className={`w-full text-left surface-card px-4 py-3.5 flex flex-col gap-2 transition-all active:scale-[0.99] ${
                    isSelected ? "border-accent bg-emerald-50/60" : "hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5">
                      {isSelected ? (
                        <CheckSquare size={18} weight="fill" className="text-accent mt-0.5 flex-shrink-0" />
                      ) : (
                        <Square size={18} className="text-zinc-300 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-[14px] font-semibold text-foreground">{unit.unitNumber}</p>
                        <p className="text-[12px] text-tertiary">
                          {unit.buildingName} · {unit.clientName}
                        </p>
                      </div>
                    </div>
                    <StatusChip status={unit.status} />
                  </div>

                  {unit.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pl-[26px]">
                      {unit.flags.map((flag) => (
                        <FlagBadge key={flag} flag={flag} />
                      ))}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] font-mono text-muted border-t border-border/60 pt-2 pl-[26px]">
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
                  {unit.completeByDate && (
                    <div className="pl-[26px] text-[11px] font-medium text-amber-600">
                      Due: {formatStoredDateForDisplay(unit.completeByDate)}
                    </div>
                  )}
                </button>
              ) : (
                <Link
                  href={`/scheduler/units/${unit.id}`}
                  className="group surface-card px-4 py-3.5 flex flex-col gap-2 active:scale-[0.99] transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[14px] font-semibold text-foreground">{unit.unitNumber}</p>
                      <p className="text-[12px] text-tertiary">
                        {unit.buildingName} · {unit.clientName}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusChip status={unit.status} />
                      <ArrowRight
                        size={13}
                        className="text-zinc-300 group-hover:text-accent transition-colors flex-shrink-0"
                      />
                    </div>
                  </div>

                  {unit.flags.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                      {unit.flags.map((flag) => (
                        <FlagBadge key={flag} flag={flag} />
                      ))}
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
                  {unit.completeByDate && (
                    <div className="text-[11px] font-medium text-amber-600">
                      Due: {formatStoredDateForDisplay(unit.completeByDate)}
                    </div>
                  )}
                </Link>
              )}
            </motion.div>
          );
        })}
      </div>

      <AnimatePresence>
        {selectMode && selectedIds.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="fixed bottom-20 left-4 right-4 z-20"
          >
            <div className="bg-foreground rounded-[var(--radius-xl)] px-4 py-3 flex items-center justify-between shadow-2xl">
              <span className="text-sm font-semibold text-white">
                {selectedIds.size} unit{selectedIds.size !== 1 ? "s" : ""} selected
              </span>
              <Button
                size="sm"
                onClick={() => setShowBulkSheet(true)}
                className="!bg-white !text-zinc-900 hover:!bg-zinc-100"
              >
                <Users size={14} />
                Action
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showBulkSheet && (
          <BulkAssignSheet
            unitIds={[...selectedIds]}
            installers={installers}
            onClose={() => setShowBulkSheet(false)}
            onSuccess={exitSelectMode}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
