"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle,
  Circle,
  Info,
  WarningCircle,
} from "@phosphor-icons/react";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import {
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
  type UnitActivityLog,
} from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";
import { UnitStageMediaViewer } from "@/components/unit-stage-media-viewer";
import { UnitEscalationsPanel } from "@/components/units/unit-escalations-panel";
import { CompleteByHighlightCard } from "@/components/units/complete-by-highlight-card";
import { countDisplayableUnitPhotos } from "@/lib/unit-media";
import { getUnitEscalations } from "@/lib/window-issues";
import { formatStoredDateForDisplay, parseStoredDate } from "@/lib/created-date";

export function UnitDetail({
  data,
  mediaItems,
  activityLog,
  milestones,
}: {
  data: AppDataset;
  mediaItems: UnitStageMediaItem[];
  activityLog: UnitActivityLog[];
  milestones: import("@/lib/unit-milestones").UnitMilestoneCoverage;
}) {
  const { id } = useParams<{ id: string }>();
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];
  const roomIds = new Set(rooms.map((room) => room.id));
  const escalationCount = data.windows.filter(
    (window) => roomIds.has(window.roomId) && window.riskFlag !== "green"
  ).length;
  const bracketedWindowIdsByRoom = new Map<string, Set<string>>();
  for (const item of mediaItems) {
    if (
      item.stage === "bracketed_measured" &&
      item.roomId &&
      item.windowId &&
      item.uploadKind === "window_measure"
    ) {
      const set = bracketedWindowIdsByRoom.get(item.roomId) ?? new Set<string>();
      set.add(item.windowId);
      bracketedWindowIdsByRoom.set(item.roomId, set);
    }
  }

  if (!unit) {
    return (
      <div className="p-6 text-center text-muted">Unit not found</div>
    );
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status as UnitStatus] ?? 0;
  const displayPhotoCount = countDisplayableUnitPhotos(mediaItems);
  const escalations = getUnitEscalations(data, unit.id);
  const today = new Date();
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  const formatDate = (value: string | null | undefined) =>
    formatStoredDateForDisplay(value) ?? "Not set";

  const isPastDue = (value: string | null | undefined) => {
    if (!value) return false;
    const parsed = parseStoredDate(value);
    if (!parsed) return false;
    const day = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    return day.getTime() < todayDay.getTime();
  };

  const measurementPastDue = isPastDue(unit.measurementDate) && !milestones.allMeasured;
  const bracketingPastDue = isPastDue(unit.bracketingDate) && !milestones.allBracketed;
  const installationPastDue = isPastDue(unit.installationDate) && !milestones.allInstalled;
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
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted font-mono">
              {unit.unitNumber}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <StatusChip status={unit.status} />
          </div>
        </motion.div>

        {/* Key Dates */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <CompleteByHighlightCard completeByDate={unit.completeByDate} />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-1 gap-3"
        >
          {/* Measurement milestone */}
          <div
            className={`rounded-2xl border px-4 py-3 ${
              measurementPastDue
                ? "border-red-200 bg-red-50"
                : "border-border bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className={`text-[10px] font-bold uppercase tracking-[0.12em] ${measurementPastDue ? "text-red-600" : "text-muted"}`}>
                Measurement
              </p>
              {measurementPastDue && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                  <WarningCircle size={12} weight="fill" />
                  Overdue
                </span>
              )}
            </div>
            <div className="flex items-start gap-6">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-[0.1em] font-medium">Scheduled</p>
                <p className={`mt-0.5 text-sm font-semibold ${measurementPastDue ? "text-red-700" : "text-foreground"}`}>
                  {formatDate(unit.measurementDate)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-[0.1em] font-medium">Completed</p>
                <p
                  className={`mt-0.5 text-sm font-semibold ${
                    milestones.allMeasured && milestones.measuredCompletedAt
                      ? "text-accent"
                      : "text-foreground"
                  }`}
                >
                  {milestones.allMeasured
                    ? formatDate(milestones.measuredCompletedAt)
                    : "Not set"}
                </p>
              </div>
            </div>
          </div>

          {/* Bracketing milestone */}
          <div
            className={`rounded-2xl border px-4 py-3 ${
              bracketingPastDue
                ? "border-red-200 bg-red-50"
                : "border-border bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p
                className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                  bracketingPastDue ? "text-red-600" : "text-muted"
                }`}
              >
                Bracketing
              </p>
              {bracketingPastDue && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                  <WarningCircle size={12} weight="fill" />
                  Overdue
                </span>
              )}
            </div>
            <div className="flex items-start gap-6">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-[0.1em] font-medium">Scheduled</p>
                <p className={`mt-0.5 text-sm font-semibold ${bracketingPastDue ? "text-red-700" : "text-foreground"}`}>
                  {formatDate(unit.bracketingDate)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-[0.1em] font-medium">Completed</p>
                <p
                  className={`mt-0.5 text-sm font-semibold ${
                    milestones.allBracketed && milestones.bracketedCompletedAt
                      ? "text-accent"
                      : "text-foreground"
                  }`}
                >
                  {milestones.allBracketed
                    ? formatDate(milestones.bracketedCompletedAt)
                    : "Not set"}
                </p>
              </div>
            </div>
          </div>

          {/* Installation milestone */}
          <div
            className={`rounded-2xl border px-4 py-3 ${
              installationPastDue
                ? "border-red-200 bg-red-50"
                : "border-border bg-white"
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p
                className={`text-[10px] font-bold uppercase tracking-[0.12em] ${
                  installationPastDue ? "text-red-600" : "text-muted"
                }`}
              >
                Installation
              </p>
              {installationPastDue && (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-red-600">
                  <WarningCircle size={12} weight="fill" />
                  Overdue
                </span>
              )}
            </div>
            <div className="flex items-start gap-6">
              <div>
                <p className="text-[10px] text-muted uppercase tracking-[0.1em] font-medium">Scheduled</p>
                <p className={`mt-0.5 text-sm font-semibold ${installationPastDue ? "text-red-700" : "text-foreground"}`}>
                  {formatDate(unit.installationDate)}
                </p>
              </div>
              <div>
                <p className="text-[10px] text-muted uppercase tracking-[0.1em] font-medium">Completed</p>
                <p
                  className={`mt-0.5 text-sm font-semibold ${
                    milestones.allInstalled && milestones.installedCompletedAt
                      ? "text-accent"
                      : "text-foreground"
                  }`}
                >
                  {milestones.allInstalled
                    ? formatDate(milestones.installedCompletedAt)
                    : "Not set"}
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-3"
        >
          <MetricTile value={unit.roomCount} label="Rooms" />
          <MetricTile value={unit.windowCount} label="Windows" />
          <MetricTile value={displayPhotoCount} label="Photos" />
          <MetricTile value={escalationCount} label="Escalations" />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <UnitEscalationsPanel escalations={escalations} />
        </motion.div>

        {/* Installation Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em]">
              Installation Timeline
            </h3>
            <UnitStageMediaViewer items={mediaItems} />
          </div>
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
                    {status === "not_started" && isCurrent && unit.measurementDate && (
                      <p className="text-[11px] text-muted mt-0.5">
                        Measurement scheduled: {formatDate(unit.measurementDate)}
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
                  <div className="flex items-center justify-between bg-accent text-white px-4 py-3.5 rounded-[12px] shadow-sm hover:opacity-90 transition-all duration-200 active:scale-[0.99]">
                    <div>
                      <p className="text-[14px] font-semibold">{room.name}</p>
                      <p className="text-[11px] text-white/80 mt-0.5">
                        {room.completedWindows}/{room.windowCount} measured •{" "}
                        {Math.min(
                          bracketedWindowIdsByRoom.get(room.id)?.size ?? 0,
                          room.windowCount
                        )}
                        /{room.windowCount} bracketed
                      </p>
                    </div>
                    <ArrowRight size={15} />
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
            className="bg-accent-light rounded-[var(--radius-xl)] border border-[rgba(15,118,110,0.15)] p-4 flex gap-3"
          >
            <Info size={20} weight="fill" className="text-accent flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold text-accent uppercase tracking-wider">
                Architectural Note
              </p>
              <p className="text-[12px] text-secondary mt-1 leading-relaxed">
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
              Manage rooms
            </Button>
          </Link>
          <Link href={`/installer/units/${unit.id}/status`}>
            <Button variant="secondary" fullWidth size="lg">
              View Progress
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
