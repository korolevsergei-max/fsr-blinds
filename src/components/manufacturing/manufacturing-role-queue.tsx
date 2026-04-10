"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarBlank,
  CheckCircle,
  Factory,
  WarningCircle,
} from "@phosphor-icons/react";
import type {
  ManufacturingRoleSchedule,
  ManufacturingWindowItem,
} from "@/lib/manufacturing-scheduler";
import { formatStoredDateLongEnglish } from "@/lib/created-date";
import {
  markWindowManufacturingIssue,
  resolveWindowManufacturingIssue,
  shiftWindowManufacturingSchedule,
  undoWindowAssembly,
  undoWindowCut,
} from "@/app/actions/manufacturing-actions";
import {
  markWindowAssembled,
  markWindowCut,
  markWindowQCApproved,
} from "@/app/actions/production-actions";

function formatMeasurement(item: ManufacturingWindowItem): string {
  const width = item.blindWidth ?? item.width;
  const height = item.blindHeight ?? item.height;
  const depth = item.blindDepth ?? item.depth;
  return `${width ?? "—"} × ${height ?? "—"}${depth != null ? ` × ${depth}` : ""}`;
}

function formatBucketDate(date: string | null) {
  return formatStoredDateLongEnglish(date) ?? date ?? "";
}

function formatInstallDate(date: string | null) {
  const label = formatStoredDateLongEnglish(date);
  return label ? `Install ${label}` : null;
}

function formatReadyDate(date: string | null) {
  const label = formatStoredDateLongEnglish(date);
  return label ? `Ready by ${label}` : null;
}

export function ManufacturingRoleQueue({
  role,
  schedule,
  userName,
}: {
  role: "cutter" | "assembler";
  schedule: ManufacturingRoleSchedule;
  userName?: string;
}) {
  const router = useRouter();
  const [busyWindowId, setBusyWindowId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const runWindowAction = (
    windowId: string,
    task: () => Promise<{ ok: boolean; error?: string }>
  ) => {
    setBusyWindowId(windowId);
    startTransition(async () => {
      const result = await task();
      if (!result.ok && result.error) {
        globalThis.window.alert(result.error);
        setBusyWindowId(null);
        return;
      }
      router.refresh();
      setBusyWindowId(null);
    });
  };

  const handleMove = (
    item: ManufacturingWindowItem,
    direction: "earlier" | "later"
  ) => {
    runWindowAction(item.windowId, async () => {
      const reason = globalThis.window.prompt(
        direction === "earlier"
          ? "Why are you moving this earlier?"
          : "Why are you moving this later?"
      );
      if (!reason) return { ok: false, error: "A reason is required." };

      const firstAttempt = await shiftWindowManufacturingSchedule(
        item.windowId,
        role,
        direction,
        reason
      );
      if (!firstAttempt.ok && firstAttempt.needsConfirmation) {
        const targetDate = formatStoredDateLongEnglish(firstAttempt.targetDate) ?? firstAttempt.targetDate;
        const confirmed = globalThis.window.confirm(
          `This move exceeds capacity on ${targetDate}. Continue anyway?`
        );
        if (!confirmed) return { ok: false, error: "" };
        return shiftWindowManufacturingSchedule(
          item.windowId,
          role,
          direction,
          reason,
          true
        );
      }
      return firstAttempt;
    });
  };

  const title = role === "cutter" ? "Cutting queue" : "Assembly queue";

  return (
    <div className="px-4 pt-4 pb-6 space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-secondary transition-colors hover:bg-surface"
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-[17px] font-semibold tracking-tight text-foreground sm:text-[18px]">{title}</h1>
          <p className="mt-0.5 text-[12px] text-tertiary sm:text-[13px]">
            {userName ? `Hi, ${userName.split(" ")[0]}` : "Manufacturing"}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SummaryCard label="Today" value={schedule.todayCount} tone="emerald" />
        <SummaryCard label="Next day" value={schedule.tomorrowCount} tone="blue" />
        <SummaryCard label="Issues" value={schedule.issueCount} tone="amber" />
        <SummaryCard label="Unscheduled" value={schedule.unscheduledCount} tone="zinc" />
      </div>

      <div className="space-y-4">
        {schedule.buckets.map((bucket) => (
          <section
            key={`${bucket.label}-${bucket.date ?? "special"}`}
            className="overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_18px_54px_rgba(15,23,42,0.05)]"
          >
            <div className="border-b border-border/70 bg-[linear-gradient(180deg,rgba(250,250,249,0.98),rgba(244,244,243,0.92))] px-4 py-3.5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tertiary">
                    {bucket.date && bucket.label === bucket.date ? "Work day" : bucket.label}
                  </p>
                  <p className="mt-1 text-[17px] font-semibold leading-snug tracking-tight text-foreground sm:text-[18px]">
                    {formatBucketDate(bucket.date) || bucket.label}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[1.2rem] font-semibold tracking-[-0.04em] text-foreground sm:text-[1.3rem]">
                    {bucket.scheduledCount}/{bucket.capacity}
                  </p>
                  <p className={`mt-1 text-[11px] ${bucket.isOverCapacity ? "font-semibold text-amber-700" : "text-tertiary"}`}>
                    {bucket.isOverCapacity ? "Over capacity" : "Scheduled"}
                  </p>
                </div>
              </div>
            </div>

            {bucket.units.length === 0 ? (
              <p className="px-4 py-5 text-[14px] text-tertiary">Nothing queued here.</p>
            ) : (
              <div className="space-y-4 bg-surface/35 px-4 py-4">
                {bucket.units.map((unit) => (
                  <div
                    key={`${bucket.label}-${unit.unitId}`}
                    className="overflow-hidden rounded-[22px] border border-border bg-white shadow-[0_10px_26px_rgba(15,23,42,0.04)]"
                  >
                    <button
                      onClick={() => router.push(`/${role}/units/${unit.unitId}`)}
                      className="w-full border-b border-border/70 px-4 py-4 text-left"
                    >
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                        <div>
                          <p className="text-[15px] font-semibold tracking-tight text-foreground sm:text-[15px]">
                            Unit {unit.unitNumber}
                          </p>
                          <p className="mt-1 text-[12px] text-secondary sm:text-[12px]">
                            {unit.buildingName} · {unit.clientName}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-tertiary sm:justify-end sm:text-[12px]">
                          <span>{unit.scheduledCount} blinds</span>
                          {unit.installationDate && <span>{formatInstallDate(unit.installationDate)}</span>}
                        </div>
                      </div>
                    </button>

                    <div className="space-y-5 px-4 py-4">
                      {unit.blindTypeGroups.map((group) => (
                        <div key={`${unit.unitId}-${group.blindType}`}>
                          <div className="flex items-center gap-3 border-b border-border/70 pb-2">
                            <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
                              {group.blindType}
                            </span>
                            <span className="text-[12px] text-tertiary">
                              {group.windows.length} scheduled
                            </span>
                          </div>

                          <div className="divide-y divide-border/60">
                            {group.windows.map((item) => {
                              const busy = isPending && busyWindowId === item.windowId;
                              return (
                                <article
                                  key={item.windowId}
                                  className="grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                                      <h3 className="text-[15px] font-semibold tracking-tight text-foreground sm:text-[15px]">
                                        {item.label}
                                      </h3>
                                      <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-medium text-secondary">
                                        {item.roomName}
                                      </span>
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-tertiary">
                                      <span>{formatReadyDate(item.targetReadyDate)}</span>
                                      {item.issueStatus === "open" && (
                                        <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                                          <WarningCircle size={13} weight="fill" />
                                          {item.issueReason || "Issue open"}
                                        </span>
                                      )}
                                    </div>

                                    {item.notes && (
                                      <p className="mt-2 max-w-[65ch] text-[12px] leading-6 text-secondary">
                                        {item.notes}
                                      </p>
                                    )}

                                    <div className="mt-4 flex flex-wrap gap-2.5">
                                      {item.issueStatus === "open" ? (
                                        <ActionButton
                                          label="Resolve issue"
                                          tone="warning"
                                          busy={busy}
                                          onClick={() =>
                                            runWindowAction(item.windowId, () =>
                                              resolveWindowManufacturingIssue(item.windowId)
                                            )
                                          }
                                        />
                                      ) : role === "cutter" ? (
                                        <>
                                          <ActionButton
                                            label="Mark cut"
                                            tone="primary"
                                            busy={busy}
                                            onClick={() =>
                                              runWindowAction(item.windowId, () =>
                                                markWindowCut(item.windowId)
                                              )
                                            }
                                          />
                                          <ActionButton
                                            label="Issue"
                                            tone="warning"
                                            busy={busy}
                                            onClick={() =>
                                              runWindowAction(item.windowId, async () => {
                                                const reason = globalThis.window.prompt("Why are you opening an issue?");
                                                if (!reason) return { ok: false, error: "Issue reason is required." };
                                                return markWindowManufacturingIssue(item.windowId, reason);
                                              })
                                            }
                                          />
                                          <ActionButton
                                            label="Move earlier"
                                            tone="secondary"
                                            busy={busy}
                                            onClick={() => handleMove(item, "earlier")}
                                          />
                                          <ActionButton
                                            label="Move later"
                                            tone="secondary"
                                            busy={busy}
                                            onClick={() => handleMove(item, "later")}
                                          />
                                        </>
                                      ) : (
                                        <>
                                          {item.productionStatus === "assembled" ? (
                                            <ActionButton
                                              label="Approve QC"
                                              tone="success"
                                              busy={busy}
                                              onClick={() =>
                                                runWindowAction(item.windowId, () =>
                                                  markWindowQCApproved(item.windowId)
                                                )
                                              }
                                            />
                                          ) : item.productionStatus === "cut" ? (
                                            <ActionButton
                                              label="Mark assembled"
                                              tone="primary"
                                              busy={busy}
                                              onClick={() =>
                                                runWindowAction(item.windowId, () =>
                                                  markWindowAssembled(item.windowId)
                                                )
                                              }
                                            />
                                          ) : (
                                            <StatusChip label="Awaiting cut" tone="muted" />
                                          )}
                                          <ActionButton
                                            label="Issue"
                                            tone="warning"
                                            busy={busy}
                                            onClick={() =>
                                              runWindowAction(item.windowId, async () => {
                                                const reason = globalThis.window.prompt("Why are you opening an issue?");
                                                if (!reason) return { ok: false, error: "Issue reason is required." };
                                                return markWindowManufacturingIssue(item.windowId, reason);
                                              })
                                            }
                                          />
                                          <ActionButton
                                            label="Move earlier"
                                            tone="secondary"
                                            busy={busy}
                                            onClick={() => handleMove(item, "earlier")}
                                          />
                                          <ActionButton
                                            label="Move later"
                                            tone="secondary"
                                            busy={busy}
                                            onClick={() => handleMove(item, "later")}
                                          />
                                        </>
                                      )}

                                      {role === "cutter" && item.productionStatus !== "pending" && (
                                        <ActionButton
                                          label="Undo cut"
                                          tone="ghost"
                                          busy={busy}
                                          onClick={() =>
                                            runWindowAction(item.windowId, () =>
                                              undoWindowCut(item.windowId)
                                            )
                                          }
                                        />
                                      )}

                                      {role === "assembler" && item.productionStatus === "assembled" && (
                                        <ActionButton
                                          label="Undo assembly"
                                          tone="ghost"
                                          busy={busy}
                                          onClick={() =>
                                            runWindowAction(item.windowId, () =>
                                              undoWindowAssembly(item.windowId)
                                            )
                                          }
                                        />
                                      )}
                                    </div>
                                  </div>

                                  <div className="md:min-w-[9rem] md:text-right">
                                    <p className="font-mono text-[15px] font-semibold leading-none tracking-tight text-foreground sm:text-[15px] md:text-[16px]">
                                      {formatMeasurement(item)}
                                    </p>
                                  </div>
                                </article>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function ActionButton({
  label,
  tone,
  busy,
  onClick,
}: {
  label: string;
  tone: "primary" | "secondary" | "warning" | "success" | "ghost";
  busy: boolean;
  onClick: () => void;
}) {
  const toneClasses = {
    primary:
      "border-transparent bg-accent text-white hover:opacity-92",
    secondary:
      "border-border bg-card text-secondary hover:bg-surface",
    warning:
      "border-transparent bg-amber-100 text-amber-800 hover:bg-amber-200",
    success:
      "border-transparent bg-emerald-600 text-white hover:opacity-92",
    ghost:
      "border-border bg-white text-secondary hover:bg-surface",
  };

  return (
    <button
      disabled={busy}
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-2 text-[12px] font-semibold transition-all",
        "active:scale-[0.98] disabled:opacity-50",
        toneClasses[tone],
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function StatusChip({
  label,
  tone,
}: {
  label: string;
  tone: "muted";
}) {
  const toneClasses = {
    muted: "bg-zinc-100 text-zinc-600",
  };

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-2 text-[12px] font-semibold ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "emerald" | "blue" | "amber" | "zinc";
}) {
  const Icon =
    tone === "emerald"
      ? CheckCircle
      : tone === "blue"
      ? CalendarBlank
      : tone === "amber"
      ? WarningCircle
      : Factory;
  const classes = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    zinc: "border-border bg-card text-zinc-700",
  };

  return (
    <div className={`rounded-[22px] border px-3.5 py-3 ${classes[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} weight="fill" />
        <span className="text-[11px] font-medium uppercase tracking-[0.05em]">{label}</span>
      </div>
      <p className="mt-2 font-mono text-[1.45rem] font-bold tracking-[-0.04em]">{value}</p>
    </div>
  );
}
