"use client";

import { useState } from "react";
import { CalendarBlank, Factory, Scissors, WarningCircle } from "@phosphor-icons/react";
import type { ManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";

export function ManufacturingSchedulePanel({
  cutterSchedule,
  assemblerSchedule,
}: {
  cutterSchedule: ManufacturingRoleSchedule;
  assemblerSchedule: ManufacturingRoleSchedule;
}) {
  const [role, setRole] = useState<"cutter" | "assembler">("cutter");
  const schedule = role === "cutter" ? cutterSchedule : assemblerSchedule;

  return (
    <div className="px-4 py-4 space-y-4">
      <div className="flex gap-2">
        <button
          onClick={() => setRole("cutter")}
          className={[
            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
            role === "cutter"
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card text-secondary hover:bg-surface",
          ].join(" ")}
        >
          <Scissors size={16} weight={role === "cutter" ? "fill" : "regular"} />
          Cutter
        </button>
        <button
          onClick={() => setRole("assembler")}
          className={[
            "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition-colors",
            role === "assembler"
              ? "border-foreground bg-foreground text-background"
              : "border-border bg-card text-secondary hover:bg-surface",
          ].join(" ")}
        >
          <Factory size={16} weight={role === "assembler" ? "fill" : "regular"} />
          Assembler
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Today" value={schedule.todayCount} tone="emerald" />
        <SummaryCard label="Next Day" value={schedule.tomorrowCount} tone="blue" />
        <SummaryCard label="Issues" value={schedule.issueCount} tone="amber" />
        <SummaryCard label="Unscheduled" value={schedule.unscheduledCount} tone="zinc" />
      </div>

      {schedule.buckets.map((bucket) => (
        <section key={bucket.label + bucket.date} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{bucket.label}</p>
              {bucket.date && (
                <p className="text-xs text-tertiary mt-1">{bucket.date}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">
                {bucket.scheduledCount}/{bucket.capacity}
              </p>
              {bucket.isOverCapacity ? (
                <p className="text-xs font-medium text-amber-600">Over capacity</p>
              ) : (
                <p className="text-xs text-tertiary">Scheduled</p>
              )}
            </div>
          </div>

          {bucket.units.length === 0 ? (
            <p className="text-sm text-tertiary">Nothing scheduled here.</p>
          ) : (
            <div className="space-y-3">
              {bucket.units.map((unit) => (
                <div key={`${bucket.label}-${unit.unitId}`} className="rounded-2xl border border-border bg-surface p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Unit {unit.unitNumber}
                      </p>
                      <p className="text-xs text-tertiary mt-1">
                        {unit.buildingName} · {unit.clientName}
                      </p>
                    </div>
                    <div className="text-right text-xs text-tertiary">
                      <p>{unit.scheduledCount} blind{unit.scheduledCount === 1 ? "" : "s"}</p>
                      {unit.installationDate && <p>Install {unit.installationDate}</p>}
                    </div>
                  </div>

                  <div className="mt-3 space-y-2">
                    {unit.blindTypeGroups.map((group) => (
                      <div key={`${unit.unitId}-${group.blindType}`} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                            {group.blindType}
                          </span>
                          <span className="text-xs text-tertiary">
                            {group.windows.length}
                          </span>
                        </div>
                        <div className="mt-2 space-y-2">
                          {group.windows.map((window) => (
                            <div key={window.windowId} className="rounded-xl border border-border bg-white px-3 py-2">
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="text-sm font-semibold text-foreground">{window.label}</p>
                                  <p className="text-xs text-tertiary mt-1">{window.roomName}</p>
                                </div>
                                <span className="text-sm font-semibold text-foreground">
                                  {(window.blindWidth ?? window.width) ?? "—"} × {(window.blindHeight ?? window.height) ?? "—"}
                                </span>
                              </div>
                              {window.issueStatus === "open" && (
                                <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700">
                                  <WarningCircle size={13} weight="fill" />
                                  {window.issueReason || "Issue open"}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "blue" | "amber" | "zinc";
}) {
  const classes = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    zinc: "border-border bg-card text-zinc-700",
  };

  return (
    <div className={`rounded-2xl border px-3 py-3 ${classes[tone]}`}>
      <div className="flex items-center gap-2">
        <CalendarBlank size={16} weight="fill" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
