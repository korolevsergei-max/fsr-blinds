"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
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
  undoWindowQC,
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

type QueueActionResult = {
  ok: boolean;
  error?: string;
  needsConfirmation?: boolean;
  targetDate?: string;
};

function getWindowPriority(
  role: "cutter" | "assembler",
  item: ManufacturingWindowItem
) {
  if (item.issueStatus === "open") return 0;
  if (role === "cutter") {
    return item.productionStatus === "pending" ? 1 : 2;
  }
  if (item.productionStatus === "cut") return 1;
  if (item.productionStatus === "assembled") return 2;
  return 3;
}

function countActionReadyWindows(
  role: "cutter" | "assembler",
  windows: ManufacturingWindowItem[]
) {
  return windows.filter((item) => getWindowPriority(role, item) < 3).length;
}

function sortWindows(
  role: "cutter" | "assembler",
  windows: ManufacturingWindowItem[]
) {
  return [...windows].sort((a, b) => {
    const priorityDiff = getWindowPriority(role, a) - getWindowPriority(role, b);
    if (priorityDiff !== 0) return priorityDiff;

    const readyDateA = a.targetReadyDate ?? "9999-12-31";
    const readyDateB = b.targetReadyDate ?? "9999-12-31";
    if (readyDateA !== readyDateB) return readyDateA.localeCompare(readyDateB);

    if (a.roomName !== b.roomName) return a.roomName.localeCompare(b.roomName);
    return a.label.localeCompare(b.label);
  });
}

function normalizeSchedule(
  schedule: ManufacturingRoleSchedule,
  role: "cutter" | "assembler"
): ManufacturingRoleSchedule {
  return {
    ...schedule,
    buckets: schedule.buckets.map((bucket) => ({
      ...bucket,
      units: [...bucket.units]
        .map((unit) => ({
          ...unit,
          blindTypeGroups: [...unit.blindTypeGroups]
            .map((group) => ({
              ...group,
              windows: sortWindows(role, group.windows),
            }))
            .sort((a, b) => {
              const aReady = countActionReadyWindows(role, a.windows);
              const bReady = countActionReadyWindows(role, b.windows);
              if (aReady !== bReady) return bReady - aReady;

              const aPriority = Math.min(...a.windows.map((window) => getWindowPriority(role, window)));
              const bPriority = Math.min(...b.windows.map((window) => getWindowPriority(role, window)));
              if (aPriority !== bPriority) return aPriority - bPriority;

              return a.blindType.localeCompare(b.blindType);
            }),
        }))
        .sort((a, b) => {
          const aWindows = a.blindTypeGroups.flatMap((group) => group.windows);
          const bWindows = b.blindTypeGroups.flatMap((group) => group.windows);
          const aPriority = Math.min(...aWindows.map((window) => getWindowPriority(role, window)));
          const bPriority = Math.min(...bWindows.map((window) => getWindowPriority(role, window)));
          if (aPriority !== bPriority) return aPriority - bPriority;

          const aReady = countActionReadyWindows(role, aWindows);
          const bReady = countActionReadyWindows(role, bWindows);
          if (aReady !== bReady) return bReady - aReady;

          return a.unitNumber.localeCompare(b.unitNumber);
        }),
    })),
  };
}

function updateWindowInSchedule(
  schedule: ManufacturingRoleSchedule,
  role: "cutter" | "assembler",
  windowId: string,
  updater: (item: ManufacturingWindowItem) => ManufacturingWindowItem
) {
  const nextSchedule: ManufacturingRoleSchedule = {
    ...schedule,
    buckets: schedule.buckets.map((bucket) => ({
      ...bucket,
      units: bucket.units.map((unit) => ({
        ...unit,
        blindTypeGroups: unit.blindTypeGroups.map((group) => ({
          ...group,
          windows: group.windows.map((item) => (item.windowId === windowId ? updater(item) : item)),
        })),
      })),
    })),
  };

  return normalizeSchedule(nextSchedule, role);
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
  const [localSchedule, setLocalSchedule] = useState(() => normalizeSchedule(schedule, role));

  useEffect(() => {
    setLocalSchedule(normalizeSchedule(schedule, role));
  }, [role, schedule]);

  const runWindowAction = (
    windowId: string,
    task: () => Promise<QueueActionResult>,
    options?: {
      optimisticUpdate?: (current: ManufacturingRoleSchedule) => ManufacturingRoleSchedule;
      refreshOnSuccess?: boolean;
    }
  ) => {
    const previousSchedule = localSchedule;
    if (options?.optimisticUpdate) {
      setLocalSchedule((current) => options.optimisticUpdate?.(current) ?? current);
    }

    setBusyWindowId(windowId);
    startTransition(async () => {
      const result = await task();
      if (!result.ok && result.error) {
        if (options?.optimisticUpdate) {
          setLocalSchedule(previousSchedule);
        }
        globalThis.window.alert(result.error);
        setBusyWindowId(null);
        return;
      }

      if (!result.ok) {
        if (options?.optimisticUpdate) {
          setLocalSchedule(previousSchedule);
        }
        setBusyWindowId(null);
        return;
      }

      if (options?.refreshOnSuccess) {
        router.refresh();
      }

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
    }, { refreshOnSuccess: true });
  };

  const handleOpenIssue = (item: ManufacturingWindowItem) => {
    const reason = globalThis.window.prompt("Why are you opening an issue?");
    if (!reason) return;

    runWindowAction(item.windowId, () => markWindowManufacturingIssue(item.windowId, reason), {
      optimisticUpdate: (current) =>
        updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
          ...currentItem,
          issueStatus: "open",
          issueReason: reason,
        })),
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
        <SummaryCard label="Today" value={localSchedule.todayCount} tone="emerald" />
        <SummaryCard label="Next day" value={localSchedule.tomorrowCount} tone="blue" />
        <SummaryCard label="Issues" value={localSchedule.issueCount} tone="amber" />
        <SummaryCard label="Unscheduled" value={localSchedule.unscheduledCount} tone="zinc" />
      </div>

      <div className="space-y-4">
        {localSchedule.buckets.map((bucket) => (
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
                                            , {
                                              optimisticUpdate: (current) =>
                                                updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
                                                  ...currentItem,
                                                  issueStatus: "resolved",
                                                })),
                                            })
                                          }
                                        />
                                      ) : role === "cutter" ? (
                                        item.productionStatus === "pending" ? (
                                          <>
                                            <ActionButton
                                              label="Mark cut"
                                              tone="primary"
                                              busy={busy}
                                              onClick={() =>
                                                runWindowAction(item.windowId, () =>
                                                  markWindowCut(item.windowId)
                                                , {
                                                  optimisticUpdate: (current) =>
                                                    updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
                                                      ...currentItem,
                                                      productionStatus: "cut",
                                                    })),
                                                })
                                              }
                                            />
                                            <ActionButton
                                              label="Issue"
                                              tone="warning"
                                              busy={busy}
                                              onClick={() => handleOpenIssue(item)}
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
                                            <StatusChip
                                              label="Cut complete"
                                              tone="success"
                                              icon={<CheckCircle size={13} weight="fill" />}
                                            />
                                            <ActionButton
                                              label="Issue"
                                              tone="secondary"
                                              busy={false}
                                              disabled
                                              onClick={() => undefined}
                                            />
                                            <ActionButton
                                              label="Move earlier"
                                              tone="secondary"
                                              busy={false}
                                              disabled
                                              onClick={() => undefined}
                                            />
                                            <ActionButton
                                              label="Move later"
                                              tone="secondary"
                                              busy={false}
                                              disabled
                                              onClick={() => undefined}
                                            />
                                          </>
                                        )
                                      ) : (
                                        <>
                                          {item.productionStatus === "qc_approved" ? (
                                            <StatusChip
                                              label="QC approved"
                                              tone="success"
                                              icon={<CheckCircle size={13} weight="fill" />}
                                            />
                                          ) : item.productionStatus === "assembled" ? (
                                            <ActionButton
                                              label="Approve QC"
                                              tone="success"
                                              busy={busy}
                                              onClick={() =>
                                                runWindowAction(item.windowId, () =>
                                                  markWindowQCApproved(item.windowId)
                                                , {
                                                  optimisticUpdate: (current) =>
                                                    updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
                                                      ...currentItem,
                                                      productionStatus: "qc_approved",
                                                    })),
                                                })
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
                                                , {
                                                  optimisticUpdate: (current) =>
                                                    updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
                                                      ...currentItem,
                                                      productionStatus: "assembled",
                                                    })),
                                                })
                                              }
                                            />
                                          ) : (
                                            <StatusChip label="Awaiting cut" tone="muted" />
                                          )}
                                          <ActionButton
                                            label="Issue"
                                            tone="warning"
                                            busy={item.productionStatus === "qc_approved" ? false : busy}
                                            disabled={item.productionStatus === "qc_approved"}
                                            onClick={() => handleOpenIssue(item)}
                                          />
                                          <ActionButton
                                            label="Move earlier"
                                            tone="secondary"
                                            busy={item.productionStatus === "qc_approved" ? false : busy}
                                            disabled={item.productionStatus === "qc_approved"}
                                            onClick={() => handleMove(item, "earlier")}
                                          />
                                          <ActionButton
                                            label="Move later"
                                            tone="secondary"
                                            busy={item.productionStatus === "qc_approved" ? false : busy}
                                            disabled={item.productionStatus === "qc_approved"}
                                            onClick={() => handleMove(item, "later")}
                                          />
                                        </>
                                      )}

                                      {role === "cutter" && item.productionStatus === "cut" && (
                                        <ActionButton
                                          label="Undo cut"
                                          tone="ghost"
                                          busy={busy}
                                          onClick={() =>
                                            runWindowAction(item.windowId, () =>
                                              undoWindowCut(item.windowId)
                                            , {
                                              optimisticUpdate: (current) =>
                                                updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
                                                  ...currentItem,
                                                  productionStatus: "pending",
                                                })),
                                            })
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
                                            , {
                                              optimisticUpdate: (current) =>
                                                updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
                                                  ...currentItem,
                                                  productionStatus: "cut",
                                                })),
                                            })
                                          }
                                        />
                                      )}

                                      {role === "assembler" && item.productionStatus === "qc_approved" && (
                                        <ActionButton
                                          label="Undo QC"
                                          tone="ghost"
                                          busy={busy}
                                          onClick={() =>
                                            runWindowAction(item.windowId, () =>
                                              undoWindowQC(item.windowId)
                                            , {
                                              optimisticUpdate: (current) =>
                                                updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
                                                  ...currentItem,
                                                  productionStatus: "assembled",
                                                })),
                                            })
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
  disabled = false,
  onClick,
}: {
  label: string;
  tone: "primary" | "secondary" | "warning" | "success" | "ghost";
  busy: boolean;
  disabled?: boolean;
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
      disabled={busy || disabled}
      onClick={onClick}
      className={[
        "rounded-full border px-3 py-2 text-[12px] font-semibold transition-all",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none",
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
  icon,
}: {
  label: string;
  tone: "muted" | "success";
  icon?: ReactNode;
}) {
  const toneClasses = {
    muted: "bg-zinc-100 text-zinc-600",
    success: "bg-emerald-50 text-emerald-700",
  };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold ${toneClasses[tone]}`}>
      {icon}
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
