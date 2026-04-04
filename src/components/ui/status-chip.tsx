"use client";

import { type UnitStatus, UNIT_STATUS_LABELS } from "@/lib/types";

const statusStyles: Record<UnitStatus, string> = {
  not_started: "bg-zinc-100 text-zinc-500 border-zinc-200/80",
  measured: "bg-teal-50 text-teal-700 border-teal-200/70",
  bracketed: "bg-amber-50 text-amber-800 border-amber-200/70",
  measured_and_bracketed:
    "bg-indigo-50 text-indigo-800 border-indigo-200/80",
  installed: "bg-emerald-50 text-emerald-800 border-emerald-200/70",
};

/** Legacy DB values that may still exist in schedule_entries or activity logs. */
const LEGACY_LABEL_MAP: Record<string, string> = {
  pending_scheduling: "Not Yet Started",
  scheduled_bracketing: "Not Yet Started",
  bracketed_measured: "Measured",
  install_date_scheduled: "Bracketed",
  installed_pending_approval: "Installed",
  client_approved: "Installed",
};

export function StatusChip({ status }: { status: string }) {
  const knownStatus = status as UnitStatus;
  const style = statusStyles[knownStatus] ?? "bg-zinc-100 text-zinc-500 border-zinc-200/80";
  const label =
    UNIT_STATUS_LABELS[knownStatus] ??
    LEGACY_LABEL_MAP[status] ??
    status.replace(/_/g, " ");

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-[var(--radius-sm)] text-[11px] font-semibold border ${style}`}
    >
      {label}
    </span>
  );
}
