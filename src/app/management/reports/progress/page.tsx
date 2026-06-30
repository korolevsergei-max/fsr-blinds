"use client";

import Link from "next/link";
import { useDatasetSelector } from "@/lib/dataset-context";
import { ProgressReport } from "./progress-report";

export default function ProgressReportPage() {
  const units = useDatasetSelector((value) => value.data.units);
  const clients = useDatasetSelector((value) => value.data.clients);
  const buildings = useDatasetSelector((value) => value.data.buildings);

  return (
    <>
      <div className="border-b border-border-subtle bg-card px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary mb-2">Reports</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <Link
            href="/management/reports"
            className="inline-flex h-9 items-center rounded-full border-2 border-border bg-card px-4 text-[13px] font-semibold text-secondary transition-all hover:border-zinc-300 hover:text-foreground active:scale-[0.97]"
          >
            Status Grid
          </Link>
          <span className="inline-flex h-9 items-center rounded-full bg-zinc-900 px-4 text-[13px] font-semibold text-white shadow-sm">
            Progress Report
          </span>
        </div>
      </div>
      <ProgressReport units={units} clients={clients} buildings={buildings} />
    </>
  );
}
