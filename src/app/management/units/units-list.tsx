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
import { Button } from "@/components/ui/button";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { CreatedDateFilter } from "@/components/ui/created-date-filter";
import { BulkAssignSheet } from "@/components/units/bulk-assign-sheet";
import { isCreatedOnLocalDay, type AddedDateFilter } from "@/lib/created-date";
import { UNIT_STATUS_LABELS } from "@/lib/types";

export function UnitsList({ data }: { data: AppDataset }) {
  const { units, clients, buildings, installers } = data;

  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [installerFilter, setInstallerFilter] = useState("all");
  const [dateAddedFilter, setDateAddedFilter] = useState<AddedDateFilter>("all");
  const [sortOrder, setSortOrder] = useState<string>("none");
  const [issueFilter, setIssueFilter] = useState<"all" | "has_issues" | "no_issues">("all");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkSheet, setShowBulkSheet] = useState(false);

  const availableBuildings = useMemo(
    () => clientFilter === "all" ? buildings : buildings.filter((b) => b.clientId === clientFilter),
    [buildings, clientFilter]
  );

  const unitIdsWithIssues = useMemo(() => getUnitIdsWithWindowEscalations(data), [data]);

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
      if (installerFilter === "__unassigned__") {
        if (u.assignedInstallerId) return false;
      } else if (installerFilter !== "all" && u.assignedInstallerId !== installerFilter) {
        return false;
      }
      if (dateAddedFilter !== "all" && !isCreatedOnLocalDay(u.createdAt, dateAddedFilter)) return false;
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
    dateAddedFilter,
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
        const ta = new Date(a.installationDate).getTime();
        const tb = new Date(b.installationDate).getTime();
        return sortOrder === "install_asc" ? ta - tb : tb - ta;
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
    dateAddedFilter !== "all",
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

  const statusOptions = [
    { value: "all", label: "All statuses" },
    ...Object.entries(UNIT_STATUS_LABELS).map(([v, label]) => ({ value: v, label })),
  ];

  const installerOptions = [
    { value: "all", label: "All installers" },
    { value: "__unassigned__", label: "Unassigned" },
    ...installers.map((i) => ({ value: i.id, label: i.name })),
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
    <div className="flex flex-col pb-32">
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
      />

      {/* Search */}
      <div className="px-4 pt-3 pb-2">
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
      <div className="px-4 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center gap-1.5 flex-shrink-0 text-zinc-400">
            <FunnelSimple size={14} />
            {activeFilterCount > 0 && (
              <span className="text-[10px] font-bold bg-accent text-white rounded-full w-4 h-4 flex items-center justify-center">
                {activeFilterCount}
              </span>
            )}
          </div>
          <FilterDropdown label="Client" value={clientFilter} options={clientOptions} onChange={(v) => { setClientFilter(v); setBuildingFilter("all"); }} />
          <FilterDropdown label="Building" value={buildingFilter} options={buildingOptions} onChange={setBuildingFilter} />
          <FilterDropdown label="Status" value={statusFilter} options={statusOptions} onChange={setStatusFilter} />
          <FilterDropdown label="Installer" value={installerFilter} options={installerOptions} onChange={setInstallerFilter} />
          <CreatedDateFilter value={dateAddedFilter} onChange={setDateAddedFilter} />
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
                setDateAddedFilter("all");
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
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pb-2 overflow-hidden"
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

      {/* Unit cards */}
      <div className="px-4 flex flex-col gap-2">
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
                    <div className="flex flex-col gap-1 items-start">
                      <StatusChip status={unit.status} />
                      {unit.installationDate && (
                        <span className="flex items-center gap-1 text-[11px] text-tertiary font-mono">
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
                        <ArrowRight size={14} className="text-zinc-400" />
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1 items-start">
                        <StatusChip status={unit.status} />
                        {unit.installationDate && (
                          <span className="flex items-center gap-1 text-[11px] text-tertiary font-mono">
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

      {/* Bulk assign sheet */}
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
