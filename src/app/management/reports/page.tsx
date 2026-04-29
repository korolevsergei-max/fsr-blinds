"use client";

import Link from "next/link";
import { useDatasetSelector } from "@/lib/dataset-context";
import { StatusGridReport } from "./status-grid-report";

export default function ReportsPage() {
  const units = useDatasetSelector((value) => value.data.units);
  const clients = useDatasetSelector((value) => value.data.clients);
  const buildings = useDatasetSelector((value) => value.data.buildings);

  return (
    <>
      <div className="border-b border-border-subtle bg-card px-4 py-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-tertiary mb-2">Reports</p>
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          <span className="inline-flex h-9 items-center rounded-full bg-zinc-900 px-4 text-[13px] font-semibold text-white shadow-sm">
            Status Grid
          </span>
          <Link
            href="/management/reports/progress"
            className="inline-flex h-9 items-center rounded-full border-2 border-accent bg-card px-4 text-[13px] font-semibold text-accent transition-all hover:bg-accent hover:text-white active:scale-[0.97]"
          >
            Progress Report
          </Link>
        </div>
      </div>
      <StatusGridReport
        units={units}
        clients={clients}
        buildings={buildings}
      />
    </>
  );
}
