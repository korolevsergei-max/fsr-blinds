"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { motion } from "framer-motion";
import {
  Warning,
  CheckCircle,
  CalendarX,
  ArrowRight,
  SignOut,
  ShieldWarning,
  Buildings,
  UserCircle,
  CaretDown,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { SectionLabel } from "@/components/ui/section-label";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { UNIT_STATUS_ORDER, type UnitStatus } from "@/lib/types";
import {
  computeUnitFlags,
  isUnitDone,
  FLAG_LABELS,
  FLAG_CLASSES,
  type UnitFlag,
  type FlaggedUnit,
} from "@/lib/unit-flags";
import { signOut } from "@/app/actions/auth-actions";

function fadeUp(delay = 0) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay, duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  };
}

function FlagBadge({ flag }: { flag: UnitFlag }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${FLAG_CLASSES[flag]}`}
    >
      {FLAG_LABELS[flag]}
    </span>
  );
}

function UnitFlagCard({ unit, todayStr }: { unit: FlaggedUnit; todayStr: string }) {
  const daysOverdue =
    unit.installationDate && unit.installationDate < todayStr
      ? Math.floor(
          (new Date(todayStr).getTime() - new Date(unit.installationDate).getTime()) / 86400000
        )
      : 0;

  return (
    <Link
      href={`/scheduler/units/${unit.id}`}
      className="group surface-card px-4 py-3.5 flex flex-col gap-2 hover:shadow-[var(--shadow-md)] transition-all duration-200 active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[14px] font-semibold text-foreground">{unit.unitNumber}</p>
          <p className="text-[12px] text-tertiary">
            {unit.buildingName} · {unit.clientName}
          </p>
        </div>
        <ArrowRight
          size={14}
          className="text-zinc-300 group-hover:text-accent transition-colors flex-shrink-0 mt-0.5"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {unit.flags.map((f) => (
          <FlagBadge key={f} flag={f} />
        ))}
      </div>

      <div className="flex items-center justify-between pt-1 text-[11px] font-mono text-muted border-t border-border/60">
        <div className="flex flex-col gap-0.5">
          <span>
            Bracket: {unit.bracketingDate ?? "—"} · Install: {unit.installationDate ?? "—"}
          </span>
          {unit.completeByDate && (
            <span
              className={
                unit.flags.includes("late_schedule") || unit.flags.includes("at_risk")
                  ? "text-amber-600 font-semibold"
                  : ""
              }
            >
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
        <span
          className={`text-[12px] font-semibold uppercase tracking-wider flex-1 text-left ${
            danger ? "text-red-600" : warn ? "text-amber-600" : "text-zinc-600"
          }`}
        >
          {title}
        </span>
        <span
          className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
            danger
              ? "bg-red-100 text-red-700"
              : warn
                ? "bg-amber-100 text-amber-700"
                : "bg-zinc-100 text-zinc-600"
          }`}
        >
          {units.length}
        </span>
        <CaretDown
          size={14}
          weight="bold"
          className={`text-zinc-400 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && (
        <div className="flex flex-col gap-2 pb-3">
          {units.map((u) => (
            <UnitFlagCard key={u.id} unit={u} todayStr={todayStr} />
          ))}
        </div>
      )}
    </div>
  );
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

  const [clientFilter, setClientFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [installerFilter, setInstallerFilter] = useState("all");

  const availableBuildings = useMemo(
    () =>
      clientFilter === "all"
        ? buildings
        : buildings.filter((b) => b.clientId === clientFilter),
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

  const flaggedUnits = useMemo(
    (): FlaggedUnit[] =>
      filteredUnits.map((u) => ({ ...u, flags: computeUnitFlags(u, today) })),
    [filteredUnits, today]
  );

  const overdueUnits = useMemo(
    () => flaggedUnits.filter((u) => u.flags.includes("past_install_due") || u.flags.includes("past_bracketing_due")),
    [flaggedUnits]
  );
  const atRiskUnits = useMemo(
    () =>
      flaggedUnits.filter(
        (u) =>
          (u.flags.includes("at_risk") || u.flags.includes("late_schedule")) &&
          !u.flags.includes("past_install_due")
      ),
    [flaggedUnits]
  );
  const missingDateUnits = useMemo(
    () =>
      flaggedUnits.filter(
        (u) =>
          (u.flags.includes("missing_bracketing_date") ||
            u.flags.includes("missing_installation_date") ||
            u.flags.includes("missing_installer")) &&
          !u.flags.includes("past_install_due") &&
          !u.flags.includes("at_risk") &&
          !u.flags.includes("late_schedule")
      ),
    [flaggedUnits]
  );

  const completedCount = units.filter((u) => u.status === "client_approved").length;
  const overdueCount = units.filter(
    (u) =>
      !isUnitDone(u) &&
      u.installationDate &&
      u.installationDate < today
  ).length;
  const totalUnits = units.length;
  const completionPct = totalUnits > 0 ? Math.round((completedCount / totalUnits) * 100) : 0;

  const activeFilterCount = [
    clientFilter !== "all",
    buildingFilter !== "all",
    installerFilter !== "all",
  ].filter(Boolean).length;
  const anyFlags =
    overdueUnits.length > 0 || atRiskUnits.length > 0 || missingDateUnits.length > 0;

  const statusCounts = new Map<string, number>();
  units.forEach((u) => statusCounts.set(u.status, (statusCounts.get(u.status) || 0) + 1));

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
        {/* KPI strip */}
        <motion.div {...fadeUp(0)} className="grid grid-cols-3 gap-3">
          {[
            { label: "Total", value: totalUnits, Icon: Buildings, cls: "text-zinc-500", bg: "bg-zinc-50" },
            { label: "Completed", value: completedCount, Icon: CheckCircle, cls: "text-emerald-500", bg: "bg-emerald-50" },
            { label: "Overdue", value: overdueCount, Icon: Warning, cls: "text-red-500", bg: "bg-red-50" },
          ].map(({ label, value, Icon, cls, bg }) => (
            <div key={label} className="surface-card p-3.5">
              <div className={`w-7 h-7 rounded-[var(--radius-sm)] ${bg} flex items-center justify-center mb-2`}>
                <Icon size={14} weight="fill" className={cls} />
              </div>
              <p className="text-[1.5rem] font-bold text-foreground font-mono leading-none mb-0.5">{value}</p>
              <p className="text-[10px] text-tertiary font-medium">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Progress bar */}
        <motion.div {...fadeUp(0.04)}>
          <div className="surface-card p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-semibold text-tertiary uppercase tracking-wider">
                Overall Progress
              </p>
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
        <motion.div {...fadeUp(0.08)}>
          <SectionLabel as="h2">Pipeline by status</SectionLabel>
          <div className="surface-card divide-y divide-border-subtle" style={{ padding: 0 }}>
            {Array.from(statusCounts.entries())
              .sort(
                (a, b) =>
                  UNIT_STATUS_ORDER[a[0] as UnitStatus] -
                  UNIT_STATUS_ORDER[b[0] as UnitStatus]
              )
              .map(([status, count]) => (
                <div key={status} className="flex items-center justify-between px-4 py-3">
                  <StatusChip status={status as UnitStatus} />
                  <span className="text-[13px] font-semibold text-foreground font-mono">
                    {count}
                  </span>
                </div>
              ))}
            {statusCounts.size === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted">No units yet</div>
            )}
          </div>
        </motion.div>

        {/* Exception flags */}
        <motion.div {...fadeUp(0.12)} className="flex flex-col gap-0">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-2 pt-1">
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
                className="flex-shrink-0 text-[11px] font-medium text-red-500 border border-red-200 bg-red-50 px-2 h-7 rounded-full"
              >
                Clear
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
            title="Overdue — Past Due Date"
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
            title="Missing Dates / Unassigned"
            icon={<CalendarX size={14} weight="fill" />}
            units={missingDateUnits}
            todayStr={today}
          />
        </motion.div>
      </div>
    </div>
  );
}
