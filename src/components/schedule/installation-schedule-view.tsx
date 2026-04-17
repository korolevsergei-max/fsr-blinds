"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CaretLeft, CaretRight, FunnelSimple, X } from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { getInstallerColor, getInitials, getScheduleByInstaller } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { ScheduleEntryCard } from "@/components/schedule/schedule-entry-card";
import { ScheduleSummaryCards } from "@/components/schedule/schedule-summary-cards";
import { StickyDayRail } from "@/components/schedule/sticky-day-rail";
import {
  buildInstallationScheduleState,
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
import { computeUnitFlags } from "@/lib/unit-flags";

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function InstallationScheduleView({
  data,
  hrefBase,
  installerId,
  showInstaller = false,
  title = "Schedule",
  subtitle,
  showHeader = true,
  scope: controlledScope,
  onScopeChange,
  showScopeToggle = true,
  hideClient = false,
}: {
  data: AppDataset;
  hrefBase: string;
  installerId?: string;
  showInstaller?: boolean;
  title?: string;
  subtitle?: string;
  showHeader?: boolean;
  scope?: ScheduleScope;
  onScopeChange?: (scope: ScheduleScope) => void;
  showScopeToggle?: boolean;
  hideClient?: boolean;
}) {
  const today = new Date();
  const todayKey = formatDateKey(today);
  const [localScope, setLocalScope] = useState<ScheduleScope>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string[]>([]);
  const [installDateFilter, setInstallDateFilter] = useState<ScheduleInstallDateFilter>("all");
  const scope = controlledScope ?? localScope;
  const setScope = onScopeChange ?? setLocalScope;

  const baseEntries = installerId ? getScheduleByInstaller(data, installerId) : data.schedule;
  const state = useMemo(
    () =>
      buildInstallationScheduleState({
        data,
        baseEntries,
        today,
        scope,
        weekOffset,
        monthOffset,
        clientFilter,
        buildingFilter,
        installDateFilter,
      }),
    [baseEntries, buildingFilter, clientFilter, data, installDateFilter, monthOffset, scope, weekOffset]
  );

  const interval = getScopeInterval(scope, today, weekOffset, monthOffset);
  const availableBuildings = data.buildings.filter((building) =>
    state.availableBuildingIds.includes(building.id)
  );

  const activeFilterCount = [
    !hideClient && clientFilter.length > 0,
    buildingFilter.length > 0,
    installDateFilter !== "all",
  ].filter(Boolean).length;

  const installerColorMap = new Map<string, ReturnType<typeof getInstallerColor>>();
  data.installers.forEach((installer, index) => {
    installerColorMap.set(installer.id, getInstallerColor(index));
  });

  const resolveInstaller = (unitId: string) => {
    if (!showInstaller) return null;
    const unit = data.units.find((entry) => entry.id === unitId);
    const installerIdValue = unit?.assignedInstallerId;
    const installer = installerIdValue
      ? data.installers.find((entry) => entry.id === installerIdValue)
      : null;
    const color = installerIdValue ? installerColorMap.get(installerIdValue) : null;
    return installer && color
      ? {
          name: installer.name,
          bg: color.bg,
          text: color.text,
          initials: getInitials(installer.name),
        }
      : null;
  };

  const isEntryOverdue = (unitId: string) => {
    const unit = data.units.find((entry) => entry.id === unitId);
    if (!unit) return false;
    const flags = computeUnitFlags(unit, todayKey);
    return flags.includes("past_install_due");
  };

  const clientOptions = [
    { value: "all", label: "All clients" },
    ...data.clients.map((client) => ({ value: client.id, label: client.name })),
  ];
  const buildingOptions = [
    { value: "all", label: "All buildings" },
    ...availableBuildings.map((building) => ({ value: building.id, label: building.name })),
  ];
  const installDateOptions = Object.entries(SCHEDULE_INSTALL_DATE_FILTER_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  return (
    <div className="flex flex-col">
      {showHeader && <PageHeader title={title} subtitle={subtitle} />}

      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center gap-1.5 flex-shrink-0 text-zinc-400">
            <FunnelSimple size={14} />
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </div>
          {!hideClient && (
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
          )}
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
          <div className="mt-3 flex justify-end">
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
      </div>

      <div className="px-4 pb-2 pt-1">
        <ScheduleSummaryCards
          scheduled={state.summary.scheduled}
          completed={state.summary.completed}
          issues={state.summary.issues}
        />
      </div>

      <div className="px-4 py-4 pb-28">
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
          <div className="flex flex-col gap-6 pt-2">
            {interval.days.map((day, index) => {
              const dateKey = formatDateKey(day);
              const entries = state.entriesByDate.get(dateKey) ?? [];
              return (
                <motion.div
                  key={dateKey}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04, duration: 0.25 }}
                  className="relative"
                >
                  <StickyDayRail
                    dayLabel={DAY_LABELS[index % 7]}
                    dayNumber={day.getDate()}
                    isToday={dateKey === todayKey}
                    isPast={dateKey < todayKey}
                    taskCount={entries.length}
                  />
                  <div className="pt-3">
                    {entries.length === 0 ? (
                      <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-4 text-sm text-tertiary">
                        No tasks scheduled.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {entries.map((entry) => (
                          <ScheduleEntryCard
                            key={entry.id}
                            entry={entry}
                            href={`${hrefBase}/${entry.unitId}`}
                            isOverdue={isEntryOverdue(entry.unitId)}
                            installer={resolveInstaller(entry.unitId)}
                            variant="week"
                            hideClient={hideClient}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        ) : (
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
              const entries = state.entriesByDate.get(dateKey) ?? [];
              const isToday = dateKey === todayKey;
              const isCurrentMonth = day.getMonth() === interval.monthBase.getMonth();

              return (
                <div
                  key={dateKey}
                  className={`min-h-[68px] bg-card p-1.5 ${!isCurrentMonth ? "opacity-40" : ""}`}
                >
                  <span className={`mb-1 block text-[11px] font-semibold ${isToday ? "font-bold text-accent" : "text-foreground"}`}>
                    {day.getDate()}
                  </span>
                  <div className="flex flex-col gap-0.5">
                    {entries.slice(0, 2).map((entry) => (
                      <ScheduleEntryCard
                        key={entry.id}
                        entry={entry}
                        href={`${hrefBase}/${entry.unitId}`}
                        isOverdue={isEntryOverdue(entry.unitId)}
                        variant="month"
                        hideClient={hideClient}
                      />
                    ))}
                    {entries.length > 2 && (
                      <span className="text-[8px] text-muted">+{entries.length - 2}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
