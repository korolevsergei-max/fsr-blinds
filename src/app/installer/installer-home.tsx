"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  MagnifyingGlass,
  Buildings,
  ArrowRight,
  MapPin,
} from "@phosphor-icons/react";
import {
  getUnitsByInstaller,
  buildings,
} from "@/lib/mock-data";
import { RiskDot } from "@/components/ui/risk-badge";

export function InstallerHome() {
  const [search, setSearch] = useState("");

  const allUnits = getUnitsByInstaller("inst-1");

  // Derive unique buildings from assigned units
  const buildingIds = [...new Set(allUnits.map((u) => u.buildingId))];
  const assignedBuildings = buildingIds
    .map((bid) => buildings.find((b) => b.id === bid))
    .filter(Boolean) as typeof buildings;

  const filtered = assignedBuildings.filter(
    (b) =>
      b.name.toLowerCase().includes(search.toLowerCase()) ||
      b.address.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 bg-background">
        <div className="flex items-center justify-between mb-1">
          <div>
            <p className="text-xs text-muted font-medium">Welcome back</p>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Tom Uramowski
            </h1>
          </div>
          <div className="w-10 h-10 rounded-full bg-zinc-200 overflow-hidden">
            <img
              src="https://picsum.photos/seed/tom-uramowski/80/80"
              alt=""
              className="w-full h-full object-cover"
            />
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-4">
          <MagnifyingGlass
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            placeholder="Search buildings..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-border bg-white text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
          />
        </div>
      </header>

      {/* Count */}
      <div className="px-4 py-2">
        <p className="text-xs text-muted font-medium">
          {filtered.length} building{filtered.length !== 1 ? "s" : ""} assigned
        </p>
      </div>

      {/* Building cards */}
      <div className="px-4 flex flex-col gap-3 pb-6">
        {filtered.map((building, i) => {
          const bUnits = allUnits.filter((u) => u.buildingId === building.id);
          const activeUnits = bUnits.filter((u) => u.status !== "client_approved");
          const worstRisk = bUnits.some((u) => u.riskFlag === "red")
            ? "red"
            : bUnits.some((u) => u.riskFlag === "yellow")
              ? "yellow"
              : "green";
          const clientName = bUnits[0]?.clientName ?? "";

          return (
            <motion.div
              key={building.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: i * 0.07,
                duration: 0.35,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              <Link href={`/installer/buildings/${building.id}`}>
                <div className="bg-white rounded-2xl border border-border p-4 hover:border-zinc-300 transition-all active:scale-[0.99]">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-100 flex-shrink-0">
                        <Buildings size={20} className="text-zinc-500" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-zinc-900 tracking-tight">
                          {building.name}
                        </p>
                        <p className="text-xs text-muted">{clientName}</p>
                      </div>
                    </div>
                    <RiskDot flag={worstRisk} />
                  </div>

                  <div className="flex items-center gap-1 text-xs text-muted mb-3">
                    <MapPin size={12} className="flex-shrink-0" />
                    <span className="truncate">{building.address}</span>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-3">
                    <div className="flex items-center gap-4 text-xs text-muted">
                      <span>
                        <span className="font-mono font-semibold text-zinc-700">
                          {bUnits.length}
                        </span>{" "}
                        units
                      </span>
                      <span>
                        <span className="font-mono font-semibold text-accent">
                          {activeUnits.length}
                        </span>{" "}
                        active
                      </span>
                    </div>
                    <ArrowRight size={15} className="text-zinc-400" />
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
