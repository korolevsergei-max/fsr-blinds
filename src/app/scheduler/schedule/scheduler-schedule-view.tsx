"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CaretLeft,
  CaretRight,
  X,
  FunnelSimple,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { getInstallerColor, getInitials } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { DATE_RANGE_LABELS, isWithinRange, type DateRange } from "@/lib/date-range";
import { computeUnitFlags } from "@/lib/unit-flags";
import { ScheduleEntryCard } from "@/components/schedule/schedule-entry-card";

type ViewMode = "week" | "month";

function getWeekDays(baseDate: Date): Date[] {
  const monday = new Date(baseDate);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getMonthDays(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const startOffset = startDow === 0 ? -6 : 1 - startDow;
  const start = new Date(year, month, 1 + startOffset);
  const days: Date[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d);
  }
  return days;
}

function formatDateKey(d: Date): string {
  return d.toISOString().split("T")[0];
}

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function SchedulerScheduleView({ data }: { data: AppDataset }) {
  const { schedule, installers, buildings, units, clients } = data;
  const today = new Date();
  const todayStr = formatDateKey(today);

  const [view, setView] = useState<ViewMode>("week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [clientFilter, setClientFilter] = useState("all");
  const [buildingFilter, setBuildingFilter] = useState("all");
  const [installFilter, setInstallFilter] = useState<DateRange>("all");

  const availableBuildings = useMemo(
    () => (clientFilter === "all" ? buildings : buildings.filter((b) => b.clientId === clientFilter)),
    [buildings, clientFilter]
  );

  const filteredSchedule = useMemo(() => {
    return schedule.filter((s) => {
      const unit = units.find((u) => u.id === s.unitId);
      if (!unit) return false;
      if (clientFilter !== "all" && unit.clientId !== clientFilter) return false;
      if (buildingFilter !== "all" && unit.buildingId !== buildingFilter) return false;
      if (installFilter !== "all" && !isWithinRange(unit.installationDate ?? null, installFilter)) return false;
      if (!s.date) return false;

      // Defensive guard: match task type to the corresponding unit date field
      if (s.taskType === "measurement") {
        if (!unit.measurementDate) return false;
        if (unit.measurementDate.slice(0, 10) !== s.date.slice(0, 10)) return false;
      }
      if (s.taskType === "bracketing") {
        if (!unit.bracketingDate) return false;
        if (unit.bracketingDate.slice(0, 10) !== s.date.slice(0, 10)) return false;
      }
      if (s.taskType === "installation") {
        if (!unit.installationDate) return false;
        if (unit.installationDate.slice(0, 10) !== s.date.slice(0, 10)) return false;
      }
      return true;
    });
  }, [schedule, units, clientFilter, buildingFilter, installFilter]);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, typeof schedule>();
    filteredSchedule.forEach((e) => {
      const list = map.get(e.date) ?? [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [filteredSchedule]);

  const activeFilterCount = [
    clientFilter !== "all",
    buildingFilter !== "all",
    installFilter !== "all",
  ].filter(Boolean).length;

  const installerColorMap = new Map<string, ReturnType<typeof getInstallerColor>>();
  installers.forEach((inst, i) => {
    installerColorMap.set(inst.id, getInstallerColor(i));
  });

  const baseWeek = new Date(today);
  baseWeek.setDate(today.getDate() + weekOffset * 7);
  const weekDays = getWeekDays(baseWeek);

  const monthBase = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const monthDays = getMonthDays(monthBase.getFullYear(), monthBase.getMonth());

  const weekLabel = `${weekDays[0].toLocaleDateString("en-CA", { month: "short", day: "numeric" })} – ${weekDays[6].toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`;
  const monthLabel = monthBase.toLocaleDateString("en-CA", { month: "long", year: "numeric" });

  const clientOptions = [
    { value: "all", label: "All clients" },
    ...clients.map((c) => ({ value: c.id, label: c.name })),
  ];
  const buildingOptions = [
    { value: "all", label: "All buildings" },
    ...availableBuildings.map((b) => ({ value: b.id, label: b.name })),
  ];
  const completeByOptions = Object.entries(DATE_RANGE_LABELS).map(([v, label]) => ({ value: v, label }));

  const resolveEntryMeta = (entry: (typeof schedule)[0]) => {
    const unit = units.find((u) => u.id === entry.unitId);
    const instId = unit?.assignedInstallerId;
    const instColor = instId ? installerColorMap.get(instId) : null;
    const inst = instId ? installers.find((i) => i.id === instId) : null;
    const flags = unit ? computeUnitFlags(unit, todayStr) : [];
    const isOverdue = flags.includes("past_install_due") || flags.includes("past_bracketing_due");
    const installer =
      inst && instColor
        ? { name: inst.name, bg: instColor.bg, text: instColor.text, initials: getInitials(inst.name) }
        : null;
    return { isOverdue, installer };
  };

  return (
    <div className="flex flex-col">
      <PageHeader title="Schedule" />

      {/* Filters */}
      <div className="px-4 pt-3 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center gap-1.5 flex-shrink-0 text-zinc-400">
            <FunnelSimple size={14} />
            {activeFilterCount > 0 && (
              <span className="text-[10px] font-bold bg-accent text-white rounded-full w-4 h-4 flex items-center justify-center">
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
          <FilterDropdown
            label="Installation Date"
            value={installFilter}
            options={completeByOptions}
            onChange={(v) => setInstallFilter(v as DateRange)}
          />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => { setClientFilter("all"); setBuildingFilter("all"); setInstallFilter("all"); }}
              className="flex-shrink-0 flex items-center gap-1 h-8 px-2.5 rounded-full text-xs font-medium text-red-500 border border-red-200 bg-red-50"
            >
              <X size={11} weight="bold" /> Clear
            </button>
          )}
        </div>

        <div className="flex bg-zinc-100 rounded-lg p-0.5 ml-3 flex-shrink-0">
          {(["week", "month"] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`px-3 py-1.5 rounded-md text-[10px] font-semibold transition-all ${view === v ? "bg-white text-zinc-900 shadow-sm" : "text-muted"}`}
            >
              {v === "week" ? "Week" : "Month"}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <div className="px-4 py-4 pb-28">
        {view === "week" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setWeekOffset((w) => w - 1)}
                className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-card border border-border hover:bg-surface transition-colors active:scale-[0.96]"
              >
                <CaretLeft size={16} weight="bold" />
              </button>
              <span className="text-[14px] font-semibold text-foreground tracking-tight">{weekLabel}</span>
              <button
                onClick={() => setWeekOffset((w) => w + 1)}
                className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-card border border-border hover:bg-surface transition-colors active:scale-[0.96]"
              >
                <CaretRight size={16} weight="bold" />
              </button>
            </div>

            <div className="flex flex-col gap-1">
              {weekDays.map((day, dayIdx) => {
                const dateKey = formatDateKey(day);
                const entries = entriesByDate.get(dateKey) ?? [];
                const isToday = dateKey === todayStr;
                const isPast = dateKey < todayStr;

                return (
                  <motion.div
                    key={dateKey}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: dayIdx * 0.03, duration: 0.2 }}
                    className={`rounded-[var(--radius-md)] border p-3 ${
                      isToday
                        ? "border-accent/30 bg-accent/5"
                        : isPast && entries.length > 0
                          ? "border-zinc-200 bg-zinc-50/50"
                          : "border-border bg-card"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[10px] font-bold uppercase tracking-widest ${isToday ? "text-accent" : "text-muted"}`}>
                        {DAY_LABELS[dayIdx]}
                      </span>
                      <span className={`text-[13px] font-semibold ${isToday ? "text-accent" : isPast ? "text-muted" : "text-foreground"}`}>
                        {day.getDate()}
                      </span>
                      {isToday && (
                        <span className="text-[9px] font-bold text-accent bg-accent/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider ml-auto">
                          Today
                        </span>
                      )}
                    </div>
                    {entries.length > 0 ? (
                      <div className="flex flex-col gap-1.5">
                        {entries.map((e) => {
                          const { isOverdue, installer } = resolveEntryMeta(e);
                          return (
                            <ScheduleEntryCard
                              key={e.id}
                              entry={e}
                              href={`/scheduler/units/${e.unitId}`}
                              isOverdue={isOverdue}
                              installer={installer}
                              variant="week"
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[10px] text-muted italic">No tasks</p>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </>
        )}

        {view === "month" && (
          <>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setMonthOffset((m) => m - 1)}
                className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-card border border-border hover:bg-surface transition-colors active:scale-[0.96]"
              >
                <CaretLeft size={16} weight="bold" />
              </button>
              <span className="text-[14px] font-semibold text-foreground tracking-tight">{monthLabel}</span>
              <button
                onClick={() => setMonthOffset((m) => m + 1)}
                className="w-9 h-9 flex items-center justify-center rounded-[var(--radius-md)] bg-card border border-border hover:bg-surface transition-colors active:scale-[0.96]"
              >
                <CaretRight size={16} weight="bold" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-px bg-border rounded-[var(--radius-md)] overflow-hidden border border-border">
              {DAY_LABELS.map((d) => (
                <div key={d} className="bg-surface py-1.5 text-center text-[9px] font-bold uppercase tracking-wider text-muted">
                  {d.slice(0, 2)}
                </div>
              ))}
              {monthDays.map((day) => {
                const dateKey = formatDateKey(day);
                const entries = entriesByDate.get(dateKey) ?? [];
                const isToday = dateKey === todayStr;
                const isCurrentMonth = day.getMonth() === monthBase.getMonth();

                return (
                  <div
                    key={dateKey}
                    className={`bg-card min-h-[56px] p-1.5 ${!isCurrentMonth ? "opacity-40" : ""}`}
                  >
                    <span className={`text-[11px] font-semibold block mb-1 ${isToday ? "text-accent font-bold" : "text-foreground"}`}>
                      {day.getDate()}
                    </span>
                    <div className="flex flex-col gap-0.5">
                      {entries.slice(0, 2).map((e) => {
                        const { isOverdue } = resolveEntryMeta(e);
                        return (
                          <ScheduleEntryCard
                            key={e.id}
                            entry={e}
                            href={`/scheduler/units/${e.unitId}`}
                            isOverdue={isOverdue}
                            variant="month"
                          />
                        );
                      })}
                      {entries.length > 2 && (
                        <span className="text-[8px] text-muted">+{entries.length - 2}</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
