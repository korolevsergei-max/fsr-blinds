"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  CalendarBlank,
  CheckCircle,
  CheckSquare,
  Clock,
  FunnelSimple,
  MagnifyingGlass,
  Square,
  UserCircle,
  Users,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { DATE_RANGE_LABELS, isWithinRange, type DateRange } from "@/lib/date-range";
import { UNIT_STATUS_LABELS } from "@/lib/types";
import { bulkAssignUnits } from "@/app/actions/fsr-data";

type BulkAssignSheetProps = {
  unitIds: string[];
  installers: AppDataset["installers"];
  onClose: () => void;
  onSuccess: () => void;
};

function BulkAssignSheet({ unitIds, installers, onClose, onSuccess }: BulkAssignSheetProps) {
  const [selectedInstaller, setSelectedInstaller] = useState("");
  const [bracketingDate, setBracketingDate] = useState("");
  const [installationDate, setInstallationDate] = useState("");
  const [completeByDate, setCompleteByDate] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    if (!selectedInstaller && !bracketingDate && !installationDate && !completeByDate) return;
    setError("");
    startTransition(async () => {
      const result = await bulkAssignUnits(unitIds, selectedInstaller, bracketingDate, installationDate, undefined, completeByDate);
      if (!result.ok) { setError(result.error); return; }
      setSaved(true);
      setTimeout(() => { onSuccess(); onClose(); }, 900);
    });
  };

  return (
    <>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-30" onClick={onClose} />
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 280 }}
        className="fixed bottom-0 left-0 right-0 z-40 bg-card rounded-t-[var(--radius-xl)] shadow-2xl max-h-[85dvh] overflow-y-auto"
      >
        <div className="px-4 pt-4 pb-2 flex items-center justify-between border-b border-border">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Bulk assign</h2>
            <p className="text-[12px] text-tertiary">{unitIds.length} unit{unitIds.length !== 1 ? "s" : ""} selected</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-zinc-100 transition-colors">
            <X size={18} className="text-zinc-500" />
          </button>
        </div>

        <div className="px-4 py-5 flex flex-col gap-6">
          {error && (
            <div className="rounded-[var(--radius-md)] border px-3.5 py-3 text-[13px] leading-snug font-medium bg-danger-light border-[rgba(200,57,43,0.2)] text-danger">{error}</div>
          )}

          <div>
            <SectionLabel className="flex items-center gap-1.5">
              <Users size={13} className="inline" />Assign installer
            </SectionLabel>
            <div className="flex flex-col gap-2">
              {installers.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  onClick={() => setSelectedInstaller(inst.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-[var(--radius-md)] border text-left transition-all active:scale-[0.98] ${
                    selectedInstaller === inst.id
                      ? "border-accent bg-accent-light"
                      : "border-border bg-card hover:bg-surface"
                  }`}
                >
                  <div className="w-9 h-9 rounded-xl overflow-hidden bg-zinc-200 flex-shrink-0">
                    <img src={inst.avatarUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <span className="flex-1 text-[14px] font-medium text-foreground">{inst.name}</span>
                  {selectedInstaller === inst.id && (
                    <CheckCircle size={18} weight="fill" className="text-accent flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel className="flex items-center gap-1.5">
              <CalendarBlank size={13} className="inline" />Dates (optional)
            </SectionLabel>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-muted mb-1 block">Bracketing Date</label>
                <input
                  type="date"
                  value={bracketingDate}
                  onChange={(e) => setBracketingDate(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Installation Target Date</label>
                <input
                  type="date"
                  value={installationDate}
                  onChange={(e) => setInstallationDate(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
              <div>
                <label className="text-xs text-muted mb-1 block">Complete By Date</label>
                <input
                  type="date"
                  value={completeByDate}
                  onChange={(e) => setCompleteByDate(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
                />
              </div>
            </div>
          </div>

          <div className="pb-32">
            {saved ? (
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center gap-2 h-13 rounded-xl bg-emerald-500 text-white font-semibold"
              >
                <CheckCircle size={20} weight="fill" />
                Assigned
              </motion.div>
            ) : (
              <Button fullWidth size="lg" disabled={(!selectedInstaller && !bracketingDate && !installationDate && !completeByDate) || pending} onClick={handleSave}>
                {pending ? "Saving…" : (!selectedInstaller ? `Update ${unitIds.length} Unit${unitIds.length !== 1 ? "s" : ""}` : `Assign ${unitIds.length} Unit${unitIds.length !== 1 ? "s" : ""}`)}
              </Button>
            )}
          </div>
        </div>
      </motion.div>
    </>
  );
}

export function UnitsList({ data }: { data: AppDataset }) {
  const { units, clients, buildings, installers } = data;

  const [search, setSearch] = useState("");
  const [clientFilter, setClientFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [installerFilter, setInstallerFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState<DateRange>("all");
  const [sortOrder, setSortOrder] = useState<string>("none");

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkSheet, setShowBulkSheet] = useState(false);

  const availableBuildings = useMemo(
    () => clientFilter === "all" ? buildings : buildings.filter((b) => b.clientId === clientFilter),
    [buildings, clientFilter]
  );

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
      if (dateFilter !== "all" && !isWithinRange(u.createdAt, dateFilter)) return false;
      return true;
    });
  }, [units, search, clientFilter, buildingFilter, statusFilter, installerFilter, dateFilter]);

  const sortedFiltered = useMemo(() => {
    if (sortOrder === "none") return filtered;
    return [...filtered].sort((a, b) => {
      if (sortOrder === "complete_asc" || sortOrder === "complete_desc") {
        if (!a.completeByDate && !b.completeByDate) return 0;
        if (!a.completeByDate) return 1;
        if (!b.completeByDate) return -1;
        const ta = new Date(a.completeByDate).getTime();
        const tb = new Date(b.completeByDate).getTime();
        return sortOrder === "complete_asc" ? ta - tb : tb - ta;
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
    dateFilter !== "all",
    sortOrder !== "none",
  ].filter(Boolean).length;

  const allFilteredSelected = filtered.length > 0 && filtered.every((u) => selectedIds.has(u.id));

  function toggleUnit(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
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

  const dateOptions = Object.entries(DATE_RANGE_LABELS).map(([v, label]) => ({
    value: v,
    label,
  }));

  const sortOptions = [
    { value: "none", label: "Default" },
    { value: "newest", label: "Added (Newest)" },
    { value: "oldest", label: "Added (Oldest)" },
    { value: "complete_asc", label: "Complete By (Earliest)" },
    { value: "complete_desc", label: "Complete By (Latest)" },
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
          <FilterDropdown label="Date Added" value={dateFilter} options={dateOptions} onChange={(v) => setDateFilter(v as DateRange)} />
          <FilterDropdown label="Sort" value={sortOrder} options={sortOptions} onChange={setSortOrder} />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => { setClientFilter("all"); setBuildingFilter("all"); setStatusFilter("all"); setInstallerFilter("all"); setDateFilter("all"); setSortOrder("none"); }}
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
                      {unit.completeByDate && (
                        <span className="flex items-center gap-1 text-[11px] text-tertiary font-mono">
                          <CheckSquare size={12} />
                          Due: {unit.completeByDate}
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
                        {unit.completeByDate && (
                          <span className="flex items-center gap-1 text-[11px] text-tertiary font-mono">
                            <CheckSquare size={12} />
                            Due: {unit.completeByDate}
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
                Assign
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
