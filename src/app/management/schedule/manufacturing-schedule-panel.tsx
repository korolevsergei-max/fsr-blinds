"use client";

import { useState } from "react";
import { CalendarBlank, Factory, Scissors, WarningCircle } from "@phosphor-icons/react";
import type { ManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { formatStoredDateLongEnglish } from "@/lib/created-date";

function formatLongDate(date: string | null) {
  return formatStoredDateLongEnglish(date) ?? date ?? "";
}

function formatMeasurement(
  width: number | null,
  height: number | null,
  depth: number | null
) {
  return `${width ?? "—"} × ${height ?? "—"}${depth != null ? ` × ${depth}` : ""}`;
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
    <div className="space-y-4 px-4 py-4">
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
            className="overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_18px_54px_rgba(15,23,42,0.05)]"
          >
            <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(250,250,249,0.98),rgba(244,244,243,0.92))] px-4 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-tertiary">
                    {bucket.label}
                  </p>
                  <p className="mt-1 text-[17px] font-semibold leading-snug tracking-tight text-foreground sm:text-[18px]">
                    {formatLongDate(bucket.date) || bucket.label}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[1.2rem] font-semibold tracking-[-0.04em] text-foreground sm:text-[1.3rem]">
                    {bucket.scheduledCount}/{bucket.capacity}
                  </p>
                  <p className={`mt-1 text-[11px] ${bucket.isOverCapacity ? "font-semibold text-amber-700" : "text-tertiary"}`}>
                    {bucket.isOverCapacity ? "Over capacity" : "Scheduled"}
                  </p>
                </div>
              </div>
            </div>

            {bucket.units.length === 0 ? (
              <p className="px-4 py-5 text-[14px] text-tertiary">Nothing scheduled here.</p>
            ) : (
              <div className="space-y-4 bg-surface/35 px-4 py-4">
                {bucket.units.map((unit) => (
                  <div
                    key={`${bucket.label}-${unit.unitId}`}
                    className="overflow-hidden rounded-[22px] border border-border bg-white shadow-[0_10px_26px_rgba(15,23,42,0.04)]"
                  >
                    <div className="grid gap-3 border-b border-border/70 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
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
                        {unit.installationDate && <span>Install {formatLongDate(unit.installationDate)}</span>}
                      </div>
                    </div>

                    <div className="space-y-5 px-4 py-4">
                      {unit.blindTypeGroups.map((group) => (
                        <div key={`${unit.unitId}-${group.blindType}`}>
                          <div className="flex items-center gap-3 border-b border-border/70 pb-2">
                            <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
                              {group.blindType}
                            </span>
                            <span className="text-[12px] text-tertiary">
                              {group.windows.length} scheduled
                            </span>
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
                                <div className="lg:min-w-[9rem] lg:text-right">
                                  <p className="font-mono text-[15px] font-semibold leading-none tracking-tight text-foreground md:text-[16px]">
                                    {formatMeasurement(
                                      window.blindWidth ?? window.width,
                                      window.blindHeight ?? window.height,
                                      window.blindDepth ?? window.depth
                                    )}
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
    <div className={`rounded-[22px] border px-4 py-3 ${classes[tone]}`}>
      <p className="font-mono text-[1.45rem] font-bold tracking-[-0.04em]">{value}</p>
      <div className="mt-2 flex items-center gap-2">
        <CalendarBlank size={15} weight="fill" />
        <span className="text-[11px] font-medium uppercase tracking-[0.05em]">{label}</span>
      </div>
    </div>
  );
}
