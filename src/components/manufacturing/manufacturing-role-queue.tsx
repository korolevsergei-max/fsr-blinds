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
    task: () => Promise<{ ok: boolean; error?: string; needsConfirmation?: boolean; targetDate?: string }>
  ) => {
    setBusyWindowId(windowId);
    startTransition(async () => {
      const result = await task();
      if (!result.ok && result.needsConfirmation && result.targetDate) {
        const confirmed = window.confirm(
          `This move pushes work over capacity on ${result.targetDate}. Do you want to continue?`
        );
        if (!confirmed) {
          setBusyWindowId(null);
          return;
        }
      } else if (!result.ok && result.error) {
        window.alert(result.error);
        setBusyWindowId(null);
        return;
      }
      router.refresh();
      setBusyWindowId(null);
    });
  };

  const title = role === "cutter" ? "Cutting Queue" : "Assembly Queue";
  const subtitle =
    role === "cutter"
      ? `Hi, ${userName ? userName.split(" ")[0] : "there"}`
      : `Hi, ${userName ? userName.split(" ")[0] : "there"}`;

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
          <h1 className="text-lg font-semibold text-primary">{title}</h1>
          <p className="text-xs text-tertiary">{subtitle}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <SummaryCard label="Today" value={schedule.todayCount} tone="emerald" />
        <SummaryCard label="Next Day" value={schedule.tomorrowCount} tone="blue" />
        <SummaryCard label="Issues" value={schedule.issueCount} tone="amber" />
        <SummaryCard label="Unscheduled" value={schedule.unscheduledCount} tone="zinc" />
      </div>

      {schedule.buckets.map((bucket) => (
        <section key={`${bucket.label}-${bucket.date ?? "special"}`} className="rounded-2xl border border-border bg-card p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">{bucket.label}</p>
              {bucket.date && (
                <p className="mt-1 text-xs text-tertiary">{bucket.date}</p>
              )}
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">
                {bucket.scheduledCount}/{bucket.capacity}
              </p>
              {bucket.isOverCapacity ? (
                <p className="text-xs font-medium text-amber-600">Over capacity</p>
              ) : (
                <p className="text-xs text-tertiary">Scheduled</p>
              )}
            </div>
          </div>

          {bucket.units.length === 0 ? (
            <p className="text-sm text-tertiary">Nothing queued here.</p>
          ) : (
            <div className="space-y-3">
              {bucket.units.map((unit) => (
                <div key={`${bucket.label}-${unit.unitId}`} className="rounded-2xl border border-border bg-surface p-3">
                  <button
                    onClick={() =>
                      router.push(`/${role}/units/${unit.unitId}`)
                    }
                    className="w-full text-left"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-foreground">
                          Unit {unit.unitNumber}
                        </p>
                        <p className="mt-1 text-xs text-tertiary">
                          {unit.buildingName} · {unit.clientName}
                        </p>
                      </div>
                      <div className="text-right text-xs text-tertiary">
                        <p>{unit.scheduledCount} blind{unit.scheduledCount === 1 ? "" : "s"}</p>
                        {unit.installationDate && <p>Install {unit.installationDate}</p>}
                      </div>
                    </div>
                  </button>

                  <div className="mt-3 space-y-3">
                    {unit.blindTypeGroups.map((group) => (
                      <div key={`${unit.unitId}-${group.blindType}`} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-secondary">
                            {group.blindType}
                          </span>
                          <span className="text-xs text-tertiary">{group.windows.length}</span>
                        </div>

                        <div className="mt-2 space-y-2">
                          {group.windows.map((item) => {
                            const busy = isPending && busyWindowId === item.windowId;
                            return (
                              <div key={item.windowId} className="rounded-xl border border-border bg-white p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-sm font-semibold text-foreground">{item.label}</p>
                                    <p className="mt-1 text-xs text-tertiary">{item.roomName}</p>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-base font-bold tracking-tight text-foreground">
                                      {formatMeasurement(item)}
                                    </p>
                                    {item.targetReadyDate && (
                                      <p className="mt-1 text-[11px] text-tertiary">
                                        Ready by {item.targetReadyDate}
                                      </p>
                                    )}
                                  </div>
                                </div>

                                {item.notes && (
                                  <p className="mt-2 text-xs text-secondary">{item.notes}</p>
                                )}
                                {item.issueStatus === "open" && (
                                  <p className="mt-2 flex items-center gap-1 text-xs font-medium text-amber-700">
                                    <WarningCircle size={13} weight="fill" />
                                    {item.issueReason || "Issue open"}
                                  </p>
                                )}

                                <div className="mt-3 flex flex-wrap gap-2">
                                  {item.issueStatus === "open" ? (
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        runWindowAction(item.windowId, () =>
                                          resolveWindowManufacturingIssue(item.windowId)
                                        )
                                      }
                                      className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50"
                                    >
                                      Resolve Issue
                                    </button>
                                  ) : role === "cutter" ? (
                                    <>
                                      <button
                                        disabled={busy}
                                        onClick={() =>
                                          runWindowAction(item.windowId, () =>
                                            markWindowCut(item.windowId)
                                          )
                                        }
                                        className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                      >
                                        Mark Cut
                                      </button>
                                      <button
                                        disabled={busy}
                                        onClick={() =>
                                          runWindowAction(item.windowId, async () => {
                                            const reason = globalThis.window.prompt("Why are you opening an issue?");
                                            if (!reason) return { ok: false, error: "Issue reason is required." };
                                            return markWindowManufacturingIssue(item.windowId, reason);
                                          })
                                        }
                                        className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50"
                                      >
                                        Issue
                                      </button>
                                      <MoveButtons
                                        busy={busy}
                                        onMove={(direction) =>
                                          runWindowAction(item.windowId, async () => {
                                            const reason = globalThis.window.prompt(
                                              direction === "earlier"
                                                ? "Why are you moving this earlier?"
                                                : "Why are you moving this later?"
                                            );
                                            if (!reason) {
                                              return { ok: false, error: "A reason is required." };
                                            }
                                            const first = await shiftWindowManufacturingSchedule(
                                              item.windowId,
                                              "cutter",
                                              direction,
                                              reason
                                            );
                                            if (!first.ok && first.needsConfirmation) {
                                              const confirmed = globalThis.window.confirm(
                                                `This move exceeds capacity on ${first.targetDate}. Continue?`
                                              );
                                              if (!confirmed) return first;
                                              return shiftWindowManufacturingSchedule(
                                                item.windowId,
                                                "cutter",
                                                direction,
                                                reason,
                                                true
                                              );
                                            }
                                            return first;
                                          })
                                        }
                                      />
                                    </>
                                  ) : (
                                    <>
                                      {item.productionStatus === "assembled" ? (
                                        <button
                                          disabled={busy}
                                          onClick={() =>
                                            runWindowAction(item.windowId, () =>
                                              markWindowQCApproved(item.windowId)
                                            )
                                          }
                                          className="rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                        >
                                          Approve QC
                                        </button>
                                      ) : item.productionStatus === "cut" ? (
                                        <button
                                          disabled={busy}
                                          onClick={() =>
                                            runWindowAction(item.windowId, () =>
                                              markWindowAssembled(item.windowId)
                                            )
                                          }
                                          className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                                        >
                                          Mark Assembled
                                        </button>
                                      ) : (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-600">
                                          Awaiting cut
                                        </span>
                                      )}
                                      <button
                                        disabled={busy}
                                        onClick={() =>
                                          runWindowAction(item.windowId, async () => {
                                            const reason = globalThis.window.prompt("Why are you opening an issue?");
                                            if (!reason) return { ok: false, error: "Issue reason is required." };
                                            return markWindowManufacturingIssue(item.windowId, reason);
                                          })
                                        }
                                        className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-colors hover:bg-amber-200 disabled:opacity-50"
                                      >
                                        Issue
                                      </button>
                                      <MoveButtons
                                        busy={busy}
                                        onMove={(direction) =>
                                          runWindowAction(item.windowId, async () => {
                                            const reason = globalThis.window.prompt(
                                              direction === "earlier"
                                                ? "Why are you moving this earlier?"
                                                : "Why are you moving this later?"
                                            );
                                            if (!reason) {
                                              return { ok: false, error: "A reason is required." };
                                            }
                                            const first = await shiftWindowManufacturingSchedule(
                                              item.windowId,
                                              "assembler",
                                              direction,
                                              reason
                                            );
                                            if (!first.ok && first.needsConfirmation) {
                                              const confirmed = globalThis.window.confirm(
                                                `This move exceeds capacity on ${first.targetDate}. Continue?`
                                              );
                                              if (!confirmed) return first;
                                              return shiftWindowManufacturingSchedule(
                                                item.windowId,
                                                "assembler",
                                                direction,
                                                reason,
                                                true
                                              );
                                            }
                                            return first;
                                          })
                                        }
                                      />
                                    </>
                                  )}

                                  {role === "cutter" && item.productionStatus === "pending" ? null : role === "cutter" ? (
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        runWindowAction(item.windowId, () =>
                                          undoWindowCut(item.windowId)
                                        )
                                      }
                                      className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-surface disabled:opacity-50"
                                    >
                                      Undo Cut
                                    </button>
                                  ) : item.productionStatus === "assembled" ? (
                                    <button
                                      disabled={busy}
                                      onClick={() =>
                                        runWindowAction(item.windowId, () =>
                                          undoWindowAssembly(item.windowId)
                                        )
                                      }
                                      className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-surface disabled:opacity-50"
                                    >
                                      Undo Assembly
                                    </button>
                                  ) : null}
                                </div>
                              </div>
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
  );
}

function MoveButtons({
  busy,
  onMove,
}: {
  busy: boolean;
  onMove: (direction: "earlier" | "later") => void;
}) {
  return (
    <>
      <button
        disabled={busy}
        onClick={() => onMove("earlier")}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-surface disabled:opacity-50"
      >
        Move Earlier
      </button>
      <button
        disabled={busy}
        onClick={() => onMove("later")}
        className="rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-secondary transition-colors hover:bg-surface disabled:opacity-50"
      >
        Move Later
      </button>
    </>
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
  const Icon = tone === "emerald" ? CheckCircle : tone === "blue" ? CalendarBlank : tone === "amber" ? WarningCircle : Factory;
  const classes = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
    amber: "border-amber-200 bg-amber-50 text-amber-700",
    zinc: "border-border bg-card text-zinc-700",
  };

  return (
    <div className={`rounded-2xl border px-3 py-3 ${classes[tone]}`}>
      <div className="flex items-center gap-2">
        <Icon size={16} weight="fill" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  );
}
