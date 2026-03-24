"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MagnifyingGlass, Buildings, ArrowRight } from "@phosphor-icons/react";
import { getUnitsByInstaller } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { Unit } from "@/lib/types";
import { StatusChip } from "@/components/ui/status-chip";
import { RiskDot } from "@/components/ui/risk-badge";

export function InstallerHome({
  data,
  installerId = "inst-1",
}: {
  data: AppDataset;
  installerId?: string;
}) {
  const [search, setSearch] = useState("");

  const installer = data.installers.find((i) => i.id === installerId);
  const allUnits = getUnitsByInstaller(data, installerId);

  // Group units by building, deduplicated
  const buildingMap = new Map<
    string,
    { id: string; name: string; clientName: string; units: Unit[] }
  >();
  for (const unit of allUnits) {
    if (!buildingMap.has(unit.buildingId)) {
      buildingMap.set(unit.buildingId, {
        id: unit.buildingId,
        name: unit.buildingName,
        clientName: unit.clientName,
        units: [],
      });
    }
    buildingMap.get(unit.buildingId)!.units.push(unit);
  }

  const buildings = Array.from(buildingMap.values()).filter(
    (b) =>
      !search ||
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.units.some((u) =>
        u.unitNumber.toLowerCase().includes(search.toLowerCase())
      )
  );

  return (
    <div className="flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2">
        <span className="text-lg font-bold tracking-tight text-foreground">
          FSR Blinds
        </span>
        <Link
          href="/installer/profile"
          className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold hover:bg-accent-dark transition-colors"
          aria-label="Profile"
        >
          {installer?.name?.[0] ?? "I"}
        </Link>
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
            placeholder="Search by building name or unit number..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-12 pl-10 pr-4 rounded-2xl border border-border bg-white text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
          />
        </div>
      </div>

      {/* Section heading */}
      <div className="px-5 flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          Your Buildings
        </h2>
        <span className="text-[10px] font-bold text-muted uppercase tracking-wider">
          {buildings.length} Building{buildings.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Building cards */}
      <div className="px-5 flex flex-col gap-4 pb-8">
        {buildings.map((building, i) => {
          const nextDate =
            building.units
              .map((u) => u.bracketingDate ?? u.installationDate)
              .filter(Boolean)
              .sort()[0] ?? null;

          return (
            <motion.div
              key={building.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.06,
                duration: 0.35,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Link href={`/installer/buildings/${building.id}`}>
                <div className="bg-white rounded-2xl border border-border overflow-hidden hover:border-zinc-300 transition-all active:scale-[0.99]">
                  {/* Building header */}
                  <div className="p-4 pb-3 flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-9 h-9 rounded-xl bg-accent/8 flex items-center justify-center flex-shrink-0">
                        <Buildings size={18} className="text-accent" />
                      </div>
                      <div>
                        <p className="text-base font-bold text-foreground tracking-tight leading-tight">
                          {building.name}
                        </p>
                        <p className="text-[11px] text-muted mt-0.5">
                          {building.clientName}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] font-bold text-accent uppercase tracking-wider">
                            {building.units.length} unit{building.units.length !== 1 ? "s" : ""}
                          </span>
                          {nextDate && (
                            <>
                              <span className="text-zinc-300">·</span>
                              <span className="text-[10px] font-mono font-semibold text-muted">
                                Next:{" "}
                                {new Date(nextDate + "T00:00:00").toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <ArrowRight size={16} className="text-zinc-400 mt-1 flex-shrink-0" />
                  </div>

                  {/* Unit rows */}
                  <div className="border-t border-border divide-y divide-border">
                    {building.units.slice(0, 4).map((unit) => {
                      const dueDate = unit.bracketingDate ?? unit.installationDate;
                      return (
                        <div
                          key={unit.id}
                          className="flex items-center justify-between px-4 py-2.5"
                        >
                          <div className="flex items-center gap-2.5">
                            <RiskDot flag={unit.riskFlag} />
                            <span className="text-sm font-bold text-foreground font-mono">
                              {unit.unitNumber}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <StatusChip status={unit.status} />
                            {dueDate && (
                              <span className="text-[11px] font-mono font-semibold text-muted">
                                {new Date(dueDate + "T00:00:00").toLocaleDateString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {building.units.length > 4 && (
                      <div className="px-4 py-2 text-[11px] font-semibold text-muted text-center">
                        +{building.units.length - 4} more units
                      </div>
                    )}
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
