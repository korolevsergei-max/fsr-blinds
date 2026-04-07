"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CalendarBlank,
  CalendarCheck,
  CheckSquare,
  FunnelSimple,
  MagnifyingGlass,
  Square,
  UserCircle,
  Users,
  X,
  Trash,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { getUnitIdsWithWindowEscalations } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { CreatedDateFilter } from "@/components/ui/created-date-filter";
import { BulkAssignSheet } from "@/components/units/bulk-assign-sheet";
import { BulkAssignSchedulerSheet } from "@/components/units/bulk-assign-scheduler-sheet";
import {
  isCreatedOnLocalDay,
  isStoredDateOnLocalDay,
  formatStoredDateForDisplay,
  createdAtToLocalYmd,
  type AddedDateFilter,
} from "@/lib/created-date";
import { getFloor } from "@/lib/app-dataset";
import { UNIT_STATUS_LABELS } from "@/lib/types";
import type { Scheduler } from "@/lib/types";

export function UnitsList({
  data,
  schedulers = [],
  unitSchedulerByUnit = {},
  userRole,
}: {
  data: AppDataset;
  schedulers?: Scheduler[];
  unitSchedulerByUnit?: Record<string, string>;
  userRole?: string;
}) {
  const { units, clients, buildings, installers } = data;

  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [installerFilter, setInstallerFilter] = useState("all");
  const [schedulerFilter, setSchedulerFilter] = useState("all");
  const [floorFilter, setFloorFilter] = useState("all");
  const [dateAddedFilter, setDateAddedFilter] = useState<AddedDateFilter>("all");
  const [completeByFilter, setCompleteByFilter] = useState<AddedDateFilter>("all");
  const [sortOrder, setSortOrder] = useState<string>("none");
  const [issueFilter, setIssueFilter] = useState<"all" | "has_issues" | "no_issues">("all");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkSheet, setShowBulkSheet] = useState(false);
  const [showSchedulerSheet, setShowSchedulerSheet] = useState(false);
  const [showDatesSheet, setShowDatesSheet] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  function openBulkAssignInstaller() {
    setShowSchedulerSheet(false);
    setShowDatesSheet(false);
    setShowBulkSheet(true);
  }

  function openBulkAssignScheduler() {
    setShowBulkSheet(false);
    setShowDatesSheet(false);
    setShowSchedulerSheet(true);
  }

  function openBulkSetDates() {
    setShowBulkSheet(false);
    setShowSchedulerSheet(false);
    setShowDatesSheet(true);
  }

  const selectedUnitsData = useMemo(
    () => units.filter((u) => selectedIds.has(u.id)),
    [units, selectedIds]
  );

  const selectionSummary = useMemo(() => {
    if (selectedUnitsData.length === 0) return null;

    const installerNames = new Set(
      selectedUnitsData.map((u) => u.assignedInstallerName).filter(Boolean)
    );
    const assignedSchedIds = new Set(
      selectedUnitsData.map((u) => unitSchedulerByUnit[u.id]).filter(Boolean)
    );

    let installerLabel = "Unassigned";
    if (installerNames.size === 1) {
      installerLabel = Array.from(installerNames)[0]! as string;
    } else if (installerNames.size > 1) {
      installerLabel = "Multiple";
    }

    let schedulerLabel = "Unassigned";
    if (assignedSchedIds.size === 1) {
      const sId = Array.from(assignedSchedIds)[0]!;
      const s = schedulers.find((sch) => sch.id === sId);
      schedulerLabel = s?.name || "Assigned";
    } else if (assignedSchedIds.size > 1) {
      schedulerLabel = "Multiple";
    }

    return { installerLabel, schedulerLabel };
  }, [selectedUnitsData, unitSchedulerByUnit, schedulers]);

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    setIsDeleting(true);
    try {
      const { bulkDeleteUnits } = await import("@/app/actions/management-actions");
      const result = await bulkDeleteUnits([...selectedIds]);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      exitSelectMode();
      setShowDeleteConfirm(false);
    } catch (err) {
      alert("Failed to delete units.");
    } finally {
      setIsDeleting(false);
    }
  }

  const availableBuildings = useMemo(
    () => clientFilter === "all" ? buildings : buildings.filter((b) => b.clientId === clientFilter),
    [buildings, clientFilter]
  );

  const availableFloors = useMemo(() => {
    const possibleUnits = units.filter(u => {
      if (clientFilter !== "all" && u.clientId !== clientFilter) return false;
      if (buildingFilter !== "all" && u.buildingId !== buildingFilter) return false;
      return true;
    });
    const floors = new Set<string>();
    possibleUnits.forEach(u => floors.add(getFloor(u.unitNumber)));
    return Array.from(floors).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
  }, [units, clientFilter, buildingFilter]);

  const unitIdsWithIssues = useMemo(() => getUnitIdsWithWindowEscalations(data), [data]);

  const unitsForDateOptions = useMemo(() => {
    return units.filter((u) => {
      if (clientFilter !== "all" && u.clientId !== clientFilter) return false;
      if (buildingFilter !== "all" && u.buildingId !== buildingFilter) return false;
      return true;
    });
  }, [units, clientFilter, buildingFilter]);

  const distinctAddedDates = useMemo(() => {
    const set = new Set<string>();
    for (const u of unitsForDateOptions) {
      const ymd = createdAtToLocalYmd(u.createdAt);
      if (ymd) set.add(ymd);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [unitsForDateOptions]);

  const distinctCompleteByDates = useMemo(() => {
    const set = new Set<string>();
    for (const u of unitsForDateOptions) {
      if (u.completeByDate) set.add(u.completeByDate);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [unitsForDateOptions]);

  const filtered = useMemo(() => {
    return units.filter((u) => {
      if (search) {
        const q = search.toLowerCase();
        if (
          !u.unitNumber.toLowerCase().includes(q) &&
          !u.buildingName.toLowerCase().includes(q) &&
          !u.clientName.toLowerCase().includes(q)
        ) return false;
      }
      if (clientFilter !== "all" && u.clientId !== clientFilter) return false;
      if (buildingFilter !== "all" && u.buildingId !== buildingFilter) return false;
      if (statusFilter !== "all" && u.status !== statusFilter) return false;
      if (installerFilter === "__unassigned_installer__") {
        if (u.assignedInstallerId) return false;
      } else if (installerFilter !== "all" && u.assignedInstallerId !== installerFilter) {
        return false;
      }
      const assignedSchedulerId = unitSchedulerByUnit[u.id];
      if (schedulerFilter === "__unassigned_scheduler__") {
        if (assignedSchedulerId) return false;
      } else if (schedulerFilter !== "all" && assignedSchedulerId !== schedulerFilter) {
        return false;
      }
      if (floorFilter !== "all" && getFloor(u.unitNumber) !== floorFilter) return false;
      if (dateAddedFilter !== "all" && !isCreatedOnLocalDay(u.createdAt, dateAddedFilter)) return false;
      if (completeByFilter !== "all" && !isStoredDateOnLocalDay(u.completeByDate, completeByFilter)) return false;
      if (issueFilter === "has_issues" && !unitIdsWithIssues.has(u.id)) return false;
      if (issueFilter === "no_issues" && unitIdsWithIssues.has(u.id)) return false;
      return true;
    });
  }, [
    units,
    search,
    clientFilter,
    buildingFilter,
    statusFilter,
    installerFilter,
    schedulerFilter,
    unitSchedulerByUnit,
    floorFilter,
    dateAddedFilter,
    completeByFilter,
    issueFilter,
    unitIdsWithIssues,
  ]);

  const sortedFiltered = useMemo(() => {
    if (sortOrder === "none") return filtered;
    return [...filtered].sort((a, b) => {
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
  }, [filtered, sortOrder]);

  const activeFilterCount = [
    clientFilter !== "all",
    buildingFilter !== "all",
    statusFilter !== "all",
    installerFilter !== "all",
    schedulerFilter !== "all",
    floorFilter !== "all",
    dateAddedFilter !== "all",
    completeByFilter !== "all",
    sortOrder !== "none",
    issueFilter !== "all",
  ].filter(Boolean).length;

  const allFilteredSelected = filtered.length > 0 && filtered.every((u) => selectedIds.has(u.id));

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
        filtered.forEach((u) => next.delete(u.id));
        return next;
      });
    } else {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filtered.forEach((u) => next.add(u.id));
        return next;
      });
    }
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  const clientOptions = [
    { value: "all", label: "All clients" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];

  const buildingOptions = [
    { value: "all", label: "All buildings" },
    ...availableBuildings.map((b) => ({ value: b.id, label: b.name })),
  ];

  const floorOptions = [
    { value: "all", label: "All floors" },
    ...availableFloors.map((f) => ({ value: f, label: `Floor ${f}` })),
  ];

  const statusOptions = [
    { value: "all", label: "All statuses" },
    ...Object.entries(UNIT_STATUS_LABELS).map(([v, label]) => ({ value: v, label })),
  ];

  const installerOptions = [
    { value: "all", label: "All installers" },
    { value: "__unassigned_installer__", label: "Unassigned installer" },
    ...installers.map((i) => ({ value: i.id, label: i.name })),
  ];

  const schedulerOptions = [
    { value: "all", label: "All schedulers" },
    { value: "__unassigned_scheduler__", label: "Unassigned scheduler" },
    ...schedulers.map((s) => ({ value: s.id, label: s.name })),
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
  const issueOptions = [
    { value: "all", label: "All" },
    { value: "has_issues", label: "Has issues / escalation" },
    { value: "no_issues", label: "No issues" },
  ];

  return (
    <div className="flex flex-col h-[100dvh] overflow-hidden" suppressHydrationWarning>
      <PageHeader
        title="All Units"
        subtitle={`${filtered.length} of ${units.length} units`}
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
              <div className="relative">
                <MagnifyingGlass size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  placeholder="Search units, buildings, clients…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-xl border border-border bg-white text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
            </div>

            {/* Filter bar */}
            <div className="pb-1">
              <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
                <div className="flex items-center gap-1.5 flex-shrink-0 text-zinc-400">
                  <FunnelSimple size={14} />
                  {activeFilterCount > 0 && (
                    <span className="text-[10px] font-bold bg-accent text-white rounded-full w-4 h-4 flex items-center justify-center">
                      {activeFilterCount}
                    </span>
                  )}
                </div>
                <FilterDropdown label="Client" value={clientFilter} options={clientOptions} onChange={(v) => { setClientFilter(v); setBuildingFilter("all"); setFloorFilter("all"); }} />
                <FilterDropdown label="Building" value={buildingFilter} options={buildingOptions} onChange={(v) => { setBuildingFilter(v); setFloorFilter("all"); }} />
                <FilterDropdown label="Floor" value={floorFilter} options={floorOptions} onChange={setFloorFilter} />
                <FilterDropdown label="Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
                <FilterDropdown label="Installer" value={installerFilter} options={installerOptions} onChange={setInstallerFilter} />
                <FilterDropdown label="Scheduler" value={schedulerFilter} options={schedulerOptions} onChange={setSchedulerFilter} />
                <CreatedDateFilter
                  value={dateAddedFilter}
                  onChange={setDateAddedFilter}
                  distinctDates={distinctAddedDates}
                />
                <CreatedDateFilter
                  value={completeByFilter}
                  onChange={setCompleteByFilter}
                  label="Complete by"
                  distinctDates={distinctCompleteByDates}
                />
                <FilterDropdown
                  label="Issues"
                  value={issueFilter}
                  options={issueOptions}
                  onChange={(v) => setIssueFilter(v as typeof issueFilter)}
                />
                <FilterDropdown label="Sort" value={sortOrder} options={sortOptions} onChange={setSortOrder} />
                {activeFilterCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setClientFilter("all");
                      setBuildingFilter("all");
                      setStatusFilter("all");
                      setInstallerFilter("all");
                      setSchedulerFilter("all");
                      setFloorFilter("all");
                      setDateAddedFilter("all");
                      setCompleteByFilter("all");
                      setIssueFilter("all");
                      setSortOrder("none");
                    }}
                    className="flex-shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-full text-xs font-medium text-red-500 border border-red-200 bg-red-50 hover:bg-red-100 transition-colors"
                  >
                    <X size={11} weight="bold" />
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Select-all row */}
            <AnimatePresence>
              {selectMode && (
                <motion.div
                  key="select-all-row"
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
                    {allFilteredSelected ? "Deselect all" : `Select all ${filtered.length}`}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        }
      />

      {/* Unit cards */}
      <div className="flex-1 overflow-y-auto px-4 flex flex-col gap-2 mt-2 pb-32">
        {sortedFiltered.length === 0 && (
          <div className="py-12 text-center text-muted text-sm">No units match your filters</div>
        )}
        {sortedFiltered.map((unit, i) => {
          const isSelected = selectedIds.has(unit.id);
          return (
            <motion.div
              key={unit.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              {selectMode ? (
                <button
                  type="button"
                  onClick={() => toggleUnit(unit.id)}
                  className={`w-full text-left bg-card rounded-[var(--radius-lg)] border px-4 py-3.5 transition-all active:scale-[0.99] ${
                    isSelected ? "border-accent bg-emerald-50/60" : "border-border hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-start gap-2.5">
                      {isSelected ? (
                        <CheckSquare size={18} weight="fill" className="text-accent mt-0.5 flex-shrink-0" />
                      ) : (
                        <Square size={18} className="text-zinc-300 mt-0.5 flex-shrink-0" />
                      )}
                      <div>
                        <p className="text-[14px] font-semibold text-foreground tracking-tight">{unit.unitNumber}</p>
                        <p className="text-[12px] text-tertiary">{unit.buildingName} &bull; {unit.clientName}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pl-[26px]">
                      <div className="flex flex-col gap-1 items-start" suppressHydrationWarning>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusChip status={unit.status} />
                          {unit.manufacturingRiskFlag && unit.manufacturingRiskFlag !== "green" && (
                            <span className={[
                              "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border",
                              unit.manufacturingRiskFlag === "red"
                                ? "bg-red-50 text-red-600 border-red-200"
                                : "bg-yellow-50 text-yellow-600 border-yellow-200",
                            ].join(" ")}>
                              MFG
                            </span>
                          )}
                        </div>
                        {unit.installationDate && (
                          <span className="flex items-center gap-1 text-[11px] text-tertiary font-mono" suppressHydrationWarning>
                            <CheckSquare size={12} />
                            Install: {unit.installationDate}
                          </span>
                        )}
                      </div>
                    {unit.assignedInstallerName && (
                      <span className="flex items-center gap-1 text-[12px] text-secondary">
                        <UserCircle size={14} />
                        {unit.assignedInstallerName}
                      </span>
                    )}
                  </div>
                </button>
              ) : (
                <Link href={`/management/units/${unit.id}`}>
                  <div className="bg-card rounded-[var(--radius-lg)] border border-border px-4 py-3.5 hover:border-zinc-300 hover:shadow-[var(--shadow-md)] transition-all active:scale-[0.99]">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="text-[14px] font-semibold text-foreground tracking-tight">{unit.unitNumber}</p>
                        <p className="text-[12px] text-tertiary">{unit.buildingName} &bull; {unit.clientName}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center shadow-sm">
                          <ArrowRight size={14} weight="bold" className="text-white" />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1 items-start" suppressHydrationWarning>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <StatusChip status={unit.status} />
                          {unit.manufacturingRiskFlag && unit.manufacturingRiskFlag !== "green" && (
                            <span className={[
                              "text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border",
                              unit.manufacturingRiskFlag === "red"
                                ? "bg-red-50 text-red-600 border-red-200"
                                : "bg-yellow-50 text-yellow-600 border-yellow-200",
                            ].join(" ")}>
                              MFG
                            </span>
                          )}
                        </div>
                        {unit.installationDate && (
                          <span className="flex items-center gap-1 text-[11px] text-tertiary font-mono" suppressHydrationWarning>
                            <CheckSquare size={12} />
                            Install: {unit.installationDate}
                          </span>
                        )}
                        {unit.completeByDate && (
                          <span className="flex items-center gap-1 text-[11px] text-amber-600 font-medium" suppressHydrationWarning>
                            Due: {formatStoredDateForDisplay(unit.completeByDate)}
                          </span>
                        )}
                      </div>
                      {unit.assignedInstallerName && (
                        <span className="flex items-center gap-1 text-[12px] text-secondary">
                          <UserCircle size={14} />
                          {unit.assignedInstallerName}
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Floating bulk action bar */}
      <AnimatePresence>
        {selectMode && selectedIds.size > 0 && (
          <motion.div
            key="bulk-bar"
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 300 }}
            className="fixed bottom-20 left-4 right-4 z-20"
          >
            <div className="bg-foreground rounded-[var(--radius-xl)] px-3 py-3 sm:px-4 shadow-2xl flex flex-col gap-3 min-w-[320px]">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <div className="flex flex-col">
                  <span className="text-sm font-semibold text-white">
                    {selectedIds.size} unit{selectedIds.size !== 1 ? "s" : ""} selected
                  </span>
                  {selectionSummary && (
                    <div className="flex items-center gap-3 mt-0.5">
                      <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                        <Users size={12} weight="fill" className="text-zinc-500" />
                        <span className="truncate max-w-[80px]">{selectionSummary.installerLabel}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                        <CalendarCheck size={12} weight="fill" className="text-zinc-500" />
                        <span className="truncate max-w-[80px]">{selectionSummary.schedulerLabel}</span>
                      </div>
                    </div>
                  )}
                </div>
                {userRole === "owner" && (
                  <button
                    type="button"
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all border border-red-500/20"
                  >
                    <Trash size={14} weight="bold" />
                    Delete
                  </button>
                )}
              </div>
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5 sm:pb-0 sm:flex-wrap sm:justify-start sm:overflow-visible">
                <Button
                  size="sm"
                  type="button"
                  onClick={openBulkAssignInstaller}
                  className="!bg-white !text-zinc-900 hover:!bg-zinc-100 shrink-0 text-[12px] h-8"
                >
                  <Users size={14} className="shrink-0" />
                  Assign Installer
                </Button>
                <Button
                  size="sm"
                  type="button"
                  onClick={openBulkAssignScheduler}
                  className="!bg-sky-500 !text-white hover:!bg-sky-600 shrink-0 text-[12px] h-8"
                >
                  <CalendarCheck size={14} className="shrink-0" />
                  Assign Scheduler
                </Button>
                <Button
                  size="sm"
                  type="button"
                  onClick={openBulkSetDates}
                  className="!bg-zinc-800 !text-white border border-white/15 hover:!bg-zinc-700 shrink-0 text-[12px] h-8"
                >
                  <CalendarBlank size={14} className="shrink-0" />
                  Set Dates
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk assign installer */}
      <AnimatePresence>
        {showBulkSheet && (
          <BulkAssignSheet
            key="bulk-assign-installer"
            unitIds={[...selectedIds]}
            installers={installers}
            onClose={() => setShowBulkSheet(false)}
            onSuccess={exitSelectMode}
            showCompleteBy
          />
        )}
      </AnimatePresence>

      {/* Bulk set dates only */}
      <AnimatePresence>
        {showDatesSheet && (
          <BulkAssignSheet
            key="bulk-set-dates"
            unitIds={[...selectedIds]}
            installers={installers}
            onClose={() => setShowDatesSheet(false)}
            onSuccess={exitSelectMode}
            showCompleteBy
            variant="datesOnly"
          />
        )}
      </AnimatePresence>

      {/* Bulk assign scheduler */}
      <AnimatePresence>
        {showSchedulerSheet && (
          <BulkAssignSchedulerSheet
            key="bulk-assign-scheduler"
            unitIds={[...selectedIds]}
            schedulers={schedulers}
            onClose={() => setShowSchedulerSheet(false)}
            onSuccess={exitSelectMode}
          />
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div key="delete-confirm-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              key="delete-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !isDeleting && setShowDeleteConfirm(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              key="delete-dialog"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-[340px] bg-white rounded-[24px] overflow-hidden shadow-2xl"
            >
              <div className="p-6 text-center">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
                  <Trash size={24} className="text-red-500" />
                </div>
                <h3 className="text-lg font-bold text-zinc-900 mb-2">Confirm Delete</h3>
                <p className="text-sm text-zinc-500 leading-relaxed mb-6">
                  Are you sure you want to delete {selectedIds.size} unit{selectedIds.size !== 1 ? "s" : ""}? 
                  This action cannot be undone.
                </p>
                <div className="flex flex-col gap-2">
                  <Button
                    size="lg"
                    onClick={handleBulkDelete}
                    disabled={isDeleting}
                    className="w-full !bg-red-500 hover:!bg-red-600 !text-white border-none h-11 rounded-xl font-bold"
                  >
                    {isDeleting ? "Deleting..." : `Delete ${selectedIds.size} Units`}
                  </Button>
                  <Button
                    size="lg"
                    variant="secondary"
                    disabled={isDeleting}
                    onClick={() => setShowDeleteConfirm(false)}
                    className="w-full !bg-zinc-100 hover:!bg-zinc-200 !text-zinc-600 border-none h-11 rounded-xl font-bold"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
