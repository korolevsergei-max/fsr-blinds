"use client";

import { useMemo, useState } from "react";
import { CaretLeft, CaretRight, Factory, FunnelSimple, Scissors, WarningCircle, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import type { ManufacturingRoleSchedule, ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import { formatStoredDateLongEnglish } from "@/lib/created-date";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { ScheduleSummaryCards } from "@/components/schedule/schedule-summary-cards";
import { StickyDayRail } from "@/components/schedule/sticky-day-rail";
import { StickySectionRail } from "@/components/schedule/sticky-section-rail";
import {
  buildManufacturingScheduleState,
} from "@/lib/schedule-view-model";
import {
  formatDateKey,
  getMonthDays,
  getScopeInterval,
  SCHEDULE_INSTALL_DATE_FILTER_LABELS,
  SCHEDULE_SCOPE_LABELS,
  type ScheduleInstallDateFilter,
  type ScheduleScope,
} from "@/lib/schedule-ui";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ROLE_LABELS = {
  cutter: "Cutting",
  assembler: "Assembly",
  qc: "QC",
} as const;

type ManufacturingRole = keyof typeof ROLE_LABELS;

function formatMeasurement(item: ManufacturingWindowItem) {
  return `${item.blindWidth ?? item.width ?? "—"} × ${item.blindHeight ?? item.height ?? "—"}${
    item.blindDepth != null ? ` × ${item.blindDepth}` : item.depth != null ? ` × ${item.depth}` : ""
  }`;
}

function renderUnitCard(
  unit: ManufacturingRoleSchedule["buckets"][number]["units"][number],
  role: ManufacturingRole,
  unitHrefBase: string,
  router: ReturnType<typeof useRouter>,
  metaLabel?: string
) {
  return (
    <div
      key={`${role}-${unit.unitId}-${metaLabel ?? "dated"}`}
      className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card"
    >
      <button
        onClick={() => router.push(`${unitHrefBase}/${unit.unitId}`)}
        className="w-full border-b border-border/70 px-4 py-4 text-left"
      >
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-foreground">
              Unit {unit.unitNumber}
            </p>
            <p className="mt-1 text-[12px] text-secondary">
              {unit.buildingName} · {unit.clientName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-tertiary sm:justify-end">
            <span>{unit.scheduledCount} blinds</span>
            {unit.installationDate && (
              <span>
                Install {formatStoredDateLongEnglish(unit.installationDate) ?? unit.installationDate}
              </span>
            )}
          </div>
        </div>
      </button>

      <div className="space-y-5 px-4 py-4">
        {unit.blindTypeGroups.map((group) => (
          <div key={`${unit.unitId}-${group.blindType}`}>
            <div className="flex items-center gap-3 border-b border-border/70 pb-2">
              <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
                {group.blindType}
              </span>
              <span className="text-[12px] text-tertiary">{group.windows.length} scheduled</span>
            </div>

            <div className="divide-y divide-border/60">
              {group.windows.map((window) => (
                <article
                  key={window.windowId}
                  className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
                >
                  <div>
                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                      <p className="text-[15px] font-semibold tracking-tight text-foreground">
                        {window.label}
                      </p>
                      <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-medium text-secondary">
                        {window.roomName}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-tertiary">
                      {window.targetReadyDate && (
                        <span>
                          Ready by {formatStoredDateLongEnglish(window.targetReadyDate) ?? window.targetReadyDate}
                        </span>
                      )}
                      {(window.issueStatus === "open" || window.escalation) && (
                        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                          <WarningCircle size={13} weight="fill" />
                          {window.issueReason || window.escalation?.reason || "Issue open"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="lg:min-w-[9rem] lg:text-right">
                    <p className="font-mono text-[15px] font-semibold leading-none tracking-tight text-foreground md:text-[16px]">
                      {formatMeasurement(window)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function groupUnits(items: ManufacturingWindowItem[]) {
  const unitMap = new Map<string, ManufacturingRoleSchedule["buckets"][number]["units"][number]>();
  for (const item of items) {
    const existing = unitMap.get(item.unitId);
    if (!existing) {
      unitMap.set(item.unitId, {
        unitId: item.unitId,
        unitNumber: item.unitNumber,
        buildingName: item.buildingName,
        clientName: item.clientName,
        installationDate: item.installationDate,
        scheduledCount: 1,
        blindTypeGroups: [{ blindType: item.blindType, windows: [item] }],
      });
      continue;
    }

    existing.scheduledCount += 1;
    const group = existing.blindTypeGroups.find((entry) => entry.blindType === item.blindType);
    if (group) {
      group.windows.push(item);
    } else {
      existing.blindTypeGroups.push({ blindType: item.blindType, windows: [item] });
    }
  }

  return [...unitMap.values()];
}

export function ManufacturingScheduleView({
  schedulesByRole,
  role: fixedRole,
  showRoleSelector = false,
  unitHrefBase,
  scope: controlledScope,
  onScopeChange,
  showScopeToggle = true,
}: {
  schedulesByRole: Record<ManufacturingRole, ManufacturingRoleSchedule>;
  role?: ManufacturingRole;
  showRoleSelector?: boolean;
  unitHrefBase: string;
  scope?: ScheduleScope;
  onScopeChange?: (scope: ScheduleScope) => void;
  showScopeToggle?: boolean;
}) {
  const today = new Date();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<ManufacturingRole>(fixedRole ?? "cutter");
  const [localScope, setLocalScope] = useState<ScheduleScope>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string[]>([]);
  const [installDateFilter, setInstallDateFilter] = useState<ScheduleInstallDateFilter>("all");
  const scope = controlledScope ?? localScope;
  const setScope = onScopeChange ?? setLocalScope;

  const role = fixedRole ?? selectedRole;
  const schedule = schedulesByRole[role];
  const currentWorkDate = schedule.currentWorkDate;
  const workDate = new Date(`${currentWorkDate}T00:00:00`);
  const interval = getScopeInterval(scope, scope === "today" ? workDate : today, weekOffset, monthOffset);

  const allItems = schedule.allItems;
  const clientOptions = [
    { value: "all", label: "All clients" },
    ...[
      ...new Map(
        allItems.map((item) => [item.clientId, { value: item.clientId, label: item.clientName }])
      ).values(),
    ],
  ];

  const state = useMemo(
    () =>
      buildManufacturingScheduleState({
        schedule,
        role,
        today,
        scope,
        weekOffset,
        monthOffset,
        clientFilter,
        buildingFilter,
        installDateFilter,
      }),
    [buildingFilter, clientFilter, installDateFilter, monthOffset, role, schedule, scope, weekOffset]
  );

  const buildingOptions = [
    { value: "all", label: "All buildings" },
    ...[
      ...new Map(
        allItems
          .filter((item) => state.availableBuildingIds.includes(item.buildingId))
          .map((item) => [item.buildingId, { value: item.buildingId, label: item.buildingName }])
      ).values(),
    ],
  ];

  const activeFilterCount = [
    clientFilter.length > 0,
    buildingFilter.length > 0,
    installDateFilter !== "all",
  ].filter(Boolean).length;

  const installDateOptions = Object.entries(SCHEDULE_INSTALL_DATE_FILTER_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div className="space-y-4 px-4 py-4">
      {showRoleSelector && (
        <div className="flex gap-2">
          {(Object.keys(ROLE_LABELS) as ManufacturingRole[]).map((value) => {
            const Icon = value === "cutter" ? Scissors : value === "assembler" ? Factory : WarningCircle;
            return (
              <button
                key={value}
                onClick={() => setSelectedRole(value)}
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
                  role === value
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-card text-secondary hover:bg-surface",
                ].join(" ")}
              >
                <Icon size={16} weight={role === value ? "fill" : "regular"} />
                {ROLE_LABELS[value]}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
        <div className="flex items-center gap-1.5 flex-shrink-0 text-zinc-400">
          <FunnelSimple size={14} />
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        <FilterDropdown
          multiple
          label="Client"
          values={clientFilter}
          options={clientOptions}
          onChange={(values) => {
            setClientFilter(values);
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
          label="Installation Date"
          value={installDateFilter}
          options={installDateOptions}
          onChange={(value) => setInstallDateFilter(value as ScheduleInstallDateFilter)}
        />
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setClientFilter([]);
              setBuildingFilter([]);
              setInstallDateFilter("all");
            }}
            className="flex h-8 flex-shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-500"
          >
            <X size={11} weight="bold" />
            Clear
          </button>
        )}
      </div>

      {showScopeToggle && (
        <div className="flex justify-end">
          <div className="flex flex-shrink-0 rounded-lg bg-zinc-100 p-0.5">
            {(Object.keys(SCHEDULE_SCOPE_LABELS) as ScheduleScope[]).map((value) => (
              <button
                key={value}
                onClick={() => setScope(value)}
                className={`rounded-md px-3 py-1.5 text-[10px] font-semibold transition-all ${
                  scope === value ? "bg-white text-zinc-900 shadow-sm" : "text-muted"
                }`}
              >
                {SCHEDULE_SCOPE_LABELS[value]}
              </button>
            ))}
          </div>
        </div>
      )}

      <ScheduleSummaryCards
        scheduled={state.summary.scheduled}
        completed={state.summary.completed}
        issues={state.summary.issues}
      />

      {scope !== "today" && (
        <div className="mb-7 flex min-h-[3.25rem] items-center justify-between overflow-visible pt-2 pb-4">
          <button
            onClick={() => (scope === "week" ? setWeekOffset((value) => value - 1) : setMonthOffset((value) => value - 1))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border bg-card transition-colors hover:bg-surface active:scale-[0.96]"
          >
            <CaretLeft size={16} weight="bold" />
          </button>
          <span className="text-[14px] font-semibold tracking-tight text-foreground">
            {interval.label}
          </span>
          <button
            onClick={() => (scope === "week" ? setWeekOffset((value) => value + 1) : setMonthOffset((value) => value + 1))}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-border bg-card transition-colors hover:bg-surface active:scale-[0.96]"
          >
            <CaretRight size={16} weight="bold" />
          </button>
        </div>
      )}

      {scope !== "month" ? (
        <div className="space-y-4 pt-0">
          {interval.days.map((day, index) => {
            const dateKey = formatDateKey(day);
            const items = state.datedEntriesByDate.get(dateKey) ?? [];
            const units = groupUnits(items);

            return (
              <section key={dateKey} className="relative">
                <StickyDayRail
                  dayLabel={DAY_LABELS[index % 7]}
                  dayNumber={day.getDate()}
                  isToday={dateKey === currentWorkDate}
                  isPast={dateKey < currentWorkDate}
                  taskCount={items.length}
                />

                <div className="pt-3">
                  {units.length === 0 ? (
                    <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-4 text-sm text-tertiary">
                      Nothing scheduled here.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2">
                      {units.map((unit) => renderUnitCard(unit, role, unitHrefBase, router, dateKey))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}

          {state.issueItems.length > 0 && (
            <section className="relative">
              <StickySectionRail label="Issues" count={state.issueItems.length} />
              <div className="pt-3">
                <div className="flex flex-col gap-2">
                  {groupUnits(state.issueItems).map((unit) => renderUnitCard(unit, role, unitHrefBase, router, "issues"))}
                </div>
              </div>
            </section>
          )}

          {scope !== "today" && state.unscheduledItems.length > 0 && (
            <section className="relative">
              <StickySectionRail label="Unscheduled" count={state.unscheduledItems.length} />
              <div className="pt-3">
                <div className="flex flex-col gap-2">
                  {groupUnits(state.unscheduledItems).map((unit) => renderUnitCard(unit, role, unitHrefBase, router, "unscheduled"))}
                </div>
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-[var(--radius-md)] border border-border bg-border">
            {DAY_LABELS.map((label) => (
              <div
                key={label}
                className="bg-surface py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-muted"
              >
                {label.slice(0, 2)}
              </div>
            ))}

            {getMonthDays(interval.monthBase.getFullYear(), interval.monthBase.getMonth()).map((day) => {
              const dateKey = formatDateKey(day);
              const items = state.datedEntriesByDate.get(dateKey) ?? [];
              const units = groupUnits(items);
              const isCurrentMonth = day.getMonth() === interval.monthBase.getMonth();
              const isToday = dateKey === currentWorkDate;

              return (
                <div
                  key={dateKey}
                  className={`min-h-[72px] bg-card p-1.5 ${!isCurrentMonth ? "opacity-40" : ""}`}
                >
                  <span className={`mb-1 block text-[11px] font-semibold ${isToday ? "font-bold text-accent" : "text-foreground"}`}>
                    {day.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {units.slice(0, 2).map((unit) => (
                      <button
                        key={`${dateKey}-${unit.unitId}`}
                        onClick={() => router.push(`${unitHrefBase}/${unit.unitId}`)}
                        className="truncate rounded bg-emerald-100 px-1 py-0.5 text-left text-[8px] font-medium text-emerald-700"
                      >
                        {unit.unitNumber}
                      </button>
                    ))}
                    {units.length > 2 && (
                      <span className="text-[8px] text-muted">+{units.length - 2}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {state.issueItems.length > 0 && (
            <section className="relative">
              <StickySectionRail label="Issues" count={state.issueItems.length} />
              <div className="pt-3">
                <div className="flex flex-col gap-2">
                  {groupUnits(state.issueItems).map((unit) => renderUnitCard(unit, role, unitHrefBase, router, "issues"))}
                </div>
              </div>
            </section>
          )}

          {state.unscheduledItems.length > 0 && (
            <section className="relative">
              <StickySectionRail label="Unscheduled" count={state.unscheduledItems.length} />
              <div className="pt-3">
                <div className="flex flex-col gap-2">
                  {groupUnits(state.unscheduledItems).map((unit) => renderUnitCard(unit, role, unitHrefBase, router, "unscheduled"))}
                </div>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
