"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle, CaretDown, CaretRight, SignOut, FunnelSimple, X } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { getUnitIdsWithWindowEscalations } from "@/lib/app-dataset";
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
import { getUnitEscalations } from "@/lib/window-issues";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  };
}

export function SchedulerDashboard({
  data,
  userName,
}: {
  data: AppDataset;
  userName?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  const { units, clients, buildings, installers } = data;

  const today = new Date().toISOString().split("T")[0];

  // Scope filters
  const [clientFilter, setClientFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [installerFilter, setInstallerFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");

  // Selection state — status + issue can combine
  const [selectedStatus, setSelectedStatus] = useState<UnitStatus | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<DashboardIssue | null>(null);

  const availableBuildings = useMemo(
    () =>
      clientFilter === "all"
        ? buildings
        : buildings.filter((b) => b.clientId === clientFilter),
    [buildings, clientFilter]
  );

  // All counts derived from scopedUnits — never global units
  const scopedUnits = useMemo(() => {
    const effectiveMonth = yearFilter === "all" ? "all" : monthFilter;
    return units.filter((u) => {
      if (clientFilter !== "all" && u.clientId !== clientFilter) return false;
      if (buildingFilter !== "all" && u.buildingId !== buildingFilter) return false;
      if (installerFilter === "__unassigned__") {
        if (u.assignedInstallerId) return false;
      } else if (installerFilter !== "all" && u.assignedInstallerId !== installerFilter) {
        return false;
      }
      if (!unitMatchesYearMonth(u, yearFilter, effectiveMonth)) return false;
      return true;
    });
  }, [units, clientFilter, buildingFilter, installerFilter, yearFilter, monthFilter]);

  const yearOptions = useMemo(() => buildYearOptions(units), [units]);
  const monthOptions = useMemo(() => buildMonthFilterOptions(), []);

  const escalationIds = useMemo(() => getUnitIdsWithWindowEscalations(data), [data]);
  const escalationDetailsByUnitId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const unit of scopedUnits) {
      const details = getUnitEscalations(data, unit.id).map(
        (item) => `${item.roomName} · ${item.windowLabel}: ${item.note}`
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
    return result;
  }, [scopedUnits, selectedStatus, selectedIssue, today, escalationIds]);

  const showResults = selectedStatus !== null || selectedIssue !== null;

  const activeFilterCount = [
    clientFilter !== "all",
    buildingFilter !== "all",
    installerFilter !== "all",
    yearFilter !== "all",
    yearFilter !== "all" && monthFilter !== "all",
  ].filter(Boolean).length;

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

  return (
    <div className="flex flex-col pb-32">
      {/* Header */}
      <header className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 bg-card border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] text-tertiary font-medium mb-0.5">
              {userName ? `Hello, ${userName}` : "Scheduler"}
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
            <FilterDropdown
              label="Client"
              value={clientFilter}
              options={clientOptions}
              onChange={(v) => {
                setClientFilter(v);
                setBuildingFilter("all");
              }}
            />
            <FilterDropdown
              label="Building"
              value={buildingFilter}
              options={buildingOptions}
              onChange={setBuildingFilter}
            />
            <FilterDropdown
              label="Installer"
              value={installerFilter}
              options={installerOptions}
              onChange={setInstallerFilter}
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
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setClientFilter("all");
                  setBuildingFilter("all");
                  setInstallerFilter("all");
                  setYearFilter("all");
                  setMonthFilter("all");
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
                unitHref={(id) => `/scheduler/units/${id}`}
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
    </div>
  );
}
