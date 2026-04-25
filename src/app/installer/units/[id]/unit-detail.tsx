"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Info, WarningCircle, UserGear, CalendarCheck, Wrench, Buildings, Robot, ClockCounterClockwise, ShieldCheck } from "@phosphor-icons/react";
import { getRoomsByUnit, getWindowsByRoom } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { UNIT_STATUS_LABELS, type UnitActivityLog } from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { StatusChip } from "@/components/ui/status-chip";
import { MetricTile } from "@/components/ui/metric-tile";
import { Button } from "@/components/ui/button";
import { UnitStageMediaViewer } from "@/components/unit-stage-media-viewer";
import { UnitEscalationsPanel } from "@/components/units/unit-escalations-panel";
import { UnitProgressMilestonesPanel } from "@/components/units/unit-progress-milestones-panel";
import { CompleteByHighlightCard } from "@/components/units/complete-by-highlight-card";
import { countDisplayableUnitPhotos } from "@/lib/unit-media";
import { getUnitEscalations } from "@/lib/window-issues";
import { formatStoredDateForDisplay, parseStoredDate } from "@/lib/created-date";
import { SectionLabel } from "@/components/ui/section-label";
import { useAppDatasetMaybe } from "@/lib/dataset-context";
import { getEscalationSurfaceClasses, getRoomEscalationRiskFlag } from "@/lib/window-issues";

const ACTOR_ICONS: Record<string, React.ReactNode> = {
  owner: <UserGear size={14} className="text-indigo-500" />,
  scheduler: <CalendarCheck size={14} className="text-sky-500" />,
  installer: <Wrench size={14} className="text-teal-500" />,
  cutter: <Buildings size={14} className="text-orange-500" />,
  qc: <ShieldCheck size={14} className="text-emerald-600" />,
  system: <Robot size={14} className="text-zinc-400" />,
};

const ACTOR_COLORS: Record<string, string> = {
  owner: "bg-indigo-50 border-indigo-100",
  scheduler: "bg-sky-50 border-sky-100",
  installer: "bg-teal-50 border-teal-100",
  cutter: "bg-orange-50 border-orange-100",
  qc: "bg-emerald-50 border-emerald-100",
  system: "bg-zinc-50 border-zinc-100",
};

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const diffD = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffD === 0) return "today";
  if (diffD === 1) return "yesterday";
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function resolveStatusLabel(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  return UNIT_STATUS_LABELS[s as UnitStatus] ?? s;
}

const ACTION_LABELS: Record<string, string> = {
  window_created: "Window added",
  window_updated: "Window edited",
  window_deleted: "Window deleted",
  post_bracketing_photo_added: "Post-bracketing photo uploaded",
  bracketing_completed: "Bracketing completed",
  installed_photo_added: "Installation photo uploaded",
  installation_completed: "Installation completed",
  installer_assigned: "Installer assigned",
  bulk_assigned: "Bulk assigned",
  status_changed: "Status updated",
  unit_created: "Unit added to the database",
};

function riskLabel(flag: unknown): string {
  if (flag === "red") return "🔴 High risk";
  if (flag === "yellow") return "🟡 Medium risk";
  return "";
}

function buildLogDescription(log: UnitActivityLog): string {
  const d = log.details ?? {};
  if (log.action === "installer_assigned" || log.action === "bulk_assigned") {
    const parts: string[] = [];
    if (d.installer) parts.push(`→ ${d.installer}`);
    if (d.measurementDate) parts.push(`Measurement: ${d.measurementDate}`);
    if (d.bracketingDate) parts.push(`Bracketing: ${d.bracketingDate}`);
    if (d.installationDate) parts.push(`Install: ${d.installationDate}`);
    return parts.join(" · ");
  }
  if (log.action === "status_changed") {
    const from = resolveStatusLabel(d.from);
    const to = resolveStatusLabel(d.to);
    const note = d.note ? ` — "${d.note}"` : "";
    return from && to ? `${from} → ${to}${note}` : to || from;
  }
  if (log.action === "window_created") {
    const parts: string[] = [];
    if (d.windowLabel) parts.push(String(d.windowLabel));
    if (d.blindType) parts.push(String(d.blindType));
    if (d.width && d.height) parts.push(`${d.width}" × ${d.height}"`);
    if (d.riskFlag && d.riskFlag !== "green") parts.push(riskLabel(d.riskFlag));
    if (d.hasPhoto) parts.push("photo attached");
    return parts.join(" · ");
  }
  if (log.action === "window_updated") {
    const parts: string[] = [];
    if (d.windowLabel) parts.push(String(d.windowLabel));
    if (d.blindType) parts.push(String(d.blindType));
    if (d.riskFlag && d.riskFlag !== "green") parts.push(riskLabel(d.riskFlag));
    if (d.replacedPhoto) parts.push("new photo saved");
    return parts.join(" · ");
  }
  if (log.action === "window_deleted") {
    const parts: string[] = [];
    if (d.windowLabel) parts.push(String(d.windowLabel));
    if (d.blindType) parts.push(String(d.blindType));
    return parts.join(" · ");
  }
  if (log.action === "post_bracketing_photo_added" || log.action === "bracketing_completed") {
    const parts: string[] = [];
    if (d.windowLabel) parts.push(String(d.windowLabel));
    if (d.riskFlag && d.riskFlag !== "green") parts.push(riskLabel(d.riskFlag));
    if (!d.hasPhoto) parts.push("no photo (green risk)");
    return parts.join(" · ");
  }
  if (log.action === "installed_photo_added" || log.action === "installation_completed") {
    const parts: string[] = [];
    if (d.windowLabel) parts.push(String(d.windowLabel));
    if (d.riskFlag && d.riskFlag !== "green") parts.push(riskLabel(d.riskFlag));
    if (!d.hasPhoto) parts.push("no photo (green risk)");
    return parts.join(" · ");
  }
  return "";
}

function MilestoneDateCard({
  label,
  scheduledDate,
  completedDate,
  isCompleted,
  isPastDue,
}: {
  label: string;
  scheduledDate: string;
  completedDate: string;
  isCompleted: boolean;
  isPastDue: boolean;
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border px-3 py-2.5 ${
        isPastDue ? "border-red-200 bg-red-50" : "border-border bg-white"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p
          className={`text-[9px] font-bold uppercase tracking-[0.12em] ${
            isPastDue ? "text-red-600" : "text-muted"
          }`}
        >
          {label}
        </p>
        {isPastDue && (
          <WarningCircle
            size={14}
            weight="fill"
            className="shrink-0 text-red-600"
            aria-label="Overdue"
          />
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <div>
          <p className="text-[9px] text-muted uppercase tracking-[0.1em] font-medium">
            Scheduled
          </p>
          <p
            className={`mt-0.5 text-[12px] font-semibold leading-tight ${
              isPastDue ? "text-red-700" : "text-foreground"
            }`}
          >
            {scheduledDate}
          </p>
        </div>
        <div>
          <p className="text-[9px] text-muted uppercase tracking-[0.1em] font-medium">
            Completed
          </p>
          <p
            className={`mt-0.5 text-[12px] font-semibold leading-tight ${
              isCompleted ? "text-accent" : "text-foreground"
            }`}
          >
            {completedDate}
          </p>
        </div>
      </div>
    </div>
  );
}

export function UnitDetail({
  data,
  mediaItems,
  activityLog,
  milestones,
}: {
  data?: AppDataset;
  mediaItems: UnitStageMediaItem[];
  activityLog: UnitActivityLog[];
  milestones: import("@/lib/unit-milestones").UnitMilestoneCoverage;
}) {
  const { id } = useParams<{ id: string }>();
  const datasetCtx = useAppDatasetMaybe();
  const datasetData = data ?? datasetCtx?.data;
  const unit = datasetData?.units.find((u) => u.id === id);
  const rooms = unit && datasetData ? getRoomsByUnit(datasetData, unit.id) : [];
  const unitWindows =
    datasetData && unit
      ? rooms.flatMap((room) => getWindowsByRoom(datasetData, room.id))
      : [];
  const escalations = unit && datasetData ? getUnitEscalations(datasetData, unit.id) : [];
  const escalationCount = escalations.length;
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

  // Derive status from live milestone data — guards against stale DB values
  // (e.g. a unit that still shows "measured" after all rooms/windows were removed)
  const effectiveStatus: UnitStatus =
    milestones.totalWindows === 0
      ? "not_started"
      : milestones.allInstalled
      ? "installed"
      : milestones.allMeasured && milestones.allBracketed && milestones.allManufactured
      ? "manufactured"
      : milestones.allBracketed
      ? "bracketed"
      : milestones.allMeasured
      ? "measured"
      : "not_started";

  const displayPhotoCount = countDisplayableUnitPhotos(mediaItems, {
    rooms,
    windows: unitWindows,
  });
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
          <h2 className="text-2xl font-bold tracking-tight text-foreground mt-0.5">
            {unit.buildingName}
          </h2>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-xs text-muted font-mono">
              {unit.unitNumber}
            </p>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <StatusChip status={effectiveStatus} />
          </div>
        </motion.div>

        {/* Key Dates */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-2"
        >
          <CompleteByHighlightCard completeByDate={unit.completeByDate} compact />
          <MilestoneDateCard
            label="Measurement"
            scheduledDate={formatDate(unit.measurementDate)}
            completedDate={milestones.allMeasured ? formatDate(milestones.measuredCompletedAt) : "Not set"}
            isCompleted={Boolean(milestones.allMeasured && milestones.measuredCompletedAt)}
            isPastDue={measurementPastDue}
          />
          <MilestoneDateCard
            label="Bracketing"
            scheduledDate={formatDate(unit.bracketingDate)}
            completedDate={milestones.allBracketed ? formatDate(milestones.bracketedCompletedAt) : "Not set"}
            isCompleted={Boolean(milestones.allBracketed && milestones.bracketedCompletedAt)}
            isPastDue={bracketingPastDue}
          />
          <MilestoneDateCard
            label="Installation"
            scheduledDate={formatDate(unit.installationDate)}
            completedDate={milestones.allInstalled ? formatDate(milestones.installedCompletedAt) : "Not set"}
            isCompleted={Boolean(milestones.allInstalled && milestones.installedCompletedAt)}
            isPastDue={installationPastDue}
          />
        </motion.div>

        {/* Rooms */}
        {rooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <h3 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em] mb-3">
              Rooms
            </h3>
            <div className="flex flex-col gap-2">
              {rooms.map((room) => {
                const roomEscalation = getRoomEscalationRiskFlag(
                  getWindowsByRoom(datasetData!, room.id)
                );
                const roomCardClass = getEscalationSurfaceClasses(roomEscalation, "room");

                return (
                  <Link key={room.id} href={`/installer/units/${unit.id}/rooms/${room.id}`}>
                    <div
                      className={`flex items-center justify-between px-4 py-3.5 rounded-[12px] shadow-sm transition-all duration-200 active:scale-[0.99] ${roomCardClass}`}
                    >
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
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Stats Grid */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-2"
        >
          <MetricTile value={unit.roomCount} label="Rooms" compact />
          <MetricTile value={unit.windowCount} label="Windows" compact />
          <MetricTile value={displayPhotoCount} label="Photos" compact />
          <MetricTile value={escalationCount} label="Escalations" compact />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.13, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <UnitEscalationsPanel escalations={escalations} />
        </motion.div>

        {/* Progress milestones */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.16, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-5"
        >
          <UnitProgressMilestonesPanel
            unit={unit}
            milestones={milestones}
            layout="detail"
            density="comfortable"
            title="Installation progress"
            mediaViewerSlot={
              <UnitStageMediaViewer
                items={mediaItems}
                milestones={milestones}
                rooms={rooms}
                windows={unitWindows}
              />
            }
          />
        </motion.div>

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

        {/* Activity log */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.36, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="pb-6"
        >
          <SectionLabel className="mb-2">Activity</SectionLabel>
          {activityLog.length === 0 ? (
            <div className="py-8 text-center text-muted text-sm flex flex-col items-center gap-2">
              <ClockCounterClockwise size={28} className="text-zinc-300" />
              No activity yet
            </div>
          ) : (
            <div className="flex flex-col">
              {activityLog.map((log, i) => {
                const isLast = i === activityLog.length - 1;
                const description = buildLogDescription(log);
                const actorColor = ACTOR_COLORS[log.actorRole] ?? ACTOR_COLORS.system;
                const actorIcon = ACTOR_ICONS[log.actorRole] ?? ACTOR_ICONS.system;
                return (
                  <div key={log.id} className="relative flex gap-3 pb-4">
                    {!isLast && (
                      <div className="absolute left-[18px] top-7 bottom-0 w-px bg-border" />
                    )}
                    <div
                      className={`relative z-10 flex-shrink-0 w-9 h-9 rounded-full border flex items-center justify-center ${actorColor}`}
                    >
                      {actorIcon}
                    </div>
                    <div className="flex-1 pt-1.5">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-[12px] font-semibold text-foreground capitalize">
                          {log.actorName}
                          <span className="ml-1 text-[10px] font-medium text-tertiary capitalize">
                            ({log.actorRole})
                          </span>
                        </p>
                        <span className="text-[10px] text-muted flex-shrink-0">
                          {formatRelative(log.createdAt)}
                        </span>
                      </div>
                      <p className="text-[12px] text-secondary mt-0.5">
                        {ACTION_LABELS[log.action] ?? UNIT_STATUS_LABELS[log.action as keyof typeof UNIT_STATUS_LABELS] ?? log.action.replace(/_/g, " ")}
                      </p>
                      {description && (
                        <p className="text-[11px] text-muted mt-0.5 font-mono">{description}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
