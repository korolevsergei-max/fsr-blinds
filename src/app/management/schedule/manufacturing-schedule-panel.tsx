"use client";

import { useState } from "react";
import { CalendarBlank, Factory, Scissors, WarningCircle } from "@phosphor-icons/react";
import type { ManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { formatStoredDateLongEnglish } from "@/lib/created-date";

function formatLongDate(date: string | null) {
  return formatStoredDateLongEnglish(date) ?? date ?? "";
}

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
        <SummaryCard label="Next day" value={schedule.tomorrowCount} tone="blue" />
        <SummaryCard label="Issues" value={schedule.issueCount} tone="amber" />
        <SummaryCard label="Unscheduled" value={schedule.unscheduledCount} tone="zinc" />
      </div>

      <div className="space-y-4">
        {schedule.buckets.map((bucket) => (
          <section
            key={bucket.label + bucket.date}
            className="overflow-hidden rounded-[28px] border border-border bg-card shadow-[0_20px_60px_rgba(15,23,42,0.06)]"
          >
            <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(250,250,249,0.98),rgba(244,244,243,0.92))] px-5 py-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-tertiary">
                    {bucket.label}
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-[-0.03em] text-foreground">
                    {formatLongDate(bucket.date) || bucket.label}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-2xl font-bold tracking-[-0.04em] text-foreground">
                    {bucket.scheduledCount}/{bucket.capacity}
                  </p>
                  <p className={`mt-1 text-xs ${bucket.isOverCapacity ? "font-semibold text-amber-700" : "text-tertiary"}`}>
                    {bucket.isOverCapacity ? "Over capacity" : "Scheduled"}
                  </p>
                </div>
              </div>
            </div>

            {bucket.units.length === 0 ? (
              <p className="px-5 py-5 text-sm text-tertiary">Nothing scheduled here.</p>
            ) : (
              <div className="divide-y divide-border/80">
                {bucket.units.map((unit) => (
                  <div key={`${bucket.label}-${unit.unitId}`} className="px-5 py-4">
                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                      <div>
                        <p className="text-lg font-semibold tracking-[-0.02em] text-foreground">
                          Unit {unit.unitNumber}
                        </p>
                        <p className="mt-1 text-sm text-secondary">
                          {unit.buildingName} · {unit.clientName}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-tertiary sm:justify-end">
                        <span>{unit.scheduledCount} blinds</span>
                        {unit.installationDate && <span>Install {formatLongDate(unit.installationDate)}</span>}
                      </div>
                    </div>

                    <div className="mt-4 space-y-4">
                      {unit.blindTypeGroups.map((group) => (
                        <div key={`${unit.unitId}-${group.blindType}`}>
                          <div className="flex items-center gap-3 border-b border-border/70 pb-2">
                            <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-secondary">
                              {group.blindType}
                            </span>
                            <span className="text-xs text-tertiary">
                              {group.windows.length} scheduled
                            </span>
                          </div>

                          <div className="divide-y divide-border/60">
                            {group.windows.map((window) => (
                              <article
                                key={window.windowId}
                                className="grid gap-3 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
                              >
                                <div>
                                  <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                                    <p className="text-xl font-semibold tracking-[-0.03em] text-foreground">
                                      {window.label}
                                    </p>
                                    <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-medium text-secondary">
                                      {window.roomName}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-tertiary">
                                    {window.targetReadyDate && (
                                      <span>Ready by {formatLongDate(window.targetReadyDate)}</span>
                                    )}
                                    {window.issueStatus === "open" && (
                                      <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                                        <WarningCircle size={13} weight="fill" />
                                        {window.issueReason || "Issue open"}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="lg:text-right">
                                  <p className="font-mono text-[1.75rem] font-bold leading-none tracking-[-0.08em] text-foreground">
                                    {(window.blindWidth ?? window.width) ?? "—"} × {(window.blindHeight ?? window.height) ?? "—"}
                                    {window.blindDepth != null || window.depth != null
                                      ? ` × ${window.blindDepth ?? window.depth}`
                                      : ""}
                                  </p>
                                </div>
                              </article>
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
      <p className="mt-2 font-mono text-2xl font-bold tracking-[-0.05em]">{value}</p>
    </div>
  );
}
