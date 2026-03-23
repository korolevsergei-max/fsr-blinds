"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Camera,
  Ruler,
  Door,
  Note,
  ArrowRight,
  CheckCircle,
  Circle,
} from "@phosphor-icons/react";
import { units, getRoomsByUnit } from "@/lib/mock-data";
import { UNIT_STATUSES, UNIT_STATUS_LABELS, UNIT_STATUS_ORDER } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { RiskBadge } from "@/components/ui/risk-badge";
import { Button } from "@/components/ui/button";

export function UnitDetail() {
  const { id } = useParams<{ id: string }>();
  const unit = units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(unit.id) : [];

  if (!unit) {
    return (
      <div className="p-6 text-center text-muted">Unit not found</div>
    );
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status];

  const stats = [
    { label: "Rooms", value: unit.roomCount, Icon: Door },
    { label: "Windows", value: unit.windowCount, Icon: Ruler },
    { label: "Photos", value: unit.photosUploaded, Icon: Camera },
    { label: "Notes", value: unit.notesCount, Icon: Note },
  ];

  return (
    <div className="flex flex-col">
      <PageHeader
        title={unit.unitNumber}
        subtitle={`${unit.buildingName} \u2022 ${unit.clientName}`}
        backHref={`/installer/buildings/${unit.buildingId}`}
      />

      <div className="px-4 py-5 flex flex-col gap-6">
        {/* Risk + Status */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex items-center justify-between"
        >
          <RiskBadge flag={unit.riskFlag} />
          {unit.bracketingDate && (
            <span className="text-xs text-muted font-mono">
              Bracket: {unit.bracketingDate}
            </span>
          )}
        </motion.div>

        {/* Status Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
            Status
          </h2>
          <div className="flex flex-col gap-0">
            {UNIT_STATUSES.map((status, i) => {
              const step = UNIT_STATUS_ORDER[status];
              const isComplete = step < currentStep;
              const isCurrent = step === currentStep;
              const isFuture = step > currentStep;

              return (
                <div key={status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    {isComplete ? (
                      <CheckCircle
                        size={20}
                        weight="fill"
                        className="text-emerald-500"
                      />
                    ) : isCurrent ? (
                      <div className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    ) : (
                      <Circle size={20} className="text-zinc-300" />
                    )}
                    {i < UNIT_STATUSES.length - 1 && (
                      <div
                        className={`w-px h-6 ${
                          isComplete ? "bg-emerald-300" : "bg-zinc-200"
                        }`}
                      />
                    )}
                  </div>
                  <span
                    className={`text-sm pb-5 ${
                      isCurrent
                        ? "font-semibold text-zinc-900"
                        : isComplete
                          ? "text-zinc-500"
                          : "text-zinc-300"
                    }`}
                  >
                    {UNIT_STATUS_LABELS[status]}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-3"
        >
          {stats.map(({ label, value, Icon }) => (
            <div
              key={label}
              className="bg-white rounded-2xl border border-border p-4 flex items-center gap-3"
            >
              <div className="w-9 h-9 rounded-xl bg-zinc-100 flex items-center justify-center">
                <Icon size={18} className="text-zinc-500" />
              </div>
              <div>
                <p className="text-lg font-semibold text-zinc-900 font-mono tracking-tight">
                  {value}
                </p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Rooms */}
        {rooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
              Rooms
            </h2>
            <div className="flex flex-col gap-2">
              {rooms.map((room) => (
                <Link key={room.id} href={`/installer/units/${unit.id}/rooms/${room.id}`}>
                  <div className="flex items-center justify-between bg-white rounded-xl border border-border px-4 py-3 hover:border-zinc-300 transition-all active:scale-[0.99]">
                    <div>
                      <p className="text-sm font-medium text-zinc-900">{room.name}</p>
                      <p className="text-xs text-muted">
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

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3 pt-2"
        >
          <Link href={`/installer/units/${unit.id}/rooms`}>
            <Button fullWidth size="lg">
              {rooms.length === 0 ? "Create Rooms" : "Manage Rooms"}
            </Button>
          </Link>
          <Link href={`/installer/units/${unit.id}/status`}>
            <Button variant="secondary" fullWidth size="lg">
              Update Status
            </Button>
          </Link>
        </motion.div>
      </div>
    </div>
  );
}
