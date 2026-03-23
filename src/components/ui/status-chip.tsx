"use client";

import { type UnitStatus, UNIT_STATUS_LABELS } from "@/lib/types";

const statusStyles: Record<UnitStatus, string> = {
  pending_scheduling: "bg-zinc-100 text-zinc-600",
  scheduled_bracketing: "bg-sky-50 text-sky-700",
  bracketed_measured: "bg-emerald-50 text-emerald-700",
  install_date_tbd: "bg-amber-50 text-amber-700",
  install_date_scheduled: "bg-sky-50 text-sky-700",
  installed_pending_approval: "bg-violet-50 text-violet-700",
  client_approved: "bg-emerald-50 text-emerald-700",
};

export function StatusChip({ status }: { status: UnitStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium tracking-tight ${statusStyles[status]}`}
    >
      {UNIT_STATUS_LABELS[status]}
    </span>
  );
}
