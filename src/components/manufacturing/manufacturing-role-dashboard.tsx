"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarBlank, Factory, Queue, SignOut, WarningCircle } from "@phosphor-icons/react";
import type { ManufacturingRoleSchedule } from "@/lib/manufacturing-scheduler";
import { signOut } from "@/app/actions/auth-actions";
import { formatStoredDateLongEnglish } from "@/lib/created-date";

export function ManufacturingRoleDashboard({
  role,
  schedule,
  userName,
}: {
  role: "cutter" | "assembler";
  schedule: ManufacturingRoleSchedule;
  userName?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();

  const headline =
    role === "cutter" ? "Cutting" : "Assembly & QC";
  const queueHref = role === "cutter" ? "/cutter/queue" : "/assembler/queue";
  const queueLabel = role === "cutter" ? "Open Cutting Queue" : "Open Assembly Queue";
  const highlightBucket = schedule.buckets.find((bucket) => bucket.date) ?? schedule.buckets[0];

  return (
    <div className="px-4 pt-6 pb-4 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] text-tertiary uppercase tracking-[0.18em] font-medium mb-1">
            {role === "cutter" ? "Cutter" : "Assembler"}
          </p>
          <h1 className="text-[1.65rem] font-semibold tracking-[-0.04em] text-primary">
            {userName ? `Hi, ${userName.split(" ")[0]}` : headline}
          </h1>
        </div>
        <button
          onClick={() => startSignOut(async () => { await signOut(); })}
          disabled={signingOut}
          className="flex items-center gap-1.5 text-xs text-tertiary hover:text-secondary transition-colors px-2 py-1.5 rounded-md hover:bg-muted"
        >
          <SignOut size={14} />
          Sign out
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Today" value={schedule.todayCount} tone="emerald" />
        <StatCard label="Next Day" value={schedule.tomorrowCount} tone="blue" />
        <StatCard label="Issues" value={schedule.issueCount} tone="amber" />
        <StatCard label="Unscheduled" value={schedule.unscheduledCount} tone="zinc" />
      </div>

      <button
        onClick={() => router.push(queueHref)}
        className="w-full flex items-center justify-between rounded-2xl bg-accent px-4 py-3 text-white transition-opacity active:opacity-80"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Queue size={18} />
          {queueLabel}
        </span>
        <span className="font-mono text-[15px] text-white/80">
          {schedule.todayCount} today
        </span>
      </button>

      {schedule.issueCount > 0 && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
            <WarningCircle size={16} weight="fill" />
            {schedule.issueCount} manufacturing issue{schedule.issueCount === 1 ? "" : "s"} open
          </p>
          <p className="mt-1 text-xs text-amber-700/90">
            Open the queue to resolve blocked blinds and reflow the downstream work.
          </p>
        </div>
      )}

      {highlightBucket && highlightBucket.units.length > 0 && (
        <div className="rounded-[24px] border border-border bg-card px-4 py-4 space-y-3 shadow-[0_18px_50px_rgba(15,23,42,0.05)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tertiary">
                {highlightBucket.date && highlightBucket.label === highlightBucket.date ? "Work day" : highlightBucket.label}
              </p>
              {highlightBucket.date && (
                <p className="mt-1 text-[1.15rem] font-semibold tracking-[-0.03em] text-foreground">
                  {formatStoredDateLongEnglish(highlightBucket.date) ?? highlightBucket.date}
                </p>
              )}
            </div>
            <span className="font-mono text-[15px] text-tertiary">
              {highlightBucket.scheduledCount}/{highlightBucket.capacity}
            </span>
          </div>

          <div className="space-y-2">
            {highlightBucket.units.slice(0, 3).map((unit) => (
              <button
                key={unit.unitId}
                onClick={() => router.push(`/${role}/units/${unit.unitId}`)}
                className="w-full rounded-2xl border border-border bg-white px-3 py-3 text-left transition-colors hover:bg-surface"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[1rem] font-semibold tracking-[-0.02em] text-foreground">Unit {unit.unitNumber}</p>
                    <p className="mt-1 text-[13px] text-tertiary">
                      {unit.buildingName} · {unit.clientName}
                    </p>
                  </div>
                  <span className="text-[13px] text-tertiary">
                    {unit.scheduledCount} blind{unit.scheduledCount === 1 ? "" : "s"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "blue" | "amber" | "zinc";
}) {
  const Icon = tone === "emerald" ? CalendarBlank : tone === "blue" ? Queue : tone === "amber" ? WarningCircle : Factory;
  const classes = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    zinc: "border-border bg-card text-zinc-700",
  };

  return (
    <div className={`rounded-xl border px-3 py-3 ${classes[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} weight="fill" />
        <span className="text-[11px] font-medium uppercase tracking-[0.08em]">{label}</span>
      </div>
      <p className="mt-2 font-mono text-[1.6rem] font-bold tracking-[-0.06em]">{value}</p>
    </div>
  );
}
