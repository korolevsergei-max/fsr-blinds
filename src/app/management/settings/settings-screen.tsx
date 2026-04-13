"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CaretLeft, CaretRight, CheckCircle, Factory, HardDrives, UsersFour } from "@phosphor-icons/react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataManagementSection } from "@/components/settings/data-management-section";
import type { ManufacturingCalendarOverride, ManufacturingSettings } from "@/lib/types";
import {
  getOntarioHolidayName,
  isWorkingDay,
  listMonthDays,
} from "@/lib/manufacturing-calendar";
import {
  toggleManufacturingWorkday,
  updateManufacturingSettings,
} from "@/app/actions/manufacturing-actions";

type SettingsTab = "manufacturing" | "accounts" | "data";

function formatMonthLabel(baseDate: Date) {
  return baseDate.toLocaleDateString("en-CA", {
    month: "long",
    year: "numeric",
  });
}

function dayNumber(dateKey: string) {
  return Number(dateKey.slice(-2));
}

function dateToMonth(dateKey: string) {
  return new Date(`${dateKey}T00:00:00`).getMonth();
}

export function SettingsScreen({
  initialTab,
  accounts,
  showDataTab,
  settings,
  overrides,
}: {
  initialTab: SettingsTab;
  accounts: ReactNode;
  showDataTab: boolean;
  settings: ManufacturingSettings;
  overrides: ManufacturingCalendarOverride[];
}) {
  const router = useRouter();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [settingsPending, startSettingsTransition] = useTransition();
  const [, startCalendarTransition] = useTransition();
  const [monthOffset, setMonthOffset] = useState(0);
  const [cutterCapacity, setCutterCapacity] = useState(String(settings.cutterDailyCapacity));
  const [assemblerCapacity, setAssemblerCapacity] = useState(String(settings.assemblerDailyCapacity));
  const [qcCapacity, setQcCapacity] = useState(String(settings.qcDailyCapacity));
  const [applyHolidays, setApplyHolidays] = useState(settings.applyOntarioHolidays);
  const [optimisticOverrides, setOptimisticOverrides] = useState<Map<string, ManufacturingCalendarOverride>>(
    () => new Map()
  );
  const [pendingDates, setPendingDates] = useState<string[]>([]);

  const baseMonth = useMemo(() => {
    const current = new Date();
    return new Date(current.getFullYear(), current.getMonth() + monthOffset, 1);
  }, [monthOffset]);

  const overridesByDate = useMemo(() => {
    const next = new Map(overrides.map((override) => [override.workDate, override]));
    optimisticOverrides.forEach((override, date) => {
      next.set(date, override);
    });
    return next;
  }, [optimisticOverrides, overrides]);

  const calendarDays = useMemo(() => {
    return listMonthDays(baseMonth.getFullYear(), baseMonth.getMonth()).map((date) => {
      const holidayName = applyHolidays ? getOntarioHolidayName(date) : null;
      const override = overridesByDate.get(date) ?? null;
      return {
        date,
        day: dayNumber(date),
        isCurrentMonth: dateToMonth(date) === baseMonth.getMonth(),
        holidayName,
        isWorking: isWorkingDay(date, { applyOntarioHolidays: applyHolidays }, overridesByDate),
        override,
      };
    });
  }, [applyHolidays, baseMonth, overridesByDate]);

  const saveSettings = () => {
    startSettingsTransition(async () => {
      const result = await updateManufacturingSettings(
        Number(cutterCapacity || 0),
        Number(assemblerCapacity || 0),
        Number(qcCapacity || 0),
        applyHolidays
      );
      if (!result.ok) {
        window.alert(result.error);
        return;
      }
      router.refresh();
    });
  };

  const toggleDay = (date: string, nextWorking: boolean, label: string) => {
    setOptimisticOverrides((current) => {
      const next = new Map(current);
      const existing = overridesByDate.get(date);
      next.set(date, {
        id: existing?.id ?? `pending-${date}`,
        workDate: date,
        isWorking: nextWorking,
        label,
      });
      return next;
    });
    setPendingDates((current) => [...current, date]);

    startCalendarTransition(async () => {
      const result = await toggleManufacturingWorkday(date, nextWorking, label);
      if (!result.ok) {
        setOptimisticOverrides((current) => {
          const next = new Map(current);
          next.delete(date);
          return next;
        });
        setPendingDates((current) => current.filter((entry) => entry !== date));
        window.alert(result.error);
        return;
      }

      setOptimisticOverrides((current) => {
        const next = new Map(current);
        next.delete(date);
        return next;
      });
      setPendingDates((current) => current.filter((entry) => entry !== date));
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col pb-24">
      <PageHeader
        title="Settings"
        subtitle={
          showDataTab
            ? "Accounts, manufacturing, and data controls"
            : "Accounts and manufacturing controls"
        }
        belowTitle={
          <div className="flex gap-2">
            <TabButton
              active={tab === "manufacturing"}
              icon={<Factory size={16} weight={tab === "manufacturing" ? "fill" : "regular"} />}
              label="Manufacturing"
              onClick={() => setTab("manufacturing")}
            />
            <TabButton
              active={tab === "accounts"}
              icon={<UsersFour size={16} weight={tab === "accounts" ? "fill" : "regular"} />}
              label="Accounts"
              onClick={() => setTab("accounts")}
            />
            {showDataTab && (
              <TabButton
                active={tab === "data"}
                icon={<HardDrives size={16} weight={tab === "data" ? "fill" : "regular"} />}
                label="Data"
                onClick={() => setTab("data")}
              />
            )}
          </div>
        }
      />

      {tab === "manufacturing" ? (
        <div className="px-4 py-4 space-y-5">
          <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <div>
              <p className="text-sm font-semibold text-foreground">Daily Capacity</p>
              <p className="text-xs text-tertiary mt-1">
                Changes here immediately reflow all future cutter, assembler, and QC schedules.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Input
                label="Cutting"
                inputMode="numeric"
                value={cutterCapacity}
                onChange={(event) => setCutterCapacity(event.target.value)}
              />
              <Input
                label="Assembling"
                inputMode="numeric"
                value={assemblerCapacity}
                onChange={(event) => setAssemblerCapacity(event.target.value)}
              />
              <Input
                label="QC"
                inputMode="numeric"
                value={qcCapacity}
                onChange={(event) => setQcCapacity(event.target.value)}
              />
            </div>

            <label className="flex items-start gap-3 rounded-xl border border-border bg-surface px-3 py-3">
              <input
                type="checkbox"
                className="mt-1 accent-[var(--accent)]"
                checked={applyHolidays}
                onChange={(event) => setApplyHolidays(event.target.checked)}
              />
              <div>
                <p className="text-sm font-medium text-foreground">Apply Ontario Holidays</p>
                <p className="text-xs text-tertiary mt-1">
                  When enabled, Ontario holidays become non-working days by default. You can still click any holiday to turn it back on.
                </p>
              </div>
            </label>

            <Button onClick={saveSettings} disabled={settingsPending}>
              {settingsPending ? "Saving…" : "Save Manufacturing Settings"}
            </Button>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-foreground">Work Calendar</p>
                <p className="text-xs text-tertiary mt-1">
                  Green checkmarks are working days. Click any day to toggle it and reflow future schedules.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMonthOffset((value) => value - 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-secondary transition-colors hover:bg-surface"
                >
                  <CaretLeft size={16} weight="bold" />
                </button>
                <div className="min-w-[8rem] text-center text-sm font-semibold text-foreground">
                  {formatMonthLabel(baseMonth)}
                </div>
                <button
                  onClick={() => setMonthOffset((value) => value + 1)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-secondary transition-colors hover:bg-surface"
                >
                  <CaretRight size={16} weight="bold" />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase tracking-wide text-tertiary">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                <div key={label} className="px-1 py-1 text-center">
                  {label}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const label = day.holidayName ?? (day.isCurrentMonth ? "Manual override" : "Adjacent month");
                return (
                  <button
                    key={day.date}
                    onClick={() => toggleDay(day.date, !day.isWorking, label)}
                    disabled={pendingDates.includes(day.date)}
                    className={[
                      "min-h-[4.75rem] rounded-2xl border p-2 text-left transition-colors",
                      day.isCurrentMonth ? "bg-card" : "bg-zinc-50",
                      day.isWorking
                        ? "border-emerald-200 bg-emerald-50"
                        : "border-border",
                      pendingDates.includes(day.date) ? "opacity-70" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className={day.isCurrentMonth ? "text-sm font-semibold text-foreground" : "text-sm font-semibold text-tertiary"}>
                        {day.day}
                      </span>
                      {day.isWorking && (
                        <CheckCircle size={16} weight="fill" className="text-emerald-600" />
                      )}
                    </div>
                    {day.holidayName && (
                      <p className="mt-2 line-clamp-2 text-[10px] font-medium text-amber-700">
                        {day.holidayName}
                      </p>
                    )}
                    {!day.holidayName && day.override?.label && (
                      <p className="mt-2 line-clamp-2 text-[10px] text-tertiary">
                        {day.override.label}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      ) : tab === "accounts" ? (
        <div>{accounts}</div>
      ) : (
        <div className="px-4 py-4 space-y-5">
          <DataManagementSection />
        </div>
      )}
    </div>
  );
}

function TabButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-card text-secondary hover:bg-surface",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}
