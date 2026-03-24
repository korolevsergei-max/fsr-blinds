"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  MagnifyingGlass,
  List,
  ArrowRight,
} from "@phosphor-icons/react";
import { getUnitsByInstaller } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { Building, Unit } from "@/lib/types";
import { StatusChip } from "@/components/ui/status-chip";
import { RiskBadge } from "@/components/ui/risk-badge";

type Filter = "all" | "today" | "overdue" | "completed";

const filterLabels: Record<Filter, string> = {
  all: "ALL",
  today: "DUE TODAY",
  overdue: "OVERDUE",
  completed: "COMPLETED",
};

function filterUnits(units: Unit[], filter: Filter): Unit[] {
  const today = new Date().toISOString().slice(0, 10);
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

export function InstallerHome({
  data,
  installerId = "inst-1",
}: {
  data: AppDataset;
  installerId?: string;
}) {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Filter>("all");

  const installer = data.installers.find((i) => i.id === installerId);
  const allUnits = getUnitsByInstaller(data, installerId);
  const filtered = filterUnits(allUnits, activeFilter).filter(
    (u) =>
      u.unitNumber.toLowerCase().includes(search.toLowerCase()) ||
      u.buildingName.toLowerCase().includes(search.toLowerCase()) ||
      u.clientName.toLowerCase().includes(search.toLowerCase())
  );

  const buildingMap = new Map<string, Building>();
  for (const b of data.buildings) buildingMap.set(b.id, b);

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <div className="flex items-center gap-3">
          <List size={22} className="text-foreground" />
          <span className="text-lg font-bold tracking-tight text-foreground">
            FSR Blinds
          </span>
        </div>
        <div className="flex items-center gap-2">
          <MagnifyingGlass size={20} className="text-zinc-400" />
          <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold">
            {installer?.name?.[0] ?? "I"}
          </div>
        </div>
      </header>

      <div className="px-5 pt-4 pb-2">
        <p className="text-[10px] font-bold text-accent uppercase tracking-[0.15em]">
          Assigned Tasks
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
          Good morning, {installer?.name?.split(" ")[0] ?? "Installer"}
        </h1>
      </div>

      {/* Search */}
      <div className="px-5 py-3">
        <div className="relative">
          <MagnifyingGlass
            size={16}
            className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            placeholder="Search by Client or Unit ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 pl-10 pr-4 rounded-2xl border border-border bg-white text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
          />
        </div>
      </div>

      {/* Filter pills */}
      <div className="px-5 flex items-center gap-2 overflow-x-auto no-scrollbar pb-4">
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

      {/* Section heading */}
      <div className="px-5 flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Today&apos;s Load
        </h2>
        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
          {filtered.length} Unit{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Unit cards */}
      <div className="px-5 flex flex-col gap-4 pb-8">
        {filtered.map((unit, i) => {
          const building = buildingMap.get(unit.buildingId);
          const nextTask = unit.status === "scheduled_bracketing"
            ? "Bracketing & Measurement"
            : unit.status === "install_date_scheduled"
              ? "Installation"
              : null;
          const nextDate = unit.bracketingDate ?? unit.installationDate;

          return (
            <motion.div
              key={unit.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.06,
                duration: 0.35,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Link href={`/installer/units/${unit.id}`}>
                <div className="bg-white rounded-2xl border border-border overflow-hidden hover:border-zinc-300 transition-all active:scale-[0.99]">
                  <div className="p-4 pb-3">
                    <p className="text-[10px] font-bold text-muted uppercase tracking-[0.12em]">
                      {unit.clientName}
                    </p>
                    <p className="text-lg font-bold text-foreground tracking-tight mt-0.5">
                      {building?.name ?? unit.buildingName}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-semibold text-accent font-mono">
                        {unit.unitNumber}
                      </span>
                      <span className="text-xs text-muted">
                        • {unit.unitNumber}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-2.5">
                      <StatusChip status={unit.status} />
                      {unit.riskFlag !== "green" && (
                        <RiskBadge flag={unit.riskFlag} />
                      )}
                    </div>
                  </div>

                  {nextTask && nextDate && (
                    <div className="mx-3 mb-3 px-4 py-3 rounded-xl bg-surface border border-border/60">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-bold text-muted uppercase tracking-wider">
                            Next Task
                          </p>
                          <p className="text-sm font-semibold text-foreground mt-0.5">
                            {nextTask}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] font-bold text-muted uppercase tracking-wider">
                            Due
                          </p>
                          <p className="text-sm font-bold text-accent font-mono mt-0.5">
                            {new Date(nextDate + "T00:00:00").toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            }).toUpperCase()}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {!nextTask && (
                    <div className="px-4 pb-3 flex items-center justify-end">
                      <ArrowRight size={16} className="text-zinc-400" />
                    </div>
                  )}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
