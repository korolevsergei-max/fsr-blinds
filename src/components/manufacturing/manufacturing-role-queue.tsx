"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useCoalescedRefresh } from "@/hooks/use-coalesced-refresh";
import {
  ArrowLeft,
  CheckCircle,
  CircleNotch,
  FunnelSimple,
  MagnifyingGlass,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { useSessionStorage } from "@/hooks/use-session-storage";
import { matchesQueueSearch } from "@/lib/queue-search";
import type {
  ManufacturingRoleSchedule,
  ManufacturingWindowItem,
} from "@/lib/manufacturing-scheduler";
import { formatStoredDateLongEnglish } from "@/lib/created-date";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { getFloor } from "@/lib/app-dataset";
import {
  returnWindowToAssembler,
  returnWindowToCutter,
  undoWindowAssembly,
  undoWindowQC,
} from "@/app/actions/manufacturing-actions";
import {
  markWindowAssembled,
  markWindowQCApproved,
} from "@/app/actions/production-actions";
import { ManufacturingSummaryCard } from "@/components/windows/manufacturing-summary-card";
import { ReturnBlindDialog } from "@/components/manufacturing/return-blind-dialog";
import type { PushbackDirection } from "@/lib/pushback-reasons";

type DisplayLimit = "all" | "25" | "50" | "75" | "100";

function getManufacturingDueDate(item: Pick<ManufacturingWindowItem, "installationDate" | "completeByDate">) {
  return item.installationDate ?? item.completeByDate ?? null;
}

function formatDueDate(item: Pick<ManufacturingWindowItem, "installationDate" | "completeByDate">) {
  const date = getManufacturingDueDate(item);
  const label = formatStoredDateLongEnglish(date);
  if (!label) return null;
  return item.installationDate ? `Install ${label}` : `Complete by ${label}`;
}

function formatReadyDate(date: string | null) {
  const label = formatStoredDateLongEnglish(date);
  return label ? `Ready by ${label}` : null;
}

type QueueActionResult = {
  ok: boolean;
  error?: string;
};

function isReturnedToRole(
  item: ManufacturingWindowItem,
  role: "assembler" | "qc"
) {
  return item.issueStatus === "open" && item.escalation?.targetRole === role;
}

function getWindowPriority(
  role: "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  if (item.issueStatus === "open") return 0;
  if (role === "assembler") {
    return item.productionStatus === "cut" ? 1 : 2;
  }
  if (item.productionStatus === "assembled") return 1;
  return 3;
}

function sortFlatItems(
  items: ManufacturingWindowItem[],
  role: "assembler" | "qc"
): ManufacturingWindowItem[] {
  return [...items].sort((a, b) => {
    const pa = getWindowPriority(role, a);
    const pb = getWindowPriority(role, b);
    if (pa !== pb) return pa - pb;
    const aMeas = a.allMeasuredAt ?? null;
    const bMeas = b.allMeasuredAt ?? null;
    if (aMeas !== bMeas) {
      if (aMeas == null) return 1;
      if (bMeas == null) return -1;
      return aMeas.localeCompare(bMeas);
    }
    const buildingCmp = (a.buildingName ?? "").localeCompare(b.buildingName ?? "");
    if (buildingCmp !== 0) return buildingCmp;
    return String(a.unitNumber ?? "").localeCompare(
      String(b.unitNumber ?? ""),
      undefined,
      { numeric: true }
    );
  });
}

function flattenScheduleWindows(
  schedule: ManufacturingRoleSchedule
): ManufacturingWindowItem[] {
  return schedule.buckets.flatMap((b) =>
    b.units.flatMap((u) => u.blindTypeGroups.flatMap((g) => g.windows))
  );
}

function removeWindow(
  items: ManufacturingWindowItem[],
  windowId: string
): ManufacturingWindowItem[] {
  return items.filter((item) => item.windowId !== windowId);
}

function updateWindow(
  items: ManufacturingWindowItem[],
  windowId: string,
  updater: (item: ManufacturingWindowItem) => ManufacturingWindowItem
): ManufacturingWindowItem[] {
  return items.map((item) => (item.windowId === windowId ? updater(item) : item));
}

export function ManufacturingRoleQueue({
  role,
  schedule,
  userName,
}: {
  role: "assembler" | "qc";
  schedule: ManufacturingRoleSchedule;
  userName?: string;
}) {
  const router = useRouter();
  const scheduleRefresh = useCoalescedRefresh();
  const [busyWindowId, setBusyWindowId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [localItems, setLocalItems] = useState<ManufacturingWindowItem[]>(() =>
    flattenScheduleWindows(schedule)
  );
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = useState(188);
  const [search, setSearch] = useSessionStorage<string>(`${role}-queue-search`, "");
  const [buildingFilter, setBuildingFilter] = useState<string[]>([]);
  const [fabricTypeFilter, setFabricTypeFilter] = useState<string[]>([]);
  const [floorFilter, setFloorFilter] = useState<string[]>([]);
  const [displayLimit, setDisplayLimit] = useState<DisplayLimit>("all");
  const [pushbackTarget, setPushbackTarget] = useState<{
    item: ManufacturingWindowItem;
    direction: PushbackDirection;
  } | null>(null);

  // Re-sync to the server truth when a fresh schedule arrives (e.g. after
  // router.refresh()), discarding any optimistic local edits. Done during render
  // rather than in an effect to avoid a cascading re-render.
  const [syncedSchedule, setSyncedSchedule] = useState(schedule);
  if (syncedSchedule !== schedule) {
    setSyncedSchedule(schedule);
    setLocalItems(flattenScheduleWindows(schedule));
  }

  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    const id = setTimeout(() => router.refresh(), 400);
    return () => clearTimeout(id);
  }, [router, search, buildingFilter, floorFilter, fabricTypeFilter]);

  useEffect(() => {
    if (!errorMsg) return;
    const id = setTimeout(() => setErrorMsg(null), 5000);
    return () => clearTimeout(id);
  }, [errorMsg]);

  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const updateHeight = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      if (next > 0) setStickyTop(next);
    };
    updateHeight();
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    window.addEventListener("resize", updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  const runWindowAction = (
    windowId: string,
    task: () => Promise<QueueActionResult>,
    options?: {
      optimisticUpdate?: (current: ManufacturingWindowItem[]) => ManufacturingWindowItem[];
    }
  ) => {
    const previousItems = localItems;
    if (options?.optimisticUpdate) {
      setLocalItems((current) => options.optimisticUpdate?.(current) ?? current);
    }

    setBusyWindowId(windowId);
    startTransition(async () => {
      const result = await task();
      if (!result.ok) {
        if (options?.optimisticUpdate) {
          setLocalItems(previousItems);
        }
        if (result.error) setErrorMsg(result.error);
        setBusyWindowId(null);
        return;
      }
      setBusyWindowId(null);
      // Reconcile with server truth once the burst settles: a run of marks/undos/
      // pushbacks yields ONE coalesced refetch, which re-seeds localItems from the
      // fresh schedule (the syncedSchedule guard above). The optimistic update
      // already gave instant feedback. (B1 / roadmap Phase 2.)
      scheduleRefresh();
    });
  };

  const handleReturnToCutter = (item: ManufacturingWindowItem) => {
    const direction: PushbackDirection =
      role === "qc" ? "qc_to_cutter" : "assembler_to_cutter";
    setPushbackTarget({ item, direction });
  };

  const handleReturnToAssembler = (item: ManufacturingWindowItem) => {
    setPushbackTarget({ item, direction: "qc_to_assembler" });
  };

  const submitPushback = (reason: string, notes: string) => {
    const target = pushbackTarget;
    if (!target) return;
    const action =
      target.direction === "qc_to_assembler"
        ? () => returnWindowToAssembler(target.item.windowId, reason, notes)
        : () => returnWindowToCutter(target.item.windowId, reason, notes);
    // Optimistic: the returned window leaves this role's queue immediately and the
    // dialog closes; on failure runWindowAction restores it and shows the error.
    runWindowAction(target.item.windowId, action, {
      optimisticUpdate: (current) => removeWindow(current, target.item.windowId),
    });
    setPushbackTarget(null);
  };

  const title = role === "assembler" ? "Assembly queue" : "QC queue";

  const buildingOptions = useMemo(() => [
    { value: "all", label: "All buildings" },
    ...[
      ...new Map(
        localItems.map((item) => [
          item.buildingId,
          { value: item.buildingId, label: item.buildingName },
        ])
      ).values(),
    ],
  ], [localItems]);

  const floorOptions = useMemo(() => [
    { value: "all", label: "All floors" },
    ...[
      ...new Map(
        localItems.map((item) => {
          const f = getFloor(item.unitNumber);
          return [f, { value: f, label: `Floor ${f}` }];
        })
      ).values(),
    ].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true })),
  ], [localItems]);

  const fabricTypeOptions = [
    { value: "all", label: "All types" },
    { value: "screen", label: "Screen" },
    { value: "blackout", label: "Blackout" },
  ];

  const displayLimitOptions: { value: DisplayLimit; label: string }[] = [
    { value: "all", label: "No limit" },
    { value: "25", label: "25 units" },
    { value: "50", label: "50 units" },
    { value: "75", label: "75 units" },
    { value: "100", label: "100 units" },
  ];

  const activeFilterCount = [
    search.trim().length > 0,
    buildingFilter.length > 0,
    floorFilter.length > 0,
    fabricTypeFilter.length > 0,
    displayLimit !== "all",
  ].filter(Boolean).length;

  const filteredItems = useMemo(() => {
    const filtered = localItems.filter((item) => {
      if (buildingFilter.length > 0 && !buildingFilter.includes(item.buildingId)) return false;
      if (floorFilter.length > 0 && !floorFilter.includes(getFloor(item.unitNumber))) return false;
      if (fabricTypeFilter.length > 0 && !fabricTypeFilter.includes(item.blindType)) return false;
      if (!matchesQueueSearch(item, search)) return false;
      return true;
    });
    return sortFlatItems(filtered, role);
  }, [localItems, buildingFilter, floorFilter, fabricTypeFilter, search, role]);

  const maxVisibleItems = displayLimit === "all" ? Infinity : Number(displayLimit);
  const visibleItems = filteredItems.slice(0, maxVisibleItems);

  return (
    <div
      className="pb-6"
      style={{ ["--schedule-sticky-top" as string]: `${stickyTop}px` }}
    >
      <div
        ref={headerRef}
        className="sticky top-0 z-30 border-b border-border bg-card/95 px-4 pt-4 pb-4 backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-3">
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
        </div>

        <div className="mt-3 relative">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            inputMode="search"
            placeholder="Search unit, building, room, window — comma-separate for multi"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-9 rounded-xl border border-border bg-white text-[13px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center gap-1.5 flex-shrink-0 text-zinc-400">
            <FunnelSimple size={14} />
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </div>
          <FilterDropdown
            multiple
            label="Building"
            values={buildingFilter}
            options={buildingOptions}
            onChange={setBuildingFilter}
          />
          <FilterDropdown
            multiple
            label="Floor"
            values={floorFilter}
            options={floorOptions}
            onChange={setFloorFilter}
          />
          <FilterDropdown
            multiple
            label="Fabric Type"
            values={fabricTypeFilter}
            options={fabricTypeOptions}
            onChange={setFabricTypeFilter}
          />
          <FilterDropdown
            label="Units"
            value={displayLimit}
            options={displayLimitOptions}
            onChange={(value) => setDisplayLimit(value as DisplayLimit)}
          />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setBuildingFilter([]);
                setFloorFilter([]);
                setFabricTypeFilter([]);
                setDisplayLimit("all");
              }}
              className="flex h-8 flex-shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-500"
            >
              <X size={11} weight="bold" />
              Clear
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="mx-4 mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <WarningCircle size={16} weight="fill" className="flex-shrink-0 text-red-500" />
          <span className="flex-1">{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="flex-shrink-0 text-red-400 hover:text-red-600"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      )}

      <div className="space-y-3 px-4 pt-4">
        {visibleItems.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-foreground">No queue items in this scope</p>
            <p className="mt-1 text-[12px] text-tertiary">
              Try clearing filters to see more.
            </p>
          </div>
        ) : (
          visibleItems.map((item) => {
            const busy = isPending && busyWindowId === item.windowId;
            const returnedToRole = isReturnedToRole(item, role);
            const dueDateLabel = formatDueDate(item);
            return (
              <article
                key={item.windowId}
                className={[
                  "overflow-hidden rounded-[var(--radius-lg)] border bg-card",
                  returnedToRole
                    ? "border-red-200 shadow-[0_1px_3px_rgba(185,28,28,0.08)]"
                    : "border-border",
                ].join(" ")}
              >
                <button
                  onClick={() => router.push(`/${role}/units/${item.unitId}`)}
                  className={[
                    "w-full border-b px-4 py-3 text-left",
                    returnedToRole ? "border-red-100 bg-red-50/60" : "border-border/70 bg-surface/40",
                  ].join(" ")}
                >
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="text-[11px] font-medium text-secondary">
                      Unit {item.unitNumber} · {item.buildingName}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-tertiary">
                      {dueDateLabel && <span>{dueDateLabel}</span>}
                    </div>
                  </div>
                </button>

                <div className="px-4 py-4 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[18px] font-semibold tracking-tight text-foreground">
                        {item.label}
                      </h3>
                      <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-secondary">
                        {item.roomName}
                      </span>
                      <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-secondary">
                        {item.blindType}
                      </span>
                      {returnedToRole && (
                        <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-red-700">
                          Returned
                        </span>
                      )}
                      {!returnedToRole && item.wasReworkInCycle && (
                        <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-amber-800">
                          Rework — priority
                        </span>
                      )}
                      {item.manufacturingLabelPrintedAt && (
                        <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 border border-zinc-300">
                          MFG ✓
                        </span>
                      )}
                      {item.packagingLabelPrintedAt && (
                        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 border border-amber-200">
                          PKG ✓
                        </span>
                      )}
                    </div>
                    <p className="font-mono text-[18px] font-semibold leading-none tracking-tight text-foreground">
                      {item.width ?? "—"} × {item.height ?? "—"}{item.depth != null ? ` × ${item.depth}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-tertiary">
                    {item.targetReadyDate && (
                      <span>{formatReadyDate(item.targetReadyDate)}</span>
                    )}
                    {item.issueStatus === "open" && (
                      <span className={`inline-flex items-center gap-1 font-medium ${returnedToRole ? "text-red-700" : "text-amber-700"}`}>
                        <WarningCircle size={13} weight="fill" />
                        {returnedToRole
                          ? `Returned ${item.escalation?.sourceRole ?? "upstream"} → ${item.escalation?.targetRole ?? role}`
                          : item.escalation
                            ? `${item.escalation.sourceRole} → ${item.escalation.targetRole}: ${item.issueReason || "Escalation open"}`
                            : item.issueReason || "Issue open"}
                      </span>
                    )}
                  </div>

                  {item.notes && (
                    <p className="text-[12px] leading-6 text-secondary max-w-[65ch]">
                      {item.notes}
                    </p>
                  )}

                  {item.issueStatus === "open" && (item.issueReason || item.issueNotes) && (
                    <div className={`max-w-[65ch] rounded-[var(--radius-md)] border px-3 py-3 text-[12px] leading-6 ${returnedToRole ? "border-red-200 bg-white/90 text-red-800" : "border-amber-200 bg-amber-50/80 text-amber-800"}`}>
                      <p className="font-semibold">
                        {item.issueReason || (returnedToRole ? "Returned for rework" : "Issue open")}
                      </p>
                      {item.issueNotes && <p className="mt-1">{item.issueNotes}</p>}
                    </div>
                  )}

                  {role === "qc" && item.escalationHistory.length > 0 && (
                    <div className="max-w-[65ch] rounded-[var(--radius-md)] border border-border bg-surface/60 px-3 py-2.5 text-[12px] leading-5">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-tertiary">
                        Pushback history
                      </p>
                      <ul className="mt-1.5 space-y-1.5">
                        {item.escalationHistory.map((event) => {
                          const dateLabel =
                            formatStoredDateLongEnglish(event.openedAt.slice(0, 10)) ??
                            event.openedAt.slice(0, 10);
                          return (
                            <li key={event.id} className="flex flex-col gap-0.5 text-secondary">
                              <span className="font-medium text-foreground">
                                {event.sourceRole} → {event.targetRole} · {dateLabel}
                                {event.status === "resolved" ? (
                                  <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">resolved</span>
                                ) : (
                                  <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700">open</span>
                                )}
                              </span>
                              {event.reason && <span>{event.reason}</span>}
                              {event.notes && <span className="text-tertiary">{event.notes}</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  <ManufacturingSummaryCard
                    width={item.width}
                    height={item.height}
                    depth={item.depth}
                    windowInstallation={item.windowInstallation}
                    wandChain={item.wandChain}
                    fabricAdjustmentSide={item.fabricAdjustmentSide}
                    fabricAdjustmentInches={item.fabricAdjustmentInches}
                    blindType={item.blindType}
                    chainSide={item.chainSide}
                  />

                  <div className="flex flex-wrap gap-2.5">
                    {role === "assembler" ? (
                      <>
                        {item.productionStatus === "cut" ? (
                          <ActionButton
                            label="Mark assembled"
                            tone="primary"
                            busy={busy}
                            onClick={() =>
                              runWindowAction(item.windowId, () =>
                                markWindowAssembled(item.windowId)
                              , {
                                optimisticUpdate: (current) =>
                                  removeWindow(current, item.windowId),
                              })
                            }
                          />
                        ) : (
                          <StatusChip label="Not ready" tone="muted" />
                        )}
                        <ActionButton
                          label="Return to cutter"
                          tone="warning"
                          busy={busy}
                          disabled={item.productionStatus !== "cut"}
                          onClick={() => handleReturnToCutter(item)}
                        />
                        {item.productionStatus === "assembled" && (
                          <ActionButton
                            label="Undo assembly"
                            tone="ghost"
                            busy={busy}
                            onClick={() =>
                              runWindowAction(item.windowId, () =>
                                undoWindowAssembly(item.windowId)
                              , {
                                optimisticUpdate: (current) =>
                                  updateWindow(current, item.windowId, (currentItem) => ({
                                    ...currentItem,
                                    productionStatus: "cut",
                                  })),
                              })
                            }
                          />
                        )}
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
                              , {
                                optimisticUpdate: (current) =>
                                  removeWindow(current, item.windowId),
                              })
                            }
                          />
                        ) : (
                          <StatusChip
                            label={item.productionStatus === "qc_approved" ? "Built fully" : "Waiting on assembly"}
                            tone={item.productionStatus === "qc_approved" ? "success" : "muted"}
                            icon={item.productionStatus === "qc_approved" ? <CheckCircle size={13} weight="fill" /> : undefined}
                          />
                        )}
                        <ActionButton
                          label="Return to assembler"
                          tone="warning"
                          busy={busy}
                          disabled={item.productionStatus !== "assembled"}
                          onClick={() => handleReturnToAssembler(item)}
                        />
                        <ActionButton
                          label="Return to cutter"
                          tone="warning"
                          busy={busy}
                          disabled={item.productionStatus !== "assembled"}
                          onClick={() => handleReturnToCutter(item)}
                        />
                        {item.productionStatus === "qc_approved" && (
                          <ActionButton
                            label="Undo QC"
                            tone="ghost"
                            busy={busy}
                            onClick={() =>
                              runWindowAction(item.windowId, () =>
                                undoWindowQC(item.windowId)
                              , {
                                optimisticUpdate: (current) =>
                                  updateWindow(current, item.windowId, (currentItem) => ({
                                    ...currentItem,
                                    productionStatus: "assembled",
                                  })),
                              })
                            }
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </div>

      <ReturnBlindDialog
        open={pushbackTarget !== null}
        direction={pushbackTarget?.direction ?? "assembler_to_cutter"}
        windowLabel={
          pushbackTarget
            ? `${pushbackTarget.item.roomName} · ${pushbackTarget.item.label}`
            : undefined
        }
        busy={
          pushbackTarget !== null &&
          busyWindowId === pushbackTarget.item.windowId &&
          isPending
        }
        onCancel={() => setPushbackTarget(null)}
        onSubmit={({ reason, notes }) => submitPushback(reason, notes)}
      />
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
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12px] font-semibold transition-all",
        "active:scale-[0.98] disabled:cursor-not-allowed disabled:border-zinc-200 disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none",
        toneClasses[tone],
      ].join(" ")}
    >
      {busy && <CircleNotch size={12} weight="bold" className="animate-spin" />}
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
