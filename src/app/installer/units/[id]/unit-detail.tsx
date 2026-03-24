"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle,
  Circle,
  Info,
} from "@phosphor-icons/react";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import { UNIT_STATUSES, UNIT_STATUS_LABELS, UNIT_STATUS_ORDER } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { RiskBadge } from "@/components/ui/risk-badge";
import { StatusChip } from "@/components/ui/status-chip";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";

export function UnitDetail({ data }: { data: AppDataset }) {
  const { id } = useParams<{ id: string }>();
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];

  if (!unit) {
    return (
      <div className="p-6 text-center text-muted">Unit not found</div>
    );
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status];

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Unit Details"
        backHref={`/installer/buildings/${unit.buildingId}`}
      />

      <div className="px-5 py-5 flex flex-col gap-6">
        {/* Unit info */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="text-[10px] font-bold text-muted uppercase tracking-[0.12em]">
            {unit.clientName}
          </p>
          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
            {unit.buildingName}
          </h2>
          <p className="text-xs text-muted font-mono mt-0.5">
            {unit.unitNumber}
          </p>
          <div className="flex items-center gap-2 mt-3">
            <StatusChip status={unit.status} />
            <RiskBadge flag={unit.riskFlag} />
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-3"
        >
          <MetricTile value={unit.roomCount} label="Rooms" />
          <MetricTile value={unit.windowCount} label="Windows" />
          <MetricTile value={unit.photosUploaded} label="Photos" />
          <MetricTile value={unit.notesCount} label="Notes" />
        </motion.div>

        {/* Installation Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="bg-white rounded-2xl border border-border p-5"
        >
          <h3 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-4">
            Installation Timeline
          </h3>
          <div className="flex flex-col gap-0">
            {UNIT_STATUSES.map((status, i) => {
              const step = UNIT_STATUS_ORDER[status];
              const isComplete = step < currentStep;
              const isCurrent = step === currentStep;

              return (
                <div key={status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    {isComplete ? (
                      <CheckCircle
                        size={22}
                        weight="fill"
                        className="text-accent"
                      />
                    ) : isCurrent ? (
                      <div className="w-[22px] h-[22px] rounded-full bg-accent flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-white" />
                      </div>
                    ) : (
                      <Circle size={22} className="text-zinc-300" />
                    )}
                    {i < UNIT_STATUSES.length - 1 && (
                      <div
                        className={`w-px h-7 ${
                          isComplete ? "bg-accent/40" : "bg-zinc-200"
                        }`}
                      />
                    )}
                  </div>
                  <div className="pb-6">
                    <span
                      className={`text-sm ${
                        isCurrent
                          ? "font-bold text-foreground"
                          : isComplete
                            ? "font-medium text-zinc-500"
                            : "text-zinc-300"
                      }`}
                    >
                      {UNIT_STATUS_LABELS[status]}
                    </span>
                    {isCurrent && unit.bracketingDate && (
                      <p className="text-[11px] text-muted mt-0.5">
                        {unit.bracketingDate}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Rooms */}
        {rooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
              Rooms
            </h3>
            <div className="flex flex-col gap-2">
              {rooms.map((room) => (
                <Link key={room.id} href={`/installer/units/${unit.id}/rooms/${room.id}`}>
                  <div className="flex items-center justify-between bg-white rounded-2xl border border-border px-4 py-3.5 hover:border-zinc-300 transition-all active:scale-[0.99]">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{room.name}</p>
                      <p className="text-[11px] text-muted mt-0.5">
                        {room.completedWindows}/{room.windowCount} windows measured
                      </p>
                    </div>
                    <ArrowRight size={16} className="text-zinc-400" />
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}

        {/* Architectural note */}
        {unit.notesCount > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.28, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="bg-accent/5 rounded-2xl border border-accent/15 p-4 flex gap-3"
          >
            <Info size={20} weight="fill" className="text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-accent uppercase tracking-wider">
                Architectural Note
              </p>
              <p className="text-xs text-zinc-600 mt-1 leading-relaxed">
                Review measurement details and special conditions in room-level notes before proceeding.
              </p>
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3 pt-2 pb-4"
        >
          <Link href={`/installer/units/${unit.id}/rooms`}>
            <Button fullWidth size="lg">
              {rooms.length === 0 ? "Start Bracketing & Measurement" : "Manage Rooms"}
            </Button>
          </Link>
          <Link href={`/installer/units/${unit.id}/status`}>
            <Button variant="secondary" fullWidth size="lg">
              Update Status
            </Button>
          </Link>
          <Link href={`/installer/units/${unit.id}/summary`}>
            <Button variant="secondary" fullWidth size="lg">
              View Summary
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
