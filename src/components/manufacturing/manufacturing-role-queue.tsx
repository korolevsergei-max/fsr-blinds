"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle,
  FunnelSimple,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import type {
  ManufacturingRoleSchedule,
  ManufacturingWindowItem,
} from "@/lib/manufacturing-scheduler";
import { formatStoredDateLongEnglish } from "@/lib/created-date";
import { StickyDayRail } from "@/components/schedule/sticky-day-rail";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import {
  SCHEDULE_INSTALL_DATE_FILTER_LABELS,
  matchesInstallDateFilter,
  type ScheduleInstallDateFilter,
} from "@/lib/schedule-ui";
import {
  shiftWindowManufacturingSchedule,
  returnWindowToAssembler,
  returnWindowToCutter,
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

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getBucketDayParts(date: string | null) {
  if (!date) return null;
  const parsed = new Date(`${date}T00:00:00`);
  return {
    dayLabel: parsed.toLocaleDateString("en-CA", { weekday: "short" }),
    dayNumber: parsed.getDate(),
  };
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

type QueueStatusFilter =
  | "returned"
  | "issues"
  | "overdue"
  | "today"
  | "next_day"
  | "unscheduled";

function getWindowPriority(
  role: "cutter" | "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  if (item.issueStatus === "open") return 0;
  if (role === "cutter") {
    return item.productionStatus === "pending" ? 1 : 2;
  }
  if (role === "assembler") {
    return item.productionStatus === "cut" ? 1 : 2;
  }
  if (item.productionStatus === "assembled") return 1;
  return 3;
}

function countActionReadyWindows(
  role: "cutter" | "assembler" | "qc",
  windows: ManufacturingWindowItem[]
) {
  return windows.filter((item) => getWindowPriority(role, item) < 3).length;
}

function isReturnedToRole(
  item: ManufacturingWindowItem,
  role: "cutter" | "assembler" | "qc"
) {
  return item.issueStatus === "open" && item.escalation?.targetRole === role;
}

function matchesQueueStatusFilter(args: {
  item: ManufacturingWindowItem;
  role: "cutter" | "assembler" | "qc";
  statusFilters: QueueStatusFilter[];
  todayKey: string;
  bucketDate: string | null;
  bucketLabel: string;
}) {
  const { item, role, statusFilters, todayKey, bucketDate, bucketLabel } = args;
  if (statusFilters.length === 0) return true;

  return statusFilters.some((filter) => {
    if (filter === "returned") return isReturnedToRole(item, role);
    if (filter === "issues") return item.issueStatus === "open";
    if (filter === "overdue") return Boolean(item.installationDate && item.installationDate < todayKey);
    if (filter === "today") return bucketDate === todayKey;
    if (filter === "next_day") return bucketLabel === "Next Working Day";
    return bucketLabel === "Unscheduled";
  });
}

function sortWindows(
  role: "cutter" | "assembler" | "qc",
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
  role: "cutter" | "assembler" | "qc"
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
  role: "cutter" | "assembler" | "qc",
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
  role: "cutter" | "assembler" | "qc";
  schedule: ManufacturingRoleSchedule;
  userName?: string;
}) {
  const router = useRouter();
  const [busyWindowId, setBusyWindowId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [localSchedule, setLocalSchedule] = useState(() => normalizeSchedule(schedule, role));
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = useState(188);
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string[]>([]);
  const [installDateFilter, setInstallDateFilter] = useState<ScheduleInstallDateFilter>("all");
  const [statusFilters, setStatusFilters] = useState<QueueStatusFilter[]>([]);
  const todayKey = formatDateKey(new Date());

  useEffect(() => {
    setLocalSchedule(normalizeSchedule(schedule, role));
  }, [role, schedule]);

  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;

    const updateHeight = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      if (next > 0) {
        setStickyTop(next);
      }
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

  const collectPushbackDetails = (message: string) => {
    const reason = globalThis.window.prompt(message);
    if (!reason) return null;
    const notes = globalThis.window.prompt("Add notes for the escalation.");
    if (!notes) return null;
    return { reason, notes };
  };

  const handleReturnToCutter = (item: ManufacturingWindowItem) => {
    const details = collectPushbackDetails("Why is this blind being returned to cutter?");
    if (!details) return;

    runWindowAction(item.windowId, () => returnWindowToCutter(item.windowId, details.reason, details.notes), {
      refreshOnSuccess: true,
    });
  };

  const handleReturnToAssembler = (item: ManufacturingWindowItem) => {
    const details = collectPushbackDetails("Why is this blind being returned to assembler?");
    if (!details) return;

    runWindowAction(item.windowId, () => returnWindowToAssembler(item.windowId, details.reason, details.notes), {
      refreshOnSuccess: true,
    });
  };

  const title =
    role === "cutter" ? "Cutting queue" : role === "assembler" ? "Assembly queue" : "QC queue";

  const clientOptions = [
    { value: "all", label: "All clients" },
    ...[
      ...new Map(
        localSchedule.allItems.map((item) => [item.clientId, { value: item.clientId, label: item.clientName }])
      ).values(),
    ],
  ];

  const buildingOptions = [
    { value: "all", label: "All buildings" },
    ...[
      ...new Map(
        localSchedule.allItems
          .filter((item) => clientFilter.length === 0 || clientFilter.includes(item.clientId))
          .map((item) => [item.buildingId, { value: item.buildingId, label: item.buildingName }])
      ).values(),
    ],
  ];

  const installDateOptions = Object.entries(SCHEDULE_INSTALL_DATE_FILTER_LABELS).map(([value, label]) => ({
    value,
    label,
  }));

  const queueStatusOptions = [
    { value: "all", label: "All queue states" },
    { value: "returned", label: "Returned" },
    { value: "issues", label: "Issues" },
    { value: "overdue", label: "Overdue" },
    { value: "today", label: "Today" },
    { value: "next_day", label: "Next day" },
    { value: "unscheduled", label: "Unscheduled" },
  ];

  const activeFilterCount = [
    clientFilter.length > 0,
    buildingFilter.length > 0,
    installDateFilter !== "all",
    statusFilters.length > 0,
  ].filter(Boolean).length;

  const visibleBuckets = localSchedule.buckets
    .map((bucket) => {
      const units = bucket.units
        .map((unit) => {
          const blindTypeGroups = unit.blindTypeGroups
            .map((group) => ({
              ...group,
              windows: group.windows.filter((item) => {
                if (clientFilter.length > 0 && !clientFilter.includes(item.clientId)) return false;
                if (buildingFilter.length > 0 && !buildingFilter.includes(item.buildingId)) return false;
                if (!matchesInstallDateFilter(item.installationDate, installDateFilter, new Date())) return false;
                return matchesQueueStatusFilter({
                  item,
                  role,
                  statusFilters,
                  todayKey,
                  bucketDate: bucket.date,
                  bucketLabel: bucket.label,
                });
              }),
            }))
            .filter((group) => group.windows.length > 0);

          if (blindTypeGroups.length === 0) return null;

          return {
            ...unit,
            blindTypeGroups,
            scheduledCount: blindTypeGroups.reduce((sum, group) => sum + group.windows.length, 0),
          };
        })
        .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit));

      return {
        ...bucket,
        units,
        scheduledCount: units.reduce((sum, unit) => sum + unit.scheduledCount, 0),
      };
    })
    .filter((bucket) => bucket.units.length > 0);

  return (
    <div
      className="pb-6"
      style={{ ["--schedule-sticky-top" as string]: `${stickyTop}px` }}
    >
      <div
        ref={headerRef}
        className="sticky top-0 z-30 border-b border-border bg-card/95 px-4 pt-4 pb-4 backdrop-blur-md"
      >
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

        <div className="mt-4 flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
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
            label="Client"
            values={clientFilter}
            options={clientOptions}
            onChange={(values) => {
              setClientFilter(values);
              setBuildingFilter([]);
            }}
          />
          <FilterDropdown
            multiple
            label="Building"
            values={buildingFilter}
            options={buildingOptions}
            onChange={setBuildingFilter}
          />
          <FilterDropdown
            label="Installation Date"
            value={installDateFilter}
            options={installDateOptions}
            onChange={(value) => setInstallDateFilter(value as ScheduleInstallDateFilter)}
          />
          <FilterDropdown
            multiple
            label="Queue State"
            values={statusFilters}
            options={queueStatusOptions}
            onChange={(values) => setStatusFilters(values as QueueStatusFilter[])}
          />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setClientFilter([]);
                setBuildingFilter([]);
                setInstallDateFilter("all");
                setStatusFilters([]);
              }}
              className="flex h-8 flex-shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-500"
            >
              <X size={11} weight="bold" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4 px-4 pt-4">
        {visibleBuckets.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-8 text-center">
            <p className="text-sm font-semibold text-foreground">No queue items in this scope</p>
            <p className="mt-1 text-[12px] text-tertiary">
              Try clearing filters or selecting a different queue state.
            </p>
          </div>
        ) : visibleBuckets.map((bucket) => (
          <section key={`${bucket.label}-${bucket.date ?? "special"}`} className="relative">
            {(() => {
              const dayParts = getBucketDayParts(bucket.date);
              if (dayParts) {
                return (
                  <StickyDayRail
                    dayLabel={dayParts.dayLabel}
                    dayNumber={dayParts.dayNumber}
                    isToday={bucket.date === todayKey}
                    isPast={Boolean(bucket.date && bucket.date < todayKey)}
                    taskCount={bucket.scheduledCount}
                  />
                );
              }

              return (
                <div className="sticky top-[var(--schedule-sticky-top)] z-20 -mx-4 border-y border-border bg-card px-4 py-3">
                  <div className="flex items-center justify-between gap-4 px-4">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tertiary">
                      {bucket.label}
                    </p>
                    <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-tertiary">
                      {bucket.scheduledCount} scheduled
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="pt-3">
              {bucket.units.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-4 text-sm text-tertiary">
                  Nothing queued here.
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                {bucket.units.map((unit) => (
                  <div
                    key={`${bucket.label}-${unit.unitId}`}
                    className={[
                      "overflow-hidden rounded-[var(--radius-lg)] border bg-card",
                      unit.blindTypeGroups.some((group) =>
                        group.windows.some((item) => isReturnedToRole(item, role))
                      )
                        ? "border-red-200 shadow-[0_1px_3px_rgba(185,28,28,0.08)]"
                        : "border-border",
                    ].join(" ")}
                  >
                    <button
                      onClick={() => router.push(`/${role}/units/${unit.unitId}`)}
                      className={[
                        "w-full border-b px-4 py-4 text-left",
                        unit.blindTypeGroups.some((group) =>
                          group.windows.some((item) => isReturnedToRole(item, role))
                        )
                          ? "border-red-100 bg-red-50/60"
                          : "border-border/70",
                      ].join(" ")}
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
                          <span>{bucket.scheduledCount}/{bucket.capacity}</span>
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
                              const returnedToRole = isReturnedToRole(item, role);
                              return (
                                <article
                                  key={item.windowId}
                                  className={[
                                    "grid gap-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start",
                                    returnedToRole ? "rounded-[var(--radius-md)] bg-red-50/70 px-3 -mx-3" : "",
                                  ].join(" ")}
                                >
                                  <div className="min-w-0">
                                    <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                                      <h3 className="text-[15px] font-semibold tracking-tight text-foreground sm:text-[15px]">
                                        {item.label}
                                      </h3>
                                      <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-medium text-secondary">
                                        {item.roomName}
                                      </span>
                                      {returnedToRole && (
                                        <span className="rounded-full bg-red-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-red-700">
                                          Returned
                                        </span>
                                      )}
                                    </div>

                                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-tertiary">
                                      <span>{formatReadyDate(item.targetReadyDate)}</span>
                                      {item.issueStatus === "open" && (
                                        <span className={`inline-flex items-center gap-1 font-medium ${returnedToRole ? "text-red-700" : "text-amber-700"}`}>
                                          <WarningCircle size={13} weight="fill" />
                                          {returnedToRole
                                            ? `Returned ${item.escalation?.sourceRole ?? "upstream"} -> ${item.escalation?.targetRole ?? role}`
                                            : item.escalation
                                              ? `${item.escalation.sourceRole} -> ${item.escalation.targetRole}: ${item.issueReason || "Escalation open"}`
                                              : item.issueReason || "Issue open"}
                                        </span>
                                      )}
                                    </div>

                                    {item.notes && (
                                      <p className="mt-2 max-w-[65ch] text-[12px] leading-6 text-secondary">
                                        {item.notes}
                                      </p>
                                    )}
                                    {item.issueStatus === "open" && item.issueNotes && (
                                      <div className={`mt-3 max-w-[65ch] rounded-[var(--radius-md)] border px-3 py-3 text-[12px] leading-6 ${returnedToRole ? "border-red-200 bg-white/90 text-red-800" : "border-amber-200 bg-amber-50/80 text-amber-800"}`}>
                                        <p className="font-semibold">
                                          {item.issueReason || (returnedToRole ? "Returned for rework" : "Issue open")}
                                        </p>
                                        <p className="mt-1">{item.issueNotes}</p>
                                      </div>
                                    )}

                                    <div className="mt-4 flex flex-wrap gap-2.5">
                                      {role === "cutter" ? (
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
                                      ) : role === "assembler" ? (
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
                                                    updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
                                                      ...currentItem,
                                                      productionStatus: "assembled",
                                                    })),
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
                                          <ActionButton
                                            label="Move earlier"
                                            tone="secondary"
                                            busy={busy}
                                            disabled={item.productionStatus !== "cut"}
                                            onClick={() => handleMove(item, "earlier")}
                                          />
                                          <ActionButton
                                            label="Move later"
                                            tone="secondary"
                                            busy={busy}
                                            disabled={item.productionStatus !== "cut"}
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
                                                , {
                                                  optimisticUpdate: (current) =>
                                                    updateWindowInSchedule(current, role, item.windowId, (currentItem) => ({
                                                      ...currentItem,
                                                      productionStatus: "qc_approved",
                                                      issueStatus: "resolved",
                                                    })),
                                                })
                                              }
                                            />
                                          ) : (
                                            <StatusChip label="Waiting on assembly" tone="muted" />
                                          )}
                                          <ActionButton
                                            label="Return to assembler"
                                            tone="warning"
                                            busy={busy}
                                            disabled={item.productionStatus !== "assembled"}
                                            onClick={() => handleReturnToAssembler(item)}
                                          />
                                          <ActionButton
                                            label="Move earlier"
                                            tone="secondary"
                                            busy={busy}
                                            disabled={item.productionStatus !== "assembled"}
                                            onClick={() => handleMove(item, "earlier")}
                                          />
                                          <ActionButton
                                            label="Move later"
                                            tone="secondary"
                                            busy={busy}
                                            disabled={item.productionStatus !== "assembled"}
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

                                      {role === "qc" && item.productionStatus === "qc_approved" && (
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
            </div>
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
