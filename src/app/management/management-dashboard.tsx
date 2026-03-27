"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Warning,
  CheckCircle,
  CalendarBlank,
  ArrowRight,
  SignOut,
  CalendarX,
  ClockCountdown,
  CaretDown,
  UserCircle,
  X,
  FunnelSimple,
  HourglassHigh,
  ShieldWarning,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { SectionLabel } from "@/components/ui/section-label";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { UNIT_STATUS_ORDER, type UnitStatus, type Unit } from "@/lib/types";
import { signOut } from "@/app/actions/auth-actions";

// ─── Time-frame helpers ─────────────────────────────────────────────────────

type TimeFrame = "today" | "this_week" | "last_week" | "this_month" | "last_month";

const TIME_FRAME_OPTIONS: { value: TimeFrame; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "this_week", label: "This Week" },
  { value: "last_week", label: "Last Week" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
];

function getTimeRange(tf: TimeFrame): [string, string] {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().split("T")[0];

  switch (tf) {
    case "today":
      return [fmt(now), fmt(now)];
    case "this_week": {
      const day = now.getDay();
      const start = new Date(now);
      start.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      return [fmt(start), fmt(now)];
    }
    case "last_week": {
      const day = now.getDay();
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
      const lastMonday = new Date(thisMonday);
      lastMonday.setDate(thisMonday.getDate() - 7);
      const lastSunday = new Date(thisMonday);
      lastSunday.setDate(thisMonday.getDate() - 1);
      return [fmt(lastMonday), fmt(lastSunday)];
    }
    case "this_month": {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      return [fmt(start), fmt(now)];
    }
    case "last_month": {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return [fmt(start), fmt(end)];
    }
  }
}

// ─── Flag computation ──────────────────────────────────────────────────────

type UnitFlag = "overdue" | "late_schedule" | "no_bracket" | "no_install" | "at_risk";

const DONE_STATUSES = new Set(["installed_pending_approval", "client_approved"]);

function isDone(unit: Unit) {
  return DONE_STATUSES.has(unit.status);
}

function computeFlags(unit: Unit, todayStr: string): UnitFlag[] {
  if (isDone(unit)) return [];
  const flags: UnitFlag[] = [];
  if (!unit.bracketingDate) flags.push("no_bracket");
  if (!unit.installationDate) flags.push("no_install");
  if (unit.installationDate) {
    if (unit.installationDate < todayStr) flags.push("overdue");
    if (unit.completeByDate && unit.installationDate > unit.completeByDate) {
      flags.push("late_schedule");
    }
  }
  // At risk: completeByDate exists, within 3 days, not yet overdue
  if (unit.completeByDate && !flags.includes("overdue")) {
    const dueDate = new Date(unit.completeByDate);
    const todayDate = new Date(todayStr);
    const daysUntilDue = Math.floor((dueDate.getTime() - todayDate.getTime()) / 86400000);
    if (daysUntilDue <= 3 && daysUntilDue >= 0) {
      flags.push("at_risk");
    }
  }
  return flags;
}

type FlaggedUnit = Unit & { flags: UnitFlag[] };

// ─── Sub-components ─────────────────────────────────────────────────────────

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  };
}

function FlagBadge({ flag }: { flag: UnitFlag }) {
  const config: Record<UnitFlag, { label: string; cls: string }> = {
    overdue: { label: "Past Install Date", cls: "bg-red-100 text-red-700" },
    late_schedule: { label: "Install After Deadline", cls: "bg-amber-100 text-amber-700" },
    at_risk: { label: "At Risk", cls: "bg-orange-100 text-orange-700" },
    no_bracket: { label: "No Bracket Date", cls: "bg-zinc-100 text-zinc-600" },
    no_install: { label: "No Install Date", cls: "bg-zinc-100 text-zinc-600" },
  };
  const { label, cls } = config[flag];
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${cls}`}>
      {label}
    </span>
  );
}

function UnitFlagCard({ unit, todayStr }: { unit: FlaggedUnit; todayStr: string }) {
  const daysOverdue =
    unit.installationDate && unit.installationDate < todayStr
      ? Math.floor((new Date(todayStr).getTime() - new Date(unit.installationDate).getTime()) / 86400000)
      : 0;

  return (
    <Link
      href={`/management/units/${unit.id}`}
      className="group surface-card px-4 py-3.5 flex flex-col gap-2 hover:shadow-[var(--shadow-md)] transition-all duration-200 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-foreground">{unit.unitNumber}</p>
          <p className="text-[12px] text-tertiary">{unit.buildingName} · {unit.clientName}</p>
        </div>
        <ArrowRight size={14} className="text-zinc-300 group-hover:text-accent transition-colors flex-shrink-0 mt-0.5" />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {unit.flags.map((f) => <FlagBadge key={f} flag={f} />)}
      </div>

      <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-muted border-t border-border/60">
        <div className="flex flex-col gap-0.5">
          <span>Bracket: {unit.bracketingDate ?? "—"} · Install: {unit.installationDate ?? "—"}</span>
          {unit.completeByDate && (
            <span className={unit.flags.includes("late_schedule") || unit.flags.includes("at_risk") ? "text-amber-600 font-semibold" : ""}>
              Due: {unit.completeByDate}
            </span>
          )}
          {daysOverdue > 0 && (
            <span className="text-red-600 font-semibold">{daysOverdue}d past install date</span>
          )}
        </div>
        {unit.assignedInstallerName && (
          <span className="flex items-center gap-1 text-secondary">
            <UserCircle size={12} />
            {unit.assignedInstallerName}
          </span>
        )}
      </div>
    </Link>
  );
}

function FlagSection({
  title,
  icon,
  units,
  todayStr,
  danger,
  warn,
  defaultOpen = true,
}: {
  title: string;
  icon: React.ReactNode;
  units: FlaggedUnit[];
  todayStr: string;
  danger?: boolean;
  warn?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (units.length === 0) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 py-2 group"
      >
        <span className={danger ? "text-red-500" : warn ? "text-amber-500" : "text-zinc-500"}>
          {icon}
        </span>
        <span className={`text-[12px] font-semibold uppercase tracking-wider flex-1 text-left ${danger ? "text-red-600" : warn ? "text-amber-600" : "text-zinc-600"}`}>
          {title}
        </span>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${danger ? "bg-red-100 text-red-700" : warn ? "bg-amber-100 text-amber-700" : "bg-zinc-100 text-zinc-600"}`}>
          {units.length}
        </span>
        <CaretDown size={14} weight="bold" className={`text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="content"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pb-3">
              {units.map((u) => <UnitFlagCard key={u.id} unit={u} todayStr={todayStr} />)}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

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

  // ── Time-frame ──
  const [timeFrame, setTimeFrame] = useState<TimeFrame>("this_month");
  const [rangeStart, rangeEnd] = useMemo(() => getTimeRange(timeFrame), [timeFrame]);

  // ── Filters ──
  const [clientFilter, setClientFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [installerFilter, setInstallerFilter] = useState("all");

  const availableBuildings = useMemo(
    () => clientFilter === "all" ? buildings : buildings.filter((b) => b.clientId === clientFilter),
    [buildings, clientFilter]
  );

  const filteredUnits = useMemo(() => {
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

  const flaggedUnits = useMemo((): FlaggedUnit[] => {
    return filteredUnits.map((u) => ({ ...u, flags: computeFlags(u, today) }));
  }, [filteredUnits, today]);

  // ── Flag groups ──
  const overdueUnits = useMemo(
    () => flaggedUnits.filter((u) => u.flags.includes("overdue")),
    [flaggedUnits]
  );
  const atRiskUnits = useMemo(
    () => flaggedUnits.filter((u) => u.flags.includes("at_risk") || (u.flags.includes("late_schedule") && !u.flags.includes("overdue"))),
    [flaggedUnits]
  );
  const missingDateUnits = useMemo(
    () => flaggedUnits.filter(
      (u) => (u.flags.includes("no_bracket") || u.flags.includes("no_install"))
        && !u.flags.includes("overdue") && !u.flags.includes("late_schedule") && !u.flags.includes("at_risk")
    ),
    [flaggedUnits]
  );

  // ── KPIs (global, not filtered by client/building/installer) ──
  const completedUnits = units.filter((u) => u.status === "client_approved");
  const overdueCount = units.filter(
    (u) => u.installationDate && u.installationDate < today && u.status !== "client_approved"
  ).length;
  const pendingApproval = units.filter((u) => u.status === "installed_pending_approval");
  const atRiskCount = units.filter((u) => {
    if (isDone(u)) return false;
    if (!u.completeByDate) return false;
    if (u.installationDate && u.installationDate < today) return false; // already overdue
    const dueDate = new Date(u.completeByDate);
    const todayDate = new Date(today);
    const daysUntilDue = Math.floor((dueDate.getTime() - todayDate.getTime()) / 86400000);
    return daysUntilDue <= 3;
  }).length;

  // ── Completion trend ──
  const totalUnits = units.length;
  const completedCount = completedUnits.length;
  const completionPct = totalUnits > 0 ? Math.round((completedCount / totalUnits) * 100) : 0;

  // ── Pipeline ──
  const statusCounts = new Map<string, number>();
  units.forEach((u) => statusCounts.set(u.status, (statusCounts.get(u.status) || 0) + 1));

  const kpis = [
    { label: "Completed", value: completedCount, iconColor: "text-emerald-500", iconBg: "bg-emerald-50", Icon: CheckCircle },
    { label: "Overdue", value: overdueCount, iconColor: "text-red-500", iconBg: "bg-red-50", Icon: Warning },
    { label: "Pending Approval", value: pendingApproval.length, iconColor: "text-sky-500", iconBg: "bg-sky-50", Icon: HourglassHigh },
    { label: "At Risk", value: atRiskCount, iconColor: "text-orange-500", iconBg: "bg-orange-50", Icon: ShieldWarning },
  ];

  // ── Filter options ──
  const clientOptions = [{ value: "all", label: "All clients" }, ...clients.map((c) => ({ value: c.id, label: c.name }))];
  const buildingOptions = [{ value: "all", label: "All buildings" }, ...availableBuildings.map((b) => ({ value: b.id, label: b.name }))];
  const installerOptions = [
    { value: "all", label: "All installers" },
    { value: "__unassigned__", label: "Unassigned" },
    ...installers.map((i) => ({ value: i.id, label: i.name })),
  ];

  const activeFilterCount = [clientFilter !== "all", buildingFilter !== "all", installerFilter !== "all"].filter(Boolean).length;
  const anyFlags = overdueUnits.length > 0 || atRiskUnits.length > 0 || missingDateUnits.length > 0;

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

        {/* Time-frame selector */}
        <motion.div {...fadeUp(0)} className="flex bg-zinc-100 p-1 rounded-xl overflow-x-auto no-scrollbar">
          {TIME_FRAME_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTimeFrame(value)}
              className={`flex-1 min-w-0 text-[11px] font-semibold py-2 px-2 rounded-lg transition-all whitespace-nowrap ${
                timeFrame === value
                  ? "bg-white shadow-sm text-foreground border border-border"
                  : "text-secondary hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </motion.div>

        {/* KPI grid */}
        <motion.div {...fadeUp(0.04)} className="grid grid-cols-2 gap-3">
          {kpis.map(({ label, value, Icon, iconColor, iconBg }) => (
            <div key={label} className="surface-card p-4">
              <div className={`w-8 h-8 rounded-[var(--radius-sm)] ${iconBg} flex items-center justify-center mb-3`}>
                <Icon size={16} weight="fill" className={iconColor} />
              </div>
              <p className="text-[1.625rem] font-bold text-foreground font-mono tracking-tight leading-none mb-1">{value}</p>
              <p className="text-[11px] text-tertiary font-medium">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Completion trend */}
        <motion.div {...fadeUp(0.08)}>
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-tertiary uppercase tracking-wider">Overall Progress</p>
              <p className="text-[13px] font-bold text-foreground font-mono">
                {completedCount} / {totalUnits}
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

        {/* Pipeline by status */}
        <motion.div {...fadeUp(0.12)}>
          <SectionLabel as="h2">Pipeline by status</SectionLabel>
          <div className="surface-card divide-y divide-border-subtle" style={{ padding: 0 }}>
            {Array.from(statusCounts.entries())
              .sort((a, b) => UNIT_STATUS_ORDER[a[0] as keyof typeof UNIT_STATUS_ORDER] - UNIT_STATUS_ORDER[b[0] as keyof typeof UNIT_STATUS_ORDER])
              .map(([status, count]) => (
                <div key={status} className="flex items-center justify-between px-4 py-3">
                  <StatusChip status={status as UnitStatus} />
                  <span className="text-[13px] font-semibold text-foreground font-mono">{count}</span>
                </div>
              ))}
            {statusCounts.size === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted">No units yet</div>
            )}
          </div>
        </motion.div>

        {/* Drill-down section */}
        <motion.div {...fadeUp(0.16)} className="flex flex-col gap-0">

          {/* Filters */}
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 pt-1">
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
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={() => { setClientFilter("all"); setBuildingFilter("all"); setInstallerFilter("all"); }}
                className="flex-shrink-0 flex items-center gap-1 h-7 px-2 rounded-full text-[11px] font-medium text-red-500 border border-red-200 bg-red-50"
              >
                <X size={10} weight="bold" /> Clear
              </button>
            )}
          </div>

          {!anyFlags && (
            <div className="flex flex-col items-center gap-1.5 py-6 text-center surface-card">
              <CheckCircle size={28} weight="duotone" className="text-emerald-400" />
              <p className="text-sm font-semibold text-zinc-700">All units on track</p>
              <p className="text-xs text-muted">No scheduling issues for selected filters.</p>
            </div>
          )}

          <FlagSection
            title="Overdue — Past Install Date"
            icon={<Warning size={14} weight="fill" />}
            units={overdueUnits}
            todayStr={today}
            danger
          />
          <FlagSection
            title="At Risk — Near or Past Deadline"
            icon={<ShieldWarning size={14} weight="fill" />}
            units={atRiskUnits}
            todayStr={today}
            warn
          />
          <FlagSection
            title="Missing Dates"
            icon={<CalendarX size={14} weight="fill" />}
            units={missingDateUnits}
            todayStr={today}
          />
        </motion.div>

      </div>
    </div>
  );
}
