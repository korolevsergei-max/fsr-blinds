"use client";

import { type UnitStatus, UNIT_STATUS_LABELS } from "@/lib/types";

const statusStyles: Record<UnitStatus, string> = {
  pending_scheduling: "bg-zinc-100 text-zinc-600 border-zinc-200",
  scheduled_bracketing: "bg-teal-50 text-teal-700 border-teal-200",
  bracketed_measured: "bg-emerald-50 text-emerald-700 border-emerald-200",
  install_date_scheduled: "bg-sky-50 text-sky-700 border-sky-200",
  installed_pending_approval: "bg-violet-50 text-violet-700 border-violet-200",
  client_approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
};

export function StatusChip({ status }: { status: UnitStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${statusStyles[status]}`}
    >
      {UNIT_STATUS_LABELS[status]}
    </span>
  );
}
