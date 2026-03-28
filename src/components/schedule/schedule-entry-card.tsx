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
}

export function ScheduleEntryCard({
  entry,
  href,
  isOverdue,
  installer,
  variant = "week",
}: ScheduleEntryCardProps) {
  const TaskIcon =
    entry.taskType === "bracketing" ? (
      <Wrench size={10} className="text-sky-500 flex-shrink-0" weight="bold" />
    ) : (
      <Hammer size={10} className="text-emerald-500 flex-shrink-0" weight="bold" />
    );

  if (variant === "month") {
    return (
      <Link
        href={href}
        className={`flex items-center gap-1 px-1 py-0.5 rounded text-[8px] font-medium truncate active:scale-[0.97] transition-transform ${
          isOverdue
            ? "bg-red-100 text-red-700"
            : entry.taskType === "bracketing"
              ? "bg-sky-100 text-sky-700"
              : "bg-emerald-100 text-emerald-700"
        }`}
        title={`${entry.clientName} — ${entry.buildingName} — ${entry.unitNumber}`}
      >
        {TaskIcon}
        <span className="truncate">{entry.unitNumber}</span>
        {isOverdue && <Warning size={7} className="flex-shrink-0" />}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`flex flex-col gap-1 px-3 py-2.5 rounded-[var(--radius-sm)] border text-[11px] transition-all active:scale-[0.97] ${
        isOverdue ? "border-red-200 bg-red-50/70" : "border-border bg-card"
      }`}
    >
      {/* Row 1: task type icon + client name + overdue badge + installer avatar */}
      <div className="flex items-center gap-1.5">
        {TaskIcon}
        <span className={`text-[10px] font-semibold uppercase tracking-wider truncate flex-1 ${isOverdue ? "text-red-600" : "text-tertiary"}`}>
          {entry.clientName}
        </span>
        {isOverdue && (
          <Warning size={11} weight="fill" className="text-red-500 flex-shrink-0" />
        )}
        {installer && (
          <span
            className={`w-5 h-5 rounded-full ${installer.bg} ${installer.text} flex items-center justify-center text-[8px] font-bold flex-shrink-0`}
          >
            {installer.initials}
          </span>
        )}
      </div>

      {/* Row 2: building · unit number */}
      <div className="flex items-baseline gap-1">
        <span className="font-semibold text-foreground truncate leading-tight">
          {entry.buildingName}
        </span>
        <span className="text-muted flex-shrink-0">·</span>
        <span className="font-mono font-semibold text-foreground flex-shrink-0">
          {entry.unitNumber}
        </span>
      </div>

      {/* Row 3: status chip */}
      <div>
        <StatusChip status={entry.status} />
      </div>
    </Link>
  );
}
