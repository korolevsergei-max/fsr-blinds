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
  ClockCounterClockwise,
  Wrench,
  Buildings,
  Robot,
  UserGear,
  ArrowRight,
  Trash,
  ShieldCheck,
} from "@phosphor-icons/react";
import { getRoomsByUnit, getWindowsByRoom } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitActivityLog } from "@/lib/types";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { updateUnitAssignment } from "@/app/actions/fsr-data";
import { deleteUnit } from "@/app/actions/management-actions";
import { UserRole } from "@/lib/auth";
import { useRouter } from "next/navigation";
import { UNIT_STATUS_LABELS } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { DateInput } from "@/components/ui/date-input";
import { UnitStageMediaViewer } from "@/components/unit-stage-media-viewer";
import { UnitEscalationsPanel } from "@/components/units/unit-escalations-panel";
import { UnitProgressMilestonesPanel } from "@/components/units/unit-progress-milestones-panel";
import { CompleteByHighlightCard } from "@/components/units/complete-by-highlight-card";
import { countDisplayableUnitPhotos } from "@/lib/unit-media";
import { getEscalationSurfaceClasses, getRoomEscalationRiskFlag, getUnitEscalations } from "@/lib/window-issues";
import { resolveEscalationHref } from "@/lib/escalation-helpers";
import { useAppDatasetMaybe } from "@/lib/dataset-context";

const ACTION_LABELS: Record<string, string> = {
  unit_created: "Unit added to the database",
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
  client_approved: "Installed",
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
  if (log.action === "unit_created") {
    const num =
      d && typeof d.unitNumber === "string" ? d.unitNumber : null;
    const when = formatDateTime(log.createdAt);
    return num
      ? `Unit ${num} \u2022 Added to database ${when}`
      : `Added to database ${when}`;
  }
  if (log.action === "installer_assigned" || log.action === "bulk_assigned") {
    const parts: string[] = [];
    if (d.installer) parts.push(`\u2192 ${d.installer}`);
    if (d.measurementDate) parts.push(`Measurement: ${d.measurementDate}`);
    if (d.bracketingDate) parts.push(`Bracketing: ${d.bracketingDate}`);
    if (d.installationDate) parts.push(`Install: ${d.installationDate}`);
    return parts.join(" \u2022 ");
  }
  if (log.action === "status_changed") {
    const from = resolveStatusLabel(d.from);
    const to = resolveStatusLabel(d.to);
    const note = d.note ? ` \u2014 "${d.note}"` : "";
    return from && to ? `${from} \u2192 ${to}${note}` : to || from;
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
  userRole,
}: {
  data?: AppDataset;
  activityLog: UnitActivityLog[];
  mediaItems: UnitStageMediaItem[];
  milestones: import("@/lib/unit-milestones").UnitMilestoneCoverage;
  userRole?: UserRole;
}) {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const datasetCtx = useAppDatasetMaybe();
  const datasetData = data ?? datasetCtx?.data;
  const resolvedUserRole = userRole ?? (datasetCtx?.user.role as UserRole | undefined);
  const unit = datasetData?.units.find((u) => u.id === id);
  const rooms = unit && datasetData ? getRoomsByUnit(datasetData, unit.id) : [];
  const unitWindows =
    datasetData && unit
      ? rooms.flatMap((room) => getWindowsByRoom(datasetData, room.id))
      : [];

  const unitId = unit?.id;
  const unitCreatedAt = unit?.createdAt;
  const unitNumber = unit?.unitNumber;

  const getDisplayActivityLog = (): UnitActivityLog[] => {
    if (!unitCreatedAt) return activityLog;
    const hasCreation = activityLog.some((l) => l.action === "unit_created");
    if (hasCreation) return activityLog;
    const synthetic: UnitActivityLog = {
      id: `derived-unit-created-${unitId}`,
      unitId: unitId!,
      actorRole: "system",
      actorName: "System",
      action: "unit_created",
      details: { unitNumber },
      createdAt: unitCreatedAt as string,
    };
    return [synthetic, ...activityLog].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  };
  const displayActivityLog = getDisplayActivityLog();

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

  const handleDeleteUnit = async () => {
    if (!unit || !confirm("Are you sure you want to delete this unit?")) return;
    startDateTransition(async () => {
      const result = await deleteUnit(unit.id);
      if (!result.ok) {
        alert(result.error);
        return;
      }
      router.push(`/management/buildings/${unit.buildingId}`);
    });
  };

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  const displayPhotoCount = countDisplayableUnitPhotos(mediaItems, {
    rooms,
    windows: unitWindows,
  });
  const escalations = datasetData ? getUnitEscalations(datasetData, unit.id) : [];

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
            <Link href={`/management/units/${unit.id}/assign?role=installer`}>
              <Button size="sm" variant="secondary">
                <Wrench size={14} />
                Installer
              </Button>
            </Link>
            <Link href={`/management/units/${unit.id}/assign?role=scheduler`}>
              <Button size="sm" variant="secondary">
                <CalendarBlank size={14} />
                Scheduler
              </Button>
            </Link>
            {resolvedUserRole === "owner" && (
              <Button 
                size="sm" 
                variant="danger" 
                onClick={handleDeleteUnit}
                disabled={isUpdatingDate}
              >
                <Trash size={14} />
                Delete
              </Button>
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
              <UserCircle size={17} className="text-tertiary" />
              <div>
                <p className="text-[11px] text-tertiary">Assigned scheduler</p>
                <p className="text-[13px] font-medium text-foreground">
                  {unit.assignedSchedulerName || "Unassigned"}
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

        {/* Progress milestones */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-4"
        >
          <UnitProgressMilestonesPanel
            unit={unit}
            milestones={milestones}
            layout="detail"
            title="Progress"
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
          <UnitEscalationsPanel
            escalations={escalations}
            getEscalationHref={(item) =>
              unitId
                ? resolveEscalationHref(item, unitWindows, unitId, "/management/units")
                : undefined
            }
          />
        </motion.div>

        {/* Rooms preview */}
        {rooms.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.24, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <SectionLabel as="h2">Rooms</SectionLabel>
            <div className="flex flex-col gap-2">
              {rooms.map((room) => {
                const roomEscalation = getRoomEscalationRiskFlag(
                  getWindowsByRoom(datasetData!, room.id)
                );
                const roomCardClass = getEscalationSurfaceClasses(roomEscalation, "room");

                return (
                  <Link
                    key={room.id}
                    href={`/management/units/${unit.id}/rooms/${room.id}`}
                    className={`flex items-center justify-between px-4 py-3 rounded-[12px] shadow-sm transition-all active:scale-[0.99] ${roomCardClass}`}
                  >
                    <span className="text-[13px] font-semibold">{room.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-white/80 font-mono">
                        {room.completedWindows}/{room.windowCount}
                      </span>
                      <ArrowRight size={13} />
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3"
        >
          <Link href={`/management/units/${unit.id}/rooms`}>
            <Button fullWidth size="lg">
              Manage rooms
            </Button>
          </Link>
          <Link href={`/management/units/${unit.id}/summary`}>
            <Button variant="secondary" fullWidth size="lg">
              View Summary
            </Button>
          </Link>
        </motion.div>

        {/* Activity Log */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.32, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-center gap-2 mb-3">
            <ClockCounterClockwise size={14} className="text-tertiary" />
            <SectionLabel as="h2" noMargin>Activity history</SectionLabel>
            {displayActivityLog.length > 0 && (
              <span className="ml-auto text-[10px] font-semibold text-tertiary bg-surface border border-border rounded-full px-2 py-0.5">
                {displayActivityLog.length}
              </span>
            )}
          </div>
          <ActivityTimeline logs={displayActivityLog} />
        </motion.div>

      </div>
    </div>
  );
}
