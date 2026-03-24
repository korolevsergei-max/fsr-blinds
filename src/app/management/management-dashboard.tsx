"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Buildings,
  Warning,
  CheckCircle,
  CalendarBlank,
  ArrowRight,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { StatusChip } from "@/components/ui/status-chip";
import { RiskDot } from "@/components/ui/risk-badge";
import { UNIT_STATUS_ORDER, type UnitStatus } from "@/lib/types";

export function ManagementDashboard({ data }: { data: AppDataset }) {
  const { units } = data;
  const activeUnits = units.filter((u) => u.status !== "client_approved");
  const completedUnits = units.filter((u) => u.status === "client_approved");
  const escalated = units.filter((u) => u.riskFlag === "yellow");
  const atRisk = units.filter((u) => u.riskFlag === "red");

  const scheduledThisWeek = units.filter(
    (u) =>
      u.bracketingDate &&
      u.bracketingDate >= "2026-03-23" &&
      u.bracketingDate <= "2026-03-29"
  );

  const riskRank = { red: 0, yellow: 1, green: 2 } as const;
  const needsAttention = units
    .filter((u) => u.riskFlag !== "green" && u.status !== "client_approved")
    .sort(
      (a, b) => riskRank[a.riskFlag] - riskRank[b.riskFlag]
    );

  const statusCounts = new Map<string, number>();
  units.forEach((u) => {
    statusCounts.set(u.status, (statusCounts.get(u.status) || 0) + 1);
  });

  const kpis = [
    {
      label: "Active Units",
      value: activeUnits.length,
      Icon: Buildings,
      color: "text-zinc-600",
      bg: "bg-zinc-100",
    },
    {
      label: "Scheduled This Week",
      value: scheduledThisWeek.length,
      Icon: CalendarBlank,
      color: "text-sky-600",
      bg: "bg-sky-50",
    },
    {
      label: "Escalated",
      value: escalated.length + atRisk.length,
      Icon: Warning,
      color: "text-amber-600",
      bg: "bg-amber-50",
    },
    {
      label: "Completed",
      value: completedUnits.length,
      Icon: CheckCircle,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
    },
  ];

  return (
    <div className="flex flex-col">
      {/* Header */}
      <header className="px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-4 bg-background">
        <p className="text-xs text-muted font-medium">Management</p>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          FSR Blinds
        </h1>
      </header>

      <div className="px-4 flex flex-col gap-6">
        {/* KPI Grid */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-3"
        >
          {kpis.map(({ label, value, Icon, color, bg }) => (
            <div
              key={label}
              className="bg-white rounded-2xl border border-border p-4"
            >
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                <Icon size={18} className={color} />
              </div>
              <p className="text-2xl font-semibold text-zinc-900 font-mono tracking-tight">
                {value}
              </p>
              <p className="text-xs text-muted mt-0.5">{label}</p>
            </div>
          ))}
        </motion.div>

        {/* Pipeline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Pipeline by Status
          </h2>
          <div className="bg-white rounded-2xl border border-border divide-y divide-border">
            {Array.from(statusCounts.entries())
              .sort(
                (a, b) =>
                  UNIT_STATUS_ORDER[a[0] as keyof typeof UNIT_STATUS_ORDER] -
                  UNIT_STATUS_ORDER[b[0] as keyof typeof UNIT_STATUS_ORDER]
              )
              .map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <StatusChip status={status as UnitStatus} />
                  <span className="text-sm font-semibold text-zinc-900 font-mono">
                    {count}
                  </span>
                </div>
              ))}
          </div>
        </motion.div>

        {/* Risk Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Risk Overview
          </h2>
          <div className="flex gap-3">
            {(["green", "yellow", "red"] as const).map((flag) => {
              const count = units.filter((u) => u.riskFlag === flag).length;
              const labels = { green: "Clear", yellow: "Escalated", red: "At Risk" };
              const colors = {
                green: "bg-emerald-50 border-emerald-200",
                yellow: "bg-amber-50 border-amber-200",
                red: "bg-red-50 border-red-200",
              };
              return (
                <div
                  key={flag}
                  className={`flex-1 rounded-xl border p-3 text-center ${colors[flag]}`}
                >
                  <RiskDot flag={flag} />
                  <p className="text-lg font-semibold font-mono mt-1.5">{count}</p>
                  <p className="text-[10px] text-muted">{labels[flag]}</p>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Needs Attention */}
        {needsAttention.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.26, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="pb-6"
          >
            <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
              Needs Attention
            </h2>
            <div className="flex flex-col gap-2">
              {needsAttention.map((unit) => (
                <Link key={unit.id} href={`/management/units/${unit.id}`}>
                  <div className="bg-white rounded-xl border border-border px-4 py-3 flex items-center justify-between hover:border-zinc-300 transition-all active:scale-[0.99]">
                    <div className="flex items-center gap-3">
                      <RiskDot flag={unit.riskFlag} />
                      <div>
                        <p className="text-sm font-medium text-zinc-900">
                          {unit.unitNumber}
                        </p>
                        <p className="text-xs text-muted">{unit.buildingName}</p>
                      </div>
                    </div>
                    <ArrowRight size={14} className="text-zinc-400" />
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
