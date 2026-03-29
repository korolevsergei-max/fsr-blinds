"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Warning,
  CheckCircle,
  CaretDown,
  CaretRight,
  SignOut,
  HourglassHigh,
  ShieldWarning,
  FunnelSimple,
  X,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { getUnitIdsWithWindowEscalations } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { SectionLabel } from "@/components/ui/section-label";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { UNIT_STATUS_ORDER, type UnitStatus } from "@/lib/types";
import { computeUnitFlags } from "@/lib/unit-flags";
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

export function ManagementDashboard({
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
    return units.filter((u) => {
      if (clientFilter !== "all" && u.clientId !== clientFilter) return false;
      if (buildingFilter !== "all" && u.buildingId !== buildingFilter) return false;
      if (installerFilter === "__unassigned__") {
        if (u.assignedInstallerId) return false;
      } else if (installerFilter !== "all" && u.assignedInstallerId !== installerFilter) {
        return false;
      }
      return true;
    });
  }, [units, clientFilter, buildingFilter, installerFilter]);

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

  // KPIs
  const totalCount = scopedUnits.length;
  const completedCount = useMemo(
    () => scopedUnits.filter((u) => u.status === "client_approved").length,
    [scopedUnits]
  );
  const overdueCount = useMemo(
    () =>
      scopedUnits.filter((u) => {
        const f = computeUnitFlags(u, today);
        return (
          f.includes("past_bracketing_due") ||
          f.includes("past_install_due") ||
          f.includes("past_complete_by")
        );
      }).length,
    [scopedUnits, today]
  );
  const pendingApprovalCount = useMemo(
    () => scopedUnits.filter((u) => u.status === "installed").length,
    [scopedUnits]
  );
  const atRiskCount = useMemo(
    () =>
      scopedUnits.filter((u) => {
        const f = computeUnitFlags(u, today);
        return f.includes("at_risk") || f.includes("late_schedule");
      }).length,
    [scopedUnits, today]
  );
  const completionPct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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

  const kpis = [
    {
      label: "Completed",
      value: completedCount,
      Icon: CheckCircle,
      iconColor: "text-emerald-500",
      iconBg: "bg-emerald-50",
    },
    {
      label: "Overdue",
      value: overdueCount,
      Icon: Warning,
      iconColor: "text-red-500",
      iconBg: "bg-red-50",
    },
    {
      label: "Pending approval",
      value: pendingApprovalCount,
      Icon: HourglassHigh,
      iconColor: "text-sky-500",
      iconBg: "bg-sky-50",
    },
    {
      label: "At risk",
      value: atRiskCount,
      Icon: ShieldWarning,
      iconColor: "text-orange-500",
      iconBg: "bg-orange-50",
    },
  ] as const;

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
        {/* KPI grid (2×2) */}
        <motion.div {...fadeUp(0)} className="grid grid-cols-2 gap-3">
          {kpis.map(({ label, value, Icon, iconColor, iconBg }) => (
            <div key={label} className="surface-card p-4">
              <div
                className={`w-8 h-8 rounded-[var(--radius-sm)] ${iconBg} flex items-center justify-center mb-3`}
              >
                <Icon size={16} weight="fill" className={iconColor} />
              </div>
              <p className="text-[1.625rem] font-bold text-foreground font-mono tracking-tight leading-none mb-1">
                {value}
              </p>
              <p className="text-[11px] text-tertiary font-medium">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Progress bar */}
        <motion.div {...fadeUp(0.04)}>
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-tertiary uppercase tracking-wider">
                Overall progress
              </p>
              <p className="text-[13px] font-bold text-foreground font-mono">
                {completedCount} / {totalCount}
                <span className="text-tertiary font-normal ml-1">({completionPct}%)</span>
              </p>
            </div>
            <div className="h-2.5 bg-zinc-100 rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-emerald-500 rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${completionPct}%` }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>
          </div>
        </motion.div>

        {/* Scope bar — always visible, never hidden during drill-down */}
        <motion.div {...fadeUp(0.06)}>
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
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setClientFilter("all");
                  setBuildingFilter("all");
                  setInstallerFilter("all");
                }}
                className="flex-shrink-0 flex items-center gap-1 h-7 px-2 rounded-full text-[11px] font-medium text-red-500 border border-red-200 bg-red-50"
              >
                <X size={10} weight="bold" /> Clear
              </button>
            )}
          </div>
        </motion.div>

        {/* Pipeline by status — clickable */}
        <motion.div {...fadeUp(0.08)}>
          <SectionLabel as="h2">Pipeline by status</SectionLabel>
          <div
            className="surface-card divide-y divide-border-subtle"
            style={{ padding: 0 }}
          >
            {Array.from(statusCounts.entries())
              .sort(
                (a, b) =>
                  UNIT_STATUS_ORDER[a[0] as UnitStatus] -
                  UNIT_STATUS_ORDER[b[0] as UnitStatus]
              )
              .map(([status, count]) => {
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
              })}
            {statusCounts.size === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted">No units yet</div>
            )}
          </div>
        </motion.div>

        {/* Issue buckets — clickable, combinable with status */}
        <motion.div {...fadeUp(0.1)}>
          <SectionLabel as="h2">Issues</SectionLabel>
          <div
            className="surface-card divide-y divide-border-subtle"
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
    </div>
  );
}
