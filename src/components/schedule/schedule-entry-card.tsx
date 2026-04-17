"use client";

import Link from "next/link";
import { Wrench, Hammer, Warning } from "@phosphor-icons/react";
import { StatusChip } from "@/components/ui/status-chip";
import type { ScheduleEntry } from "@/lib/types";

type InstallerBadge = {
  name: string;
  bg: string;
  text: string;
  initials: string;
};

interface ScheduleEntryCardProps {
  entry: ScheduleEntry;
  href: string;
  isOverdue: boolean;
  installer?: InstallerBadge | null;
  /** "week" renders a full card; "month" renders a compact inline pill */
  variant?: "week" | "month";
  hideClient?: boolean;
}

export function ScheduleEntryCard({
  entry,
  href,
  isOverdue,
  installer,
  variant = "week",
  hideClient = false,
}: ScheduleEntryCardProps) {
  const isMeasurement = entry.taskType === "measurement";
  const isBracketing = entry.taskType === "bracketing";
  const Icon = isMeasurement || isBracketing ? Wrench : Hammer;
  const taskLabel = isMeasurement ? "Measure" : isBracketing ? "Bracket" : "Installed";

  const tone = isOverdue
    ? {
        shell: "border-red-200 bg-red-50/40 hover:border-red-300/80",
        stripe: "bg-red-400",
        iconWrap: "border-red-100 bg-red-50 text-red-600",
        client: "text-red-600",
        meta: "border-red-200 bg-red-50 text-red-700",
      }
    : isMeasurement
      ? {
          shell: "border-border bg-card hover:border-zinc-300 hover:shadow-[var(--shadow-md)]",
          stripe: "bg-violet-400",
          iconWrap: "border-violet-100 bg-violet-50 text-violet-600",
          client: "text-tertiary",
          meta: "border-violet-200 bg-violet-50 text-violet-700",
        }
      : isBracketing
        ? {
            shell: "border-border bg-card hover:border-zinc-300 hover:shadow-[var(--shadow-md)]",
            stripe: "bg-sky-400",
            iconWrap: "border-sky-100 bg-sky-50 text-sky-600",
            client: "text-tertiary",
            meta: "border-sky-200 bg-sky-50 text-sky-700",
          }
        : {
            shell: "border-border bg-card hover:border-zinc-300 hover:shadow-[var(--shadow-md)]",
            stripe: "bg-emerald-400",
            iconWrap: "border-emerald-100 bg-emerald-50 text-emerald-600",
            client: "text-tertiary",
            meta: "border-emerald-200 bg-emerald-50 text-emerald-700",
          };

  if (variant === "month") {
    return (
      <Link
        href={href}
        className={`flex items-center gap-1 px-1 py-0.5 rounded text-[8px] font-medium truncate active:scale-[0.97] transition-transform ${
          isOverdue
            ? "bg-red-100 text-red-700"
            : entry.taskType === "measurement"
              ? "bg-violet-100 text-violet-700"
              : entry.taskType === "bracketing"
                ? "bg-sky-100 text-sky-700"
                : "bg-emerald-100 text-emerald-700"
        }`}
        title={hideClient ? `${entry.buildingName} — ${entry.unitNumber}` : `${entry.clientName} — ${entry.buildingName} — ${entry.unitNumber}`}
      >
        <Icon
          size={10}
          className={`flex-shrink-0 ${
            isOverdue
              ? "text-red-500"
              : isMeasurement
                ? "text-violet-500"
                : isBracketing
                  ? "text-sky-500"
                  : "text-emerald-500"
          }`}
          weight="bold"
        />
        <span className="truncate">{entry.unitNumber}</span>
        {isOverdue && <Warning size={7} className="flex-shrink-0" />}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`group relative overflow-hidden rounded-[var(--radius-lg)] border px-4 py-3.5 text-[11px] transition-all duration-200 active:scale-[0.99] ${tone.shell}`}
    >
      <span className={`absolute inset-y-3 left-0 w-0.5 rounded-r-full ${tone.stripe}`} />

      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[var(--radius-md)] border ${tone.iconWrap}`}
        >
          <Icon size={13} weight="bold" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {!hideClient && (
              <span className={`min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-[0.14em] ${tone.client}`}>
                {entry.clientName}
              </span>
            )}
            {isOverdue && (
              <Warning size={12} weight="fill" className="flex-shrink-0 text-red-500" />
            )}
          </div>

          <div className="mt-1.5 flex items-baseline gap-1.5">
            <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
              {entry.buildingName}
            </span>
            <span className="flex-shrink-0 text-zinc-300">•</span>
            <span className="flex-shrink-0 font-mono text-[15px] font-bold tracking-[-0.05em] text-foreground">
              {entry.unitNumber}
            </span>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <StatusChip status={entry.status} />
            <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.12em] ${tone.meta}`}>
              {taskLabel}
            </span>
          </div>
        </div>

        {installer && (
          <span
            className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border text-[10px] font-bold ${installer.bg} ${installer.text}`}
          >
            {installer.initials}
          </span>
        )}
      </div>
    </Link>
  );
}
