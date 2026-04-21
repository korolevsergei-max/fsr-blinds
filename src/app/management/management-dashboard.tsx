"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, CaretDown, CaretRight, SignOut, FunnelSimple, SortAscending, X } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { getFloor, getUnitIdsWithWindowEscalations } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { SectionLabel } from "@/components/ui/section-label";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { UNIT_STATUSES, type UnitStatus } from "@/lib/types";
import {
  buildMonthFilterOptions,
  buildYearOptions,
  unitMatchesYearMonth,
} from "@/lib/dashboard-scope-filters";
import { signOut } from "@/app/actions/auth-actions";
import { ScopedResultsPanel } from "@/components/dashboard/scoped-results-panel";
import {
  type DashboardIssue,
  DASHBOARD_ISSUE_LABELS,
  DASHBOARD_ISSUE_CLASSES,
  ISSUE_ORDER,
  getUnitIssues,
  computeIssueCounts,
} from "@/lib/dashboard-issues";
import { formatUnitEscalationDetail, getUnitEscalations } from "@/lib/window-issues";
import { useSessionStorage } from "@/hooks/use-session-storage";
import { UnitSortModal } from "@/components/dashboard/unit-sort-modal";
import { type UnitSortLevel, sortUnits } from "@/lib/unit-sort";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  };
}

export function ManagementDashboard({
  data,
  userName,
}: {
  data: AppDataset;
  userName?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  const { units, clients, buildings, installers, schedulers } = data;

  const today = new Date().toISOString().split("T")[0];

  // Scope filters
  const [clientFilter, setClientFilter] = useSessionStorage<string[]>("management-dashboard-clientFilter", []);
  const [buildingFilter, setBuildingFilter] = useSessionStorage<string[]>("management-dashboard-buildingFilter", []);
  const [installerFilter, setInstallerFilter] = useSessionStorage<string[]>("management-dashboard-installerFilter", []);
  const [schedulerFilter, setSchedulerFilter] = useSessionStorage<string[]>("management-dashboard-schedulerFilter", []);
  const [floorFilter, setFloorFilter] = useSessionStorage<string[]>("management-dashboard-floorFilter", []);
  const [yearFilter, setYearFilter] = useSessionStorage<string>("management-dashboard-yearFilter", "all");
  const [monthFilter, setMonthFilter] = useSessionStorage<string>("management-dashboard-monthFilter", "all");

  // Selection state — status + issue can combine
  const [selectedStatus, setSelectedStatus] = useSessionStorage<UnitStatus | null>("management-dashboard-selectedStatus", null);
  const [selectedIssue, setSelectedIssue] = useSessionStorage<DashboardIssue | null>("management-dashboard-selectedIssue", null);

  // Sort state
  const [sortLevels, setSortLevels] = useState<UnitSortLevel[]>([]);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [draftSortLevels, setDraftSortLevels] = useState<UnitSortLevel[]>([]);

  const availableBuildings = useMemo(
    () =>
      clientFilter.length === 0
        ? buildings
        : buildings.filter((b) => clientFilter.includes(b.clientId)),
    [buildings, clientFilter]
  );

  // Pre-floor scope: used to derive dynamic floor options
  const preFloorUnits = useMemo(() => {
    const effectiveMonth = yearFilter === "all" ? "all" : monthFilter;
    return units.filter((u) => {
      if (clientFilter.length > 0 && !clientFilter.includes(u.clientId)) return false;
      if (buildingFilter.length > 0 && !buildingFilter.includes(u.buildingId)) return false;
      if (installerFilter.length > 0) {
        const wantsUnassigned = installerFilter.includes("__unassigned__");
        const matchUnassigned = wantsUnassigned && !u.assignedInstallerId;
        const matchSpecific = u.assignedInstallerId && installerFilter.includes(u.assignedInstallerId);
        if (!matchUnassigned && !matchSpecific) return false;
      }
      if (schedulerFilter.length > 0) {
        const wantsUnassigned = schedulerFilter.includes("__unassigned__");
        const matchUnassigned = wantsUnassigned && !u.assignedSchedulerId;
        const matchSpecific = u.assignedSchedulerId && schedulerFilter.includes(u.assignedSchedulerId);
        if (!matchUnassigned && !matchSpecific) return false;
      }
      if (!unitMatchesYearMonth(u, yearFilter, effectiveMonth)) return false;
      return true;
    });
  }, [units, clientFilter, buildingFilter, installerFilter, schedulerFilter, yearFilter, monthFilter]);

  // All counts derived from scopedUnits — never global units
  const scopedUnits = useMemo(() => {
    if (floorFilter.length === 0) return preFloorUnits;
    return preFloorUnits.filter((u) => floorFilter.includes(getFloor(u.unitNumber)));
  }, [preFloorUnits, floorFilter]);

  const yearOptions = useMemo(() => buildYearOptions(units), [units]);
  const monthOptions = useMemo(() => buildMonthFilterOptions(), []);

  const escalationIds = useMemo(() => getUnitIdsWithWindowEscalations(data), [data]);
  const escalationDetailsByUnitId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const unit of scopedUnits) {
      const details = getUnitEscalations(data, unit.id).map(
        (item) => `${item.roomName} · ${item.windowLabel}: ${formatUnitEscalationDetail(item)}`
      );
      if (details.length > 0) map.set(unit.id, details);
    }
    return map;
  }, [data, scopedUnits]);

  // Pipeline counts — cross-filtered by selected issue so clicks in either strip narrow the other
  const statusCounts = useMemo(() => {
    const source = selectedIssue
      ? scopedUnits.filter((u) =>
          getUnitIssues(u, today, escalationIds).includes(selectedIssue)
        )
      : scopedUnits;
    const map = new Map<string, number>();
    source.forEach((u) => map.set(u.status, (map.get(u.status) ?? 0) + 1));
    return map;
  }, [scopedUnits, selectedIssue, today, escalationIds]);

  // Issue counts — cross-filtered by selected status
  const issueCounts = useMemo(() => {
    const source = selectedStatus
      ? scopedUnits.filter((u) => u.status === selectedStatus)
      : scopedUnits;
    return computeIssueCounts(source, today, escalationIds);
  }, [scopedUnits, selectedStatus, today, escalationIds]);

  // Results = scopedUnits narrowed by selected status + selected issue (intersection)
  const resultsUnits = useMemo(() => {
    let result = scopedUnits;
    if (selectedStatus) result = result.filter((u) => u.status === selectedStatus);
    if (selectedIssue)
      result = result.filter((u) =>
        getUnitIssues(u, today, escalationIds).includes(selectedIssue)
      );
    return sortUnits(result, sortLevels);
  }, [scopedUnits, selectedStatus, selectedIssue, today, escalationIds, sortLevels]);

  const activeSortCount = sortLevels.length;

  const activeFilterCount = [
    clientFilter.length > 0,
    buildingFilter.length > 0,
    floorFilter.length > 0,
    installerFilter.length > 0,
    schedulerFilter.length > 0,
    yearFilter !== "all",
    yearFilter !== "all" && monthFilter !== "all",
  ].filter(Boolean).length;

  const showResults = selectedStatus !== null || selectedIssue !== null || activeFilterCount > 0;

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

  const schedulerOptions = [
    { value: "all", label: "All schedulers" },
    { value: "__unassigned__", label: "Unassigned" },
    ...schedulers.map((s) => ({ value: s.id, label: s.name })),
  ];

  const floorOptions = useMemo(() => [
    { value: "all", label: "All floors" },
    ...[...new Map(
      preFloorUnits.map((u) => { const f = getFloor(u.unitNumber); return [f, { value: f, label: `Floor ${f}` }]; })
    ).values()].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true })),
  ], [preFloorUnits]);

  return (
    <div className="flex flex-col pb-32">
      {/* Header */}
      <header className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 bg-card border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] text-tertiary font-medium mb-0.5">
              {userName ? `Hello, ${userName}` : "Management"}
            </p>
            <h1 className="text-[1.625rem] font-bold tracking-[-0.03em] text-foreground leading-none">
              FSR Blinds
            </h1>
          </div>
          <button
            onClick={() =>
              startSignOut(async () => {
                await signOut();
                router.push("/login");
                router.refresh();
              })
            }
            disabled={signingOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[12px] font-medium text-tertiary hover:text-secondary hover:bg-surface transition-colors disabled:opacity-50"
          >
            <SignOut size={14} />
            {signingOut ? "…" : "Sign out"}
          </button>
        </div>
      </header>

      <div className="px-4 flex flex-col gap-5 pt-5">
        {/* Scope bar — always visible, never hidden during drill-down */}
        <motion.div {...fadeUp(0)}>
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
            <div className="flex items-center gap-1 flex-shrink-0 text-zinc-400">
              <FunnelSimple size={13} />
              {activeFilterCount > 0 && (
                <span className="text-[9px] font-bold bg-accent text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => { setDraftSortLevels(sortLevels); setSortModalOpen(true); }}
              className={[
                "flex h-7 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-all",
                activeSortCount > 0
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-card text-secondary hover:border-zinc-300",
              ].join(" ")}
            >
              <SortAscending size={12} weight="bold" />
              {activeSortCount > 0 ? `Sort (${activeSortCount})` : "Sort"}
            </button>
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
            <FilterDropdown
              multiple
              label="Building"
              values={buildingFilter}
              options={buildingOptions}
              onChange={setBuildingFilter}
            />
            <FilterDropdown
              multiple
              label="Floor"
              values={floorFilter}
              options={floorOptions}
              onChange={setFloorFilter}
            />
            <FilterDropdown
              multiple
              label="Installer"
              values={installerFilter}
              options={installerOptions}
              onChange={setInstallerFilter}
            />
            <FilterDropdown
              multiple
              label="Scheduler"
              values={schedulerFilter}
              options={schedulerOptions}
              onChange={setSchedulerFilter}
            />
            <FilterDropdown
              label="Year"
              value={yearFilter}
              options={yearOptions}
              onChange={(v) => {
                setYearFilter(v);
                if (v === "all") setMonthFilter("all");
              }}
            />
            {yearFilter !== "all" && (
              <FilterDropdown
                label="Month"
                value={monthFilter}
                options={monthOptions}
                onChange={setMonthFilter}
              />
            )}
            {(activeFilterCount > 0 || activeSortCount > 0) && (
              <button
                type="button"
                onClick={() => {
                  setClientFilter([]);
                  setBuildingFilter([]);
                  setFloorFilter([]);
                  setInstallerFilter([]);
                  setSchedulerFilter([]);
                  setYearFilter("all");
                  setMonthFilter("all");
                  setSortLevels([]);
                }}
                className="flex-shrink-0 flex items-center gap-1 h-7 px-2 rounded-full text-[11px] font-medium text-red-500 border border-red-200 bg-red-50"
              >
                <X size={10} weight="bold" /> Clear
              </button>
            )}
          </div>
        </motion.div>

        {/* Pipeline by status — clickable, all statuses including zero counts */}
        <motion.div {...fadeUp(0.06)}>
          <SectionLabel as="h2">Pipeline by status</SectionLabel>
          <div
            className="surface-card divide-y divide-border-subtle overflow-hidden"
            style={{ padding: 0 }}
          >
            {scopedUnits.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-muted">No units in this scope</div>
            ) : (
              UNIT_STATUSES.map((status) => {
                const count = statusCounts.get(status) ?? 0;
                const isActive = selectedStatus === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() =>
                      setSelectedStatus((prev) =>
                        prev === status ? null : (status as UnitStatus)
                      )
                    }
                    className={`w-full flex items-center justify-between px-4 py-3 transition-all active:scale-[0.99] ${
                      isActive
                        ? "bg-accent/5 border-l-2 border-l-accent"
                        : "hover:bg-surface"
                    }`}
                  >
                    <StatusChip status={status as UnitStatus} />
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-semibold text-foreground font-mono">
                        {count}
                      </span>
                      {isActive ? (
                        <CaretDown size={12} className="text-accent" />
                      ) : (
                        <CaretRight size={12} className="text-zinc-300" />
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </motion.div>

        {/* Issue buckets — clickable, combinable with status */}
        <motion.div {...fadeUp(0.08)}>
          <SectionLabel as="h2">Issues</SectionLabel>
          <div
            className="surface-card divide-y divide-border-subtle overflow-hidden"
            style={{ padding: 0 }}
          >
            {ISSUE_ORDER.map((issue) => {
              const count = issueCounts.get(issue) ?? 0;
              if (count === 0) return null;
              const isActive = selectedIssue === issue;
              const cls = DASHBOARD_ISSUE_CLASSES[issue];
              return (
                <button
                  key={issue}
                  type="button"
                  onClick={() =>
                    setSelectedIssue((prev) => (prev === issue ? null : issue))
                  }
                  className={`w-full flex items-center justify-between px-4 py-3 text-left transition-all active:scale-[0.99] ${
                    isActive
                      ? "bg-accent/5 border-l-2 border-l-accent"
                      : "hover:bg-surface"
                  }`}
                >
                  <span
                    className={`text-[12px] font-semibold ${
                      isActive ? "text-accent" : cls.text
                    }`}
                  >
                    {DASHBOARD_ISSUE_LABELS[issue]}
                  </span>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${cls.badge}`}
                    >
                      {count}
                    </span>
                    {isActive ? (
                      <CaretDown size={12} className="text-accent" />
                    ) : (
                      <CaretRight size={12} className="text-zinc-300" />
                    )}
                  </div>
                </button>
              );
            })}
            {issueCounts.size === 0 && (
              <div className="flex items-center gap-2 px-4 py-4">
                <CheckCircle size={15} weight="duotone" className="text-emerald-400" />
                <span className="text-[12px] text-muted">No issues in current scope</span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Results panel — appears when status or issue selected */}
        <AnimatePresence>
          {showResults && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-between mb-2">
                <SectionLabel as="h2" noMargin>
                  Results
                </SectionLabel>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedStatus(null);
                    setSelectedIssue(null);
                  }}
                  className="text-[11px] font-medium text-muted hover:text-secondary transition-colors"
                >
                  Clear all
                </button>
              </div>
              <ScopedResultsPanel
                units={resultsUnits}
                today={today}
                unitHref={(id) => `/management/units/${id}`}
                selectedStatus={selectedStatus}
                selectedIssue={selectedIssue}
                onClearStatus={() => setSelectedStatus(null)}
                onClearIssue={() => setSelectedIssue(null)}
                issueDetailsByUnitId={
                  selectedIssue === "escalations" ? escalationDetailsByUnitId : undefined
                }
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {sortModalOpen && (
        <UnitSortModal
          draftLevels={draftSortLevels}
          onClose={() => setSortModalOpen(false)}
          onApply={(levels) => { setSortLevels(levels); setSortModalOpen(false); }}
          onChange={setDraftSortLevels}
        />
      )}
    </div>
  );
}
