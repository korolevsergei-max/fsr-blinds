"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { useTransition } from "react";
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
  ClockCounterClockwise,
  Wrench,
  Buildings,
  Robot,
  UserGear,
  ArrowRight,
} from "@phosphor-icons/react";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitActivityLog } from "@/lib/types";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { updateUnitAssignment } from "@/app/actions/fsr-data";
import {
  UNIT_STATUSES,
  UNIT_STATUS_LABELS,
  UNIT_STATUS_ORDER,
} from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { DateInput } from "@/components/ui/date-input";
import { UnitStageMediaViewer } from "@/components/unit-stage-media-viewer";
import { UnitEscalationsPanel } from "@/components/units/unit-escalations-panel";
import { CompleteByHighlightCard } from "@/components/units/complete-by-highlight-card";
import { countDisplayableUnitPhotos } from "@/lib/unit-media";
import { getUnitEscalations } from "@/lib/window-issues";
import { formatStoredDateForDisplay } from "@/lib/created-date";

const ACTION_LABELS: Record<string, string> = {
  unit_created: "Unit added to the system",
  installer_assigned: "Installer assigned",
  bulk_assigned: "Bulk assigned",
  status_changed: "Status updated",
  complete_by_date_set: "Complete-by date updated",
  stage_photos_added: "Stage photos added",
  bracketing_date_set: "Bracketing date set",
  installation_date_set: "Installation date set",
};

const ACTOR_ICONS: Record<string, React.ReactNode> = {
  owner: <UserGear size={14} className="text-indigo-500" />,
  scheduler: <CalendarBlank size={14} className="text-sky-500" />,
  installer: <Wrench size={14} className="text-teal-500" />,
  manufacturer: <Buildings size={14} className="text-orange-500" />,
  system: <Robot size={14} className="text-zinc-400" />,
};

const ACTOR_COLORS: Record<string, string> = {
  owner: "bg-indigo-50 border-indigo-100",
  scheduler: "bg-sky-50 border-sky-100",
  installer: "bg-teal-50 border-teal-100",
  manufacturer: "bg-orange-50 border-orange-100",
  system: "bg-zinc-50 border-zinc-100",
};

function formatRelative(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMs / 3600000);
  const diffD = Math.floor(diffMs / 86400000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffH < 24) return `${diffH}h ago`;
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric", year: "numeric" });
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const LEGACY_STATUS_LABELS: Record<string, string> = {
  pending_scheduling: "Not Yet Started",
  scheduled_bracketing: "Not Yet Started",
  bracketed_measured: "Measured",
  install_date_scheduled: "Bracketed",
  installed_pending_approval: "Installed",
};

function resolveStatusLabel(value: unknown): string {
  if (!value) return "";
  const s = String(value);
  return UNIT_STATUS_LABELS[s as keyof typeof UNIT_STATUS_LABELS]
    ?? LEGACY_STATUS_LABELS[s]
    ?? s;
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
  return "";
}

function ActivityTimeline({ logs }: { logs: UnitActivityLog[] }) {
  if (logs.length === 0) {
    return (
      <div className="py-8 text-center text-muted text-sm flex flex-col items-center gap-2">
        <ClockCounterClockwise size={28} className="text-zinc-300" />
        No activity yet
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {logs.map((log, i) => {
        const isLast = i === logs.length - 1;
        const description = buildLogDescription(log);
        const icon = ACTOR_ICONS[log.actorRole] ?? ACTOR_ICONS.system;
        const colorClass = ACTOR_COLORS[log.actorRole] ?? ACTOR_COLORS.system;

        return (
          <div key={log.id} className="flex gap-3">
            {/* Timeline spine */}
            <div className="flex flex-col items-center flex-shrink-0 w-8">
              <div className={`w-7 h-7 rounded-full border flex items-center justify-center flex-shrink-0 ${colorClass}`}>
                {icon}
              </div>
              {!isLast && <div className="w-px flex-1 bg-zinc-100 my-1" />}
            </div>

            {/* Content */}
            <div className={`pb-5 flex-1 min-w-0 ${isLast ? "" : ""}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-[12px] font-semibold text-foreground leading-snug">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </p>
                  <p className="text-[11px] text-tertiary">{log.actorName}</p>
                </div>
                <span
                  className="text-[10px] text-muted flex-shrink-0 mt-0.5"
                  title={formatDateTime(log.createdAt)}
                >
                  {formatRelative(log.createdAt)}
                </span>
              </div>
              {description && (
                <p className="mt-1 text-[11px] text-secondary leading-relaxed">{description}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ManagementUnitDetail({
  data,
  activityLog,
  mediaItems,
  milestones,
}: {
  data: AppDataset;
  activityLog: UnitActivityLog[];
  mediaItems: UnitStageMediaItem[];
  milestones: import("@/lib/unit-milestones").UnitMilestoneCoverage;
}) {
  const { id } = useParams<{ id: string }>();
  const unit = data.units.find((u) => u.id === id);
  const rooms = unit ? getRoomsByUnit(data, unit.id) : [];

  const [isUpdatingDate, startDateTransition] = useTransition();

  const handleBracketingDateChange = (dateString: string) => {
    if (!unit) return;
    startDateTransition(async () => {
      await updateUnitAssignment(
        unit.id,
        unit.assignedInstallerId,
        unit.measurementDate || "",
        dateString,
        unit.installationDate || ""
      );
    });
  };

  const handleInstallationDateChange = (dateString: string) => {
    if (!unit) return;
    startDateTransition(async () => {
      await updateUnitAssignment(
        unit.id,
        unit.assignedInstallerId,
        unit.measurementDate || "",
        unit.bracketingDate || "",
        dateString
      );
    });
  };

  const handleMeasurementDateChange = (dateString: string) => {
    if (!unit) return;
    startDateTransition(async () => {
      await updateUnitAssignment(
        unit.id,
        unit.assignedInstallerId,
        dateString,
        unit.bracketingDate || "",
        unit.installationDate || ""
      );
    });
  };

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const currentStep = UNIT_STATUS_ORDER[unit.status as UnitStatus] ?? 0;
  const displayPhotoCount = countDisplayableUnitPhotos(mediaItems);
  const escalations = getUnitEscalations(data, unit.id);

  // Evidence-based completion dates
  const measurementCompleted = milestones.allMeasured ? milestones.measuredCompletedAt : null;
  const bracketingCompleted = milestones.allBracketed ? milestones.bracketedCompletedAt : null;
  const installationCompleted = milestones.allInstalled ? milestones.installedCompletedAt : null;

  const formatDate = (value: string | null | undefined) =>
    formatStoredDateForDisplay(value);

  return (
    <div className="flex flex-col">
      <PageHeader
        title={unit.unitNumber}
        subtitle={`${unit.buildingName} \u2022 ${unit.clientName}`}
        backHref="/management/units"
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/management/units/${unit.id}/dates`}>
              <Button size="sm" variant="secondary">
                <CalendarBlank size={14} />
                Key dates
              </Button>
            </Link>
            <Link href={`/management/units/${unit.id}/assign`}>
              <Button size="sm" variant="secondary">
                <PencilSimple size={14} />
                Assign
              </Button>
            </Link>
            {(unit.status as UnitStatus) === "installed" && (
              <Link href={`/management/units/${unit.id}/status`}>
                <Button size="sm">
                  <ArrowRight size={14} />
                  Approve
                </Button>
              </Link>
            )}
          </div>
        }
      />

      <div className="px-4 py-5 flex flex-col gap-6">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <CompleteByHighlightCard completeByDate={unit.completeByDate} />
        </motion.div>

        {/* Risk + Assignment */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3"
        >
          <div></div>

          <div className="surface-card divide-y divide-border-subtle overflow-hidden" style={{ padding: 0 }}>
            <div className="flex items-center gap-3 px-4 py-3">
              <UserCircle size={17} className="text-tertiary" />
              <div>
                <p className="text-[11px] text-tertiary">Assigned installer</p>
                <p className="text-[13px] font-medium text-foreground">
                  {unit.assignedInstallerName || "Unassigned"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <CalendarBlank size={17} className="text-tertiary" />
              <div>
                <p className="text-[11px] text-tertiary">Measurement date</p>
                <DateInput
                  value={unit.measurementDate || ""}
                  onChange={handleMeasurementDateChange}
                  disabled={isUpdatingDate}
                  compact
                  className="-ml-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <CalendarBlank size={17} className="text-tertiary" />
              <div>
                <p className="text-[11px] text-tertiary">Bracketing date</p>
                <DateInput
                  value={unit.bracketingDate || ""}
                  onChange={handleBracketingDateChange}
                  disabled={isUpdatingDate}
                  compact
                  className="-ml-1"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-3">
              <CalendarBlank size={17} className="text-tertiary" />
              <div>
                <p className="text-[11px] text-tertiary">Installation date</p>
                <DateInput
                  value={unit.installationDate || ""}
                  onChange={handleInstallationDateChange}
                  disabled={isUpdatingDate}
                  compact
                  className="-ml-1"
                />
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
          <div className="mb-3 flex items-center justify-between gap-3">
            <SectionLabel as="h2" noMargin>Progress</SectionLabel>
            <UnitStageMediaViewer items={mediaItems} />
          </div>
          <div className="flex flex-col">
            {UNIT_STATUSES.map((status, i) => {
              const step = UNIT_STATUS_ORDER[status];
              const isComplete = step < currentStep;
              const isCurrent = step === currentStep;

              // Map each progress status to its scheduled/completed dates
              const scheduledDate =
                status === "measured" ? formatDate(unit.measurementDate)
                : status === "bracketed" ? formatDate(unit.bracketingDate)
                : status === "installed" ? formatDate(unit.installationDate)
                : null;
              const completedDate =
                status === "measured" ? formatDate(measurementCompleted)
                : status === "bracketed" ? formatDate(bracketingCompleted)
                : status === "installed" ? formatDate(installationCompleted)
                : null;

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
                  <div className={`pb-4 flex-1 ${isCurrent ? "text-foreground" : isComplete ? "text-secondary" : "text-tertiary"}`}>
                    <span className={`text-[12px] ${isCurrent ? "font-semibold" : isComplete ? "font-medium" : ""}`}>
                      {UNIT_STATUS_LABELS[status]}
                      {status === "client_approved" && (unit.status as UnitStatus) === "installed" && (
                        <Link
                          href={`/management/units/${unit.id}/status`}
                          className="ml-2 text-[10px] font-bold text-accent underline underline-offset-2"
                        >
                          Approve →
                        </Link>
                      )}
                    </span>
                    {(scheduledDate || completedDate) && (
                      <div className="flex gap-4 mt-0.5">
                        {scheduledDate && (
                          <p className="text-[10px] text-tertiary">
                            Sched: {scheduledDate}
                          </p>
                        )}
                        {completedDate && (
                          <p className="text-[10px] text-accent font-medium">
                            Done: {completedDate}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
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
            { label: "Photos", value: displayPhotoCount, Icon: Camera },
          ].map(({ label, value, Icon }) => (
            <div
              key={label}
              className="surface-card p-3.5 flex items-center gap-3"
            >
              <Icon size={15} className="text-tertiary" />
              <div>
                <p className="text-[1rem] font-semibold text-foreground font-mono">{value}</p>
                <p className="text-[11px] text-tertiary">{label}</p>
              </div>
            </div>
          ))}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <UnitEscalationsPanel escalations={escalations} />
        </motion.div>

        {/* Rooms preview */}
        {rooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <SectionLabel as="h2">Rooms</SectionLabel>
            <div className="surface-card divide-y divide-border-subtle overflow-hidden" style={{ padding: 0 }}>
              {rooms.map((room) => (
                <Link
                  key={room.id}
                  href={`/management/units/${unit.id}/rooms/${room.id}`}
                  className="flex items-center justify-between px-4 py-3 hover:bg-surface transition-colors"
                >
                  <span className="text-[13px] text-foreground">{room.name}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-tertiary font-mono">
                      {room.completedWindows}/{room.windowCount}
                    </span>
                    <ArrowRight size={13} className="text-tertiary" />
                  </div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}

        {/* Activity Log */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ClockCounterClockwise size={14} className="text-tertiary" />
            <SectionLabel as="h2" noMargin>Activity history</SectionLabel>
            {activityLog.length > 0 && (
              <span className="ml-auto text-[10px] font-semibold text-tertiary bg-surface border border-border rounded-full px-2 py-0.5">
                {activityLog.length}
              </span>
            )}
          </div>
          <ActivityTimeline logs={activityLog} />
        </motion.div>
      </div>
    </div>
  );
}
