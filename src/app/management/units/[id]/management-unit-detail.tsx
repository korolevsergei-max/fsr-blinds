"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  UserCircle,
  CalendarBlank,
  Door,
  Ruler,
  Camera,
  PencilSimple,
  CheckCircle,
  Circle,
} from "@phosphor-icons/react";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import {
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
} from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { RiskBadge } from "@/components/ui/risk-badge";
import { Button } from "@/components/ui/button";

export function ManagementUnitDetail({ data }: { data: AppDataset }) {
  const { id } = useParams<{ id: string }>();
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status];

  return (
    <div className="flex flex-col">
      <PageHeader
        title={unit.unitNumber}
        subtitle={`${unit.buildingName} \u2022 ${unit.clientName}`}
        backHref="/management/units"
        actions={
          <Link href={`/management/units/${unit.id}/assign`}>
            <Button size="sm" variant="secondary">
              <PencilSimple size={14} />
              Assign
            </Button>
          </Link>
        }
      />

      <div className="px-4 py-5 flex flex-col gap-6">
        {/* Risk + Assignment */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center justify-between">
            <RiskBadge flag={unit.riskFlag} />
          </div>

          <div className="bg-white rounded-xl border border-border divide-y divide-border">
            <div className="flex items-center gap-3 px-4 py-3">
              <UserCircle size={18} className="text-zinc-400" />
              <div>
                <p className="text-xs text-muted">Assigned Installer</p>
                <p className="text-sm font-medium text-zinc-900">
                  {unit.assignedInstallerName || "Unassigned"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <CalendarBlank size={18} className="text-zinc-400" />
              <div>
                <p className="text-xs text-muted">Bracketing Date</p>
                <p className="text-sm font-medium text-zinc-900 font-mono">
                  {unit.bracketingDate || "Not set"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <CalendarBlank size={18} className="text-zinc-400" />
              <div>
                <p className="text-xs text-muted">Installation Date</p>
                <p className="text-sm font-medium text-zinc-900 font-mono">
                  {unit.installationDate || "Not set"}
                </p>
              </div>
            </div>
          </div>
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
          <div className="flex flex-col">
            {UNIT_STATUSES.map((status, i) => {
              const step = UNIT_STATUS_ORDER[status];
              const isComplete = step < currentStep;
              const isCurrent = step === currentStep;
              return (
                <div key={status} className="flex items-start gap-3">
                  <div className="flex flex-col items-center">
                    {isComplete ? (
                      <CheckCircle size={18} weight="fill" className="text-emerald-500" />
                    ) : isCurrent ? (
                      <div className="w-[18px] h-[18px] rounded-full bg-accent flex items-center justify-center">
                        <div className="w-2 h-2 rounded-full bg-white" />
                      </div>
                    ) : (
                      <Circle size={18} className="text-zinc-300" />
                    )}
                    {i < UNIT_STATUSES.length - 1 && (
                      <div className={`w-px h-5 ${isComplete ? "bg-emerald-300" : "bg-zinc-200"}`} />
                    )}
                  </div>
                  <span
                    className={`text-xs pb-4 ${
                      isCurrent ? "font-semibold text-zinc-900" : isComplete ? "text-zinc-500" : "text-zinc-300"
                    }`}
                  >
                    {UNIT_STATUS_LABELS[status]}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Stats */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-3"
        >
          {[
            { label: "Rooms", value: unit.roomCount, Icon: Door },
            { label: "Windows", value: unit.windowCount, Icon: Ruler },
            { label: "Photos", value: unit.photosUploaded, Icon: Camera },
          ].map(({ label, value, Icon }) => (
            <div
              key={label}
              className="bg-white rounded-xl border border-border p-3.5 flex items-center gap-3"
            >
              <Icon size={16} className="text-zinc-400" />
              <div>
                <p className="text-base font-semibold text-zinc-900 font-mono">{value}</p>
                <p className="text-xs text-muted">{label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        {/* Rooms preview */}
        {rooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h2 className="text-xs font-medium text-muted uppercase tracking-widest mb-3">
              Rooms
            </h2>
            <div className="bg-white rounded-xl border border-border divide-y divide-border">
              {rooms.map((room) => (
                <div key={room.id} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm text-zinc-900">{room.name}</span>
                  <span className="text-xs text-muted font-mono">
                    {room.completedWindows}/{room.windowCount}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
