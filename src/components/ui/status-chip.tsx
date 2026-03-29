"use client";

import { type UnitStatus, UNIT_STATUS_LABELS } from "@/lib/types";

const statusStyles: Record<UnitStatus, string> = {
  not_started:     "bg-zinc-100 text-zinc-500 border-zinc-200/80",
  measured:        "bg-teal-50  text-teal-700  border-teal-200/70",
  bracketed:       "bg-emerald-50 text-emerald-700 border-emerald-200/70",
  installed:       "bg-sky-50   text-sky-700   border-sky-200/70",
  client_approved: "bg-emerald-100 text-emerald-800 border-emerald-300/70",
};

/** Legacy DB values that may still exist in schedule_entries or activity logs. */
const LEGACY_LABEL_MAP: Record<string, string> = {
  pending_scheduling:       "Not Yet Started",
  scheduled_bracketing:     "Not Yet Started",
  bracketed_measured:       "Measured",
  install_date_scheduled:   "Bracketed",
  installed_pending_approval: "Installed",
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
