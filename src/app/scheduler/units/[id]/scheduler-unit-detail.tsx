"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  UserCircle,
  CalendarBlank,
  PencilSimple,
  ClockCounterClockwise,
  Wrench,
  Buildings,
  Robot,
  UserGear,
  CalendarCheck,
  ArrowRight,
} from "@phosphor-icons/react";
import { getRoomsByUnit } from "@/lib/app-dataset";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitActivityLog } from "@/lib/types";
import { UNIT_STATUS_LABELS } from "@/lib/types";
import type { UnitStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/page-header";
import { SectionLabel } from "@/components/ui/section-label";
import { StatusChip } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { CompleteByHighlightCard } from "@/components/units/complete-by-highlight-card";
import { computeUnitFlags, FLAG_LABELS, FLAG_CLASSES, type UnitFlag } from "@/lib/unit-flags";
import { formatStoredDateForDisplay } from "@/lib/created-date";

const ACTOR_ICONS: Record<string, React.ReactNode> = {
  owner: <UserGear size={14} className="text-indigo-500" />,
  scheduler: <CalendarCheck size={14} className="text-sky-500" />,
  installer: <Wrench size={14} className="text-teal-500" />,
  cutter: <Buildings size={14} className="text-orange-500" />,
  system: <Robot size={14} className="text-zinc-400" />,
};

const ACTOR_COLORS: Record<string, string> = {
  owner: "bg-indigo-50 border-indigo-100",
  scheduler: "bg-sky-50 border-sky-100",
  installer: "bg-teal-50 border-teal-100",
  cutter: "bg-orange-50 border-orange-100",
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
  return UNIT_STATUS_LABELS[s as UnitStatus]
    ?? LEGACY_STATUS_LABELS[s]
    ?? s;
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

function FlagBadge({ flag }: { flag: UnitFlag }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${FLAG_CLASSES[flag]}`}>
      {FLAG_LABELS[flag]}
    </span>
  );
}

export function SchedulerUnitDetail({
  data,
  activityLog,
  milestones,
}: {
  data: AppDataset;
  activityLog: UnitActivityLog[];
  milestones: import("@/lib/unit-milestones").UnitMilestoneCoverage;
}) {
  const { id } = useParams<{ id: string }>();
  const unit = data.units.find((u) => u.id === id);
  const rooms = getRoomsByUnit(data, id);

  const today = new Date().toISOString().split("T")[0];

  if (!unit) {
    return <div className="p-6 text-center text-muted">Unit not found</div>;
  }

  // Derive status from live milestone data — guards against stale DB values
  const effectiveStatus: UnitStatus =
    milestones.totalWindows === 0
      ? "not_started"
      : milestones.allInstalled
      ? "installed"
      : milestones.allMeasured && milestones.allBracketed
      ? "measured_and_bracketed"
      : milestones.allMeasured
      ? "measured"
      : milestones.allBracketed
      ? "bracketed"
      : "not_started";

  const flags = computeUnitFlags(unit, today);

  const isPastDue = (dateStr: string | null | undefined) =>
    dateStr ? dateStr < today : false;

  const formatShort = (value: string | null | undefined) =>
    formatStoredDateForDisplay(value);

  const milestoneField = (
    label: string,
    scheduled: string | null | undefined,
    phaseDone: boolean,
    completedAt: string | null | undefined
  ) => (
    <div className="flex flex-col gap-0.5">
      <p className="text-[9px] font-bold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className={`text-[13px] font-semibold ${isPastDue(scheduled) && !phaseDone ? "text-red-600" : "text-foreground"}`}>
        {formatShort(scheduled) ?? "—"}
        {isPastDue(scheduled) && !phaseDone && (
          <span className="ml-1 text-[10px] font-bold text-red-500">OVERDUE</span>
        )}
      </p>
      <p className={`text-[11px] font-medium ${phaseDone && completedAt ? "text-accent" : "text-muted"}`}>
        Completed:{" "}
        {phaseDone ? formatShort(completedAt) ?? "—" : "—"}
      </p>
    </div>
  );

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title={unit.unitNumber}
        subtitle={`${unit.buildingName} · ${unit.clientName}`}
        backHref="/scheduler/units"
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-6">
        {/* Status + flags */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3"
        >
          <div className="flex items-center gap-2">
            <StatusChip status={effectiveStatus} />
          </div>
          {flags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {flags.map((f) => <FlagBadge key={f} flag={f} />)}
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
        >
          <CompleteByHighlightCard completeByDate={unit.completeByDate} />
        </motion.div>

        {/* Key dates */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.06, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-4"
        >
          <div className="flex items-center justify-between mb-3">
            <SectionLabel>Key Dates</SectionLabel>
            <Link
              href={`/scheduler/units/${id}/dates`}
              className="flex items-center gap-1 text-[12px] font-semibold text-accent"
            >
              <PencilSimple size={13} />
              Edit dates
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {milestoneField("Measurement", unit.measurementDate, milestones.allMeasured, milestones.measuredCompletedAt)}
            {milestoneField("Bracketing", unit.bracketingDate, milestones.allBracketed, milestones.bracketedCompletedAt)}
            {milestoneField("Installation", unit.installationDate, milestones.allInstalled, milestones.installedCompletedAt)}
          </div>
        </motion.div>

        {/* Installer */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="surface-card p-4"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-[var(--radius-md)] bg-surface border border-border flex items-center justify-center">
                <UserCircle size={22} className="text-tertiary" />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {unit.assignedInstallerName ?? "Unassigned"}
                </p>
                <p className="text-[11px] text-tertiary">Installer</p>
              </div>
            </div>
            <Link
              href={`/scheduler/units/${id}/assign`}
              className="flex items-center gap-1 text-[12px] font-semibold text-accent"
            >
              <PencilSimple size={13} />
              Assign installer
            </Link>
          </div>
        </motion.div>

        {/* Rooms overview */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <SectionLabel>Rooms & Windows</SectionLabel>
            <div className="flex items-center gap-1 text-[11px] text-muted font-mono">
              <CalendarBlank size={11} />
              {rooms.reduce((s, r) => s + r.completedWindows, 0)}/
              {rooms.reduce((s, r) => s + r.windowCount, 0)} measured
            </div>
          </div>
          {rooms.length === 0 ? (
            <div className="surface-card px-4 py-6 text-center text-[13px] text-muted">
              No rooms added yet
            </div>
          ) : (
            rooms.map((room, i) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 + i * 0.04, duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <Link
                  href={`/scheduler/units/${id}/rooms/${room.id}`}
                  className="bg-accent text-white px-4 py-3 rounded-[12px] shadow-sm flex items-center justify-between active:scale-[0.98] hover:opacity-90 transition-all"
                >
                  <div>
                    <p className="text-[13px] font-semibold">{room.name}</p>
                    <p className="text-[11px] text-white/80 font-mono">
                      {room.completedWindows}/{room.windowCount} measured
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 bg-white/20 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full"
                        style={{
                          width: room.windowCount > 0
                            ? `${(room.completedWindows / room.windowCount) * 100}%`
                            : "0%",
                        }}
                      />
                    </div>
                    <ArrowRight size={13} />
                  </div>
                </Link>
              </motion.div>
            ))
          )}
        </motion.div>

        {/* Actions for Scheduler as Installer */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="flex flex-col gap-3 pt-2 pb-4"
        >
          <Link href={`/scheduler/units/${unit.id}/rooms`}>
            <Button fullWidth size="lg">
              Manage rooms
            </Button>
          </Link>
          <Link href={`/scheduler/units/${unit.id}/status`}>
            <Button variant="secondary" fullWidth size="lg">
              View Progress
            </Button>
          </Link>
          <Link href={`/scheduler/units/${unit.id}/summary`}>
            <Button variant="secondary" fullWidth size="lg">
              View Summary
            </Button>
          </Link>
        </motion.div>

        {/* Activity log */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
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
