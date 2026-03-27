"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
} from "@phosphor-icons/react";
import { getUnitsByInstaller } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { PageHeader } from "@/components/ui/page-header";
import type { Unit } from "@/lib/types";

type Filter = "all" | "today" | "overdue" | "completed";

const filterLabels: Record<Filter, string> = {
  all: "ALL",
  today: "DUE TODAY",
  overdue: "OVERDUE",
  completed: "DONE",
};

function filterUnits(units: Unit[], filter: Filter): Unit[] {
  const today = "2026-03-23";
  switch (filter) {
    case "today":
      return units.filter(
        (u) => u.bracketingDate === today || u.installationDate === today
      );
    case "overdue":
      return units.filter(
        (u) =>
          u.status !== "client_approved" &&
          u.bracketingDate &&
          u.bracketingDate < today &&
          u.status === "scheduled_bracketing"
      );
    case "completed":
      return units.filter((u) => u.status === "client_approved");
    default:
      return units;
  }
}

export function BuildingUnits({
  data,
  installerId = "inst-1",
}: {
  data: AppDataset;
  installerId?: string;
}) {
  const { buildingId } = useParams<{ buildingId: string }>();
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const building = data.buildings.find((b) => b.id === buildingId);
  const allInstallerUnits = getUnitsByInstaller(data, installerId);
  const buildingUnits = allInstallerUnits.filter(
    (u) => u.buildingId === buildingId
  );
  const filtered = filterUnits(buildingUnits, activeFilter);

  if (!building) {
    return (
      <div className="p-6 text-center text-muted">Building not found</div>
    );
  }

  const clientName = buildingUnits[0]?.clientName ?? "";

  return (
    <div className="flex flex-col">
      <PageHeader
        title={building.name}
        subtitle={clientName}
        backHref="/installer"
      />

      <div className="px-5 pt-4">
        {/* Filters */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar mb-4">
          {(Object.keys(filterLabels) as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              className={`flex-shrink-0 px-4 py-2 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all active:scale-[0.96] ${
                activeFilter === f
                  ? "bg-accent text-white shadow-sm"
                  : "bg-white text-zinc-500 border border-border hover:bg-surface"
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>

        <p className="text-[10px] font-bold text-muted uppercase tracking-wider mb-3">
          {filtered.length} unit{filtered.length !== 1 ? "s" : ""}
        </p>

        <div className="flex flex-col gap-3 pb-6">
          {filtered.map((unit, i) => (
            <motion.div
              key={unit.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.055,
                duration: 0.32,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Link href={`/installer/units/${unit.id}`}>
                <div className="bg-white rounded-2xl border border-border p-4 hover:border-zinc-300 transition-all active:scale-[0.99]">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-foreground tracking-tight flex items-center gap-2">
                      {unit.unitNumber}
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <StatusChip status={unit.status} />
                    <div className="flex items-center gap-1.5 text-xs text-muted">
                      {unit.bracketingDate && (
                        <span className="font-mono font-semibold text-accent">
                          {new Date(
                            unit.bracketingDate + "T00:00:00"
                          ).toLocaleDateString("en-CA", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                      )}
                      <ArrowRight size={13} className="text-zinc-400" />
                    </div>
                  </div>

                  {unit.assignedInstallerName && (
                    <p className="mt-2 text-xs text-muted">
                      {unit.assignedInstallerName}
                    </p>
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
