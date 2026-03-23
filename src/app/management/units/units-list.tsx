"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { MagnifyingGlass, ArrowRight, UserCircle } from "@phosphor-icons/react";
import { units } from "@/lib/mock-data";
import { StatusChip } from "@/components/ui/status-chip";
import { RiskDot } from "@/components/ui/risk-badge";
import { PageHeader } from "@/components/ui/page-header";

export function UnitsList() {
  const [search, setSearch] = useState("");

  const filtered = units.filter(
    (u) =>
      u.unitNumber.toLowerCase().includes(search.toLowerCase()) ||
      u.buildingName.toLowerCase().includes(search.toLowerCase()) ||
      u.clientName.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col">
      <PageHeader title="All Units" subtitle={`${units.length} total units`} />

      <div className="px-4 py-3">
        <div className="relative">
          <MagnifyingGlass
            size={18}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            placeholder="Search units, buildings, clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-11 pl-10 pr-4 rounded-xl border border-border bg-white text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
          />
        </div>
      </div>

      <div className="px-4 flex flex-col gap-2">
        {filtered.map((unit, i) => (
          <motion.div
            key={unit.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: i * 0.04,
              duration: 0.3,
              ease: [0.16, 1, 0.3, 1],
            }}
          >
            <Link href={`/management/units/${unit.id}`}>
              <div className="bg-white rounded-xl border border-border px-4 py-3.5 hover:border-zinc-300 transition-all active:scale-[0.99]">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900 tracking-tight">
                      {unit.unitNumber}
                    </p>
                    <p className="text-xs text-muted">
                      {unit.buildingName} \u2022 {unit.clientName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <RiskDot flag={unit.riskFlag} />
                    <ArrowRight size={14} className="text-zinc-400" />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <StatusChip status={unit.status} />
                  {unit.assignedInstallerName && (
                    <span className="flex items-center gap-1 text-xs text-muted">
                      <UserCircle size={14} />
                      {unit.assignedInstallerName}
                    </span>
                  )}
                </div>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
