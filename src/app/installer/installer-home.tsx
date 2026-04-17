"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MagnifyingGlass, Buildings, ArrowRight, SignOut } from "@phosphor-icons/react";
import { getUnitsByInstaller } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { Unit } from "@/lib/types";
import { StatusChip } from "@/components/ui/status-chip";
import { signOut } from "@/app/actions/auth-actions";

export function InstallerHome({
  data,
  installerId = "inst-1",
}: {
  data: AppDataset;
  installerId?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  const [search, setSearch] = useState("");

  const installer = data.installers.find((i) => i.id === installerId);
  const allUnits = getUnitsByInstaller(data, installerId);

  const buildingMap = new Map<
    string,
    { id: string; name: string; units: Unit[] }
  >();
  for (const unit of allUnits) {
    if (!buildingMap.has(unit.buildingId)) {
      buildingMap.set(unit.buildingId, {
        id: unit.buildingId,
        name: unit.buildingName,
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
      <header className="px-4 pt-[max(1.25rem,env(safe-area-inset-top))] pb-5 bg-card border-b border-border-subtle">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12px] text-tertiary font-medium mb-0.5">
              {installer?.name ? `Hello, ${installer.name}` : "Installer"}
            </p>
            <h1 className="text-[1.625rem] font-bold tracking-[-0.03em] text-foreground leading-none">
              FSR Blinds
            </h1>
          </div>
          <button
            onClick={() =>
              startSignOut(async () => {
                await signOut();
                router.push("/login");
                router.refresh();
              })
            }
            disabled={signingOut}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] text-[12px] font-medium text-tertiary hover:text-secondary hover:bg-surface transition-colors disabled:opacity-50"
          >
            <SignOut size={14} />
            {signingOut ? "…" : "Sign out"}
          </button>
        </div>
      </header>

      {/* Search */}
      <div className="px-4 pt-4 pb-2">
        <div className="relative">
          <MagnifyingGlass
            size={15}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-tertiary pointer-events-none"
          />
          <input
            type="text"
            placeholder="Search buildings or unit numbers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-9 pr-4 rounded-[var(--radius-lg)] border border-border bg-surface text-[14px] text-foreground placeholder:text-tertiary focus:outline-none focus:ring-[3px] focus:ring-[rgba(15,118,110,0.14)] focus:border-accent transition-all duration-200"
          />
        </div>
      </div>

      {/* Section heading */}
      <div className="px-4 flex items-center justify-between pt-3 pb-2">
        <h2 className="text-[13px] font-semibold text-secondary tracking-[0.04em] uppercase">
          Your buildings
        </h2>
        <span className="text-[11px] font-medium text-tertiary">
          {buildings.length} {buildings.length === 1 ? "building" : "buildings"}
        </span>
      </div>

      {/* Building cards */}
      <div className="px-4 flex flex-col gap-3 pb-8">
        {buildings.map((building, i) => {
          const nextDate =
            building.units
              .map((u) => u.bracketingDate ?? u.installationDate)
              .filter(Boolean)
              .sort()[0] ?? null;

          return (
            <motion.div
              key={building.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.055,
                duration: 0.35,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Link href={`/installer/buildings/${building.id}`}>
                <div className="surface-card overflow-hidden hover:shadow-[var(--shadow-md)] transition-all duration-200 active:scale-[0.99]">
                  {/* Building header */}
                  <div className="p-4 pb-3 flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 w-9 h-9 rounded-[var(--radius-md)] bg-accent-light flex items-center justify-center flex-shrink-0">
                        <Buildings size={17} className="text-accent" />
                      </div>
                      <div>
                        <p className="text-[15px] font-semibold text-foreground tracking-tight leading-tight">
                          {building.name}
                        </p>
                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[11px] font-semibold text-accent">
                            {building.units.length} {building.units.length === 1 ? "unit" : "units"}
                          </span>
                          {nextDate && (
                            <>
                              <span className="text-border">·</span>
                              <span className="text-[11px] font-mono font-medium text-tertiary">
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
                    <ArrowRight size={15} className="text-tertiary mt-1 flex-shrink-0" />
                  </div>

                  {/* Unit rows */}
                  <div className="border-t border-border-subtle divide-y divide-border-subtle">
                    {building.units.slice(0, 4).map((unit) => {
                      const dueDate = unit.bracketingDate ?? unit.installationDate;
                      return (
                        <div
                          key={unit.id}
                          className="flex items-center justify-between px-4 py-2.5"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="text-[13px] font-semibold text-foreground font-mono">
                              {unit.unitNumber}
                            </span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <StatusChip status={unit.status} />
                            {dueDate && (
                              <span className="text-[11px] font-mono font-medium text-tertiary">
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
                      <div className="px-4 py-2.5 text-[12px] font-medium text-tertiary text-center">
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
