"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  FunnelSimple,
  Printer,
  SortAscending,
  Trash,
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
import { ManufacturingSummaryCard } from "@/components/windows/manufacturing-summary-card";

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

type SortField =
  | "unitNumber"
  | "buildingName"
  | "blindType"
  | "fabricWidth"
  | "windowWidth";

type SortDirection = "asc" | "desc";

type SortLevel = {
  field: SortField;
  direction: SortDirection;
};

const SORT_FIELD_LABELS: Record<SortField, string> = {
  unitNumber: "Unit Number",
  buildingName: "Building",
  blindType: "Fabric Type",
  fabricWidth: "Fabric Width",
  windowWidth: "Window Width",
};

function computeFabricWidth(item: ManufacturingWindowItem): number | null {
  if (item.width == null) return null;
  if (item.fabricAdjustmentSide !== "none" && item.fabricAdjustmentInches != null) {
    return item.width - item.fabricAdjustmentInches;
  }
  return item.width;
}

function getSortValue(item: ManufacturingWindowItem, field: SortField): string | number | null {
  switch (field) {
    case "unitNumber": return item.unitNumber;
    case "buildingName": return item.buildingName;
    case "blindType": return item.blindType;
    case "fabricWidth": return computeFabricWidth(item);
    case "windowWidth": return item.width;
  }
}

function multiLevelSort(
  windows: ManufacturingWindowItem[],
  levels: SortLevel[]
): ManufacturingWindowItem[] {
  if (levels.length === 0) return windows;
  return [...windows].sort((a, b) => {
    for (const level of levels) {
      const va = getSortValue(a, level.field);
      const vb = getSortValue(b, level.field);
      // nulls last
      if (va == null && vb == null) continue;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb));
      }
      if (cmp !== 0) return level.direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}

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
              windows: [...group.windows].sort((a, b) => {
                const pa = getWindowPriority(role, a);
                const pb = getWindowPriority(role, b);
                if (pa !== pb) return pa - pb;
                const wa = a.width ?? -1;
                const wb = b.width ?? -1;
                return wb - wa;
              }),
            })),
        })),
    })),
  };
}

function updateWindowInSchedule(
  schedule: ManufacturingRoleSchedule,
  role: "cutter" | "assembler" | "qc",
  windowId: string,
  updater: (item: ManufacturingWindowItem) => ManufacturingWindowItem | null
) {
  const nextSchedule: ManufacturingRoleSchedule = {
    ...schedule,
    buckets: schedule.buckets.map((bucket) => ({
      ...bucket,
      units: bucket.units.map((unit) => ({
        ...unit,
          blindTypeGroups: unit.blindTypeGroups.map((group) => ({
          ...group,
          windows: group.windows
            .map((item) => (item.windowId === windowId ? updater(item) : item))
            .filter((item): item is ManufacturingWindowItem => Boolean(item)),
        }))
        .filter((group) => group.windows.length > 0),
      }))
      .filter((unit) => unit.blindTypeGroups.length > 0),
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
  const [buildingFilter, setBuildingFilter] = useState<string[]>([]);
  const [installDateFilter, setInstallDateFilter] = useState<ScheduleInstallDateFilter>("all");
  const [statusFilters, setStatusFilters] = useState<QueueStatusFilter[]>([]);
  const [fabricTypeFilter, setFabricTypeFilter] = useState<string[]>([]);
  const [sortLevels, setSortLevels] = useState<SortLevel[]>([]);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [draftSortLevels, setDraftSortLevels] = useState<SortLevel[]>([]);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printSelectedDays, setPrintSelectedDays] = useState<number[]>([0]);
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

  const collectPushbackReason = (message: string) => {
    const reason = globalThis.window.prompt(message);
    if (!reason) return null;
    return reason;
  };

  const handleReturnToCutter = (item: ManufacturingWindowItem) => {
    const reason = collectPushbackReason("Why is this blind being returned to cutter?");
    if (!reason) return;

    runWindowAction(item.windowId, () => returnWindowToCutter(item.windowId, reason, ""), {
      refreshOnSuccess: true,
    });
  };

  const handleReturnToAssembler = (item: ManufacturingWindowItem) => {
    const reason = collectPushbackReason("Why is this blind being returned to assembler?");
    if (!reason) return;

    runWindowAction(item.windowId, () => returnWindowToAssembler(item.windowId, reason, ""), {
      refreshOnSuccess: true,
    });
  };

  const title =
    role === "cutter" ? "Cutting queue" : role === "assembler" ? "Assembly queue" : "QC queue";

  const buildingOptions = [
    { value: "all", label: "All buildings" },
    ...[
      ...new Map(
        localSchedule.allItems.map((item) => [item.buildingId, { value: item.buildingId, label: item.buildingName }])
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
    buildingFilter.length > 0,
    installDateFilter !== "all",
    statusFilters.length > 0,
    fabricTypeFilter.length > 0,
  ].filter(Boolean).length;

  const activeSortCount = sortLevels.length;

  const fabricTypeOptions = [
    { value: "all", label: "All types" },
    { value: "screen", label: "Screen" },
    { value: "blackout", label: "Blackout" },
  ];

  const sortFieldOptions = Object.entries(SORT_FIELD_LABELS).map(([value, label]) => ({ value, label }));

  function openSortModal() {
    setDraftSortLevels(sortLevels);
    setSortModalOpen(true);
  }

  function applySort() {
    setSortLevels(draftSortLevels);
    setSortModalOpen(false);
  }

  function addDraftLevel() {
    if (draftSortLevels.length >= 3) return;
    const usedFields = new Set(draftSortLevels.map((l) => l.field));
    const nextField = (Object.keys(SORT_FIELD_LABELS) as SortField[]).find((f) => !usedFields.has(f));
    if (!nextField) return;
    setDraftSortLevels((prev) => [...prev, { field: nextField, direction: "asc" }]);
  }

  function removeDraftLevel(idx: number) {
    setDraftSortLevels((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateDraftLevel(idx: number, patch: Partial<SortLevel>) {
    setDraftSortLevels((prev) =>
      prev.map((level, i) => (i === idx ? { ...level, ...patch } : level))
    );
  }

  const printDayOptions = localSchedule.buckets
    .filter((b) => b.date !== null)
    .slice(0, 3)
    .map((bucket, idx) => {
      const pendingIds = bucket.units
        .flatMap((u) => u.blindTypeGroups.flatMap((g) => g.windows))
        .filter((w) => w.productionStatus === "pending")
        .map((w) => w.windowId);
      const dayLabel = idx === 0 ? "Today" : idx === 1 ? "Next working day" : "Working day after";
      return { label: dayLabel, date: bucket.date!, pendingIds };
    });

  const handlePrint = () => {
    const ids = printSelectedDays
      .flatMap((idx) => printDayOptions[idx]?.pendingIds ?? []);
    if (ids.length === 0) return;
    const url = `/cutter/queue/print?ids=${ids.join(",")}`;
    window.open(url, "_blank");
    setPrintModalOpen(false);
  };

  // Flatten to per-bucket window list, with optional multi-level sort
  const visibleBuckets = localSchedule.buckets
    .map((bucket) => {
      const windows: ManufacturingWindowItem[] = [];
      for (const unit of bucket.units) {
        for (const group of unit.blindTypeGroups) {
          for (const item of group.windows) {
            if (buildingFilter.length > 0 && !buildingFilter.includes(item.buildingId)) continue;
            if (!matchesInstallDateFilter(item.installationDate, installDateFilter, new Date())) continue;
            if (!matchesQueueStatusFilter({
              item,
              role,
              statusFilters,
              todayKey,
              bucketDate: bucket.date,
              bucketLabel: bucket.label,
            })) continue;
            if (fabricTypeFilter.length > 0 && !fabricTypeFilter.includes(item.blindType)) continue;
            windows.push(item);
          }
        }
      }

      if (sortLevels.length > 0) {
        // Custom multi-level sort — still keeps issues/returned at top
        const priority = (w: ManufacturingWindowItem) => getWindowPriority(role, w);
        const byPriority = (a: ManufacturingWindowItem, b: ManufacturingWindowItem) => priority(a) - priority(b);
        windows.sort((a, b) => {
          const pd = byPriority(a, b);
          if (pd !== 0) return pd;
          return 0;
        });
        // Apply multi-level sort within each priority group
        const priorityGroups = new Map<number, ManufacturingWindowItem[]>();
        for (const w of windows) {
          const p = priority(w);
          if (!priorityGroups.has(p)) priorityGroups.set(p, []);
          priorityGroups.get(p)!.push(w);
        }
        windows.length = 0;
        for (const [, group] of [...priorityGroups.entries()].sort(([a], [b]) => a - b)) {
          windows.push(...multiLevelSort(group, sortLevels));
        }
      } else {
        // Default: issues/returned first, then by width descending
        windows.sort((a, b) => {
          const pa = getWindowPriority(role, a);
          const pb = getWindowPriority(role, b);
          if (pa !== pb) return pa - pb;
          const wa = a.width ?? -1;
          const wb = b.width ?? -1;
          return wb - wa;
        });
      }

      return { ...bucket, windows, scheduledCount: windows.length };
    })
    .filter((bucket) => bucket.windows.length > 0);

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
          {role === "cutter" && (
            <button
              type="button"
              onClick={() => { setPrintModalOpen(true); setPrintSelectedDays([0]); }}
              className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[12px] font-semibold text-secondary transition-colors hover:bg-surface"
            >
              <Printer size={15} />
              Print labels
            </button>
          )}
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
          <FilterDropdown
            multiple
            label="Fabric Type"
            values={fabricTypeFilter}
            options={fabricTypeOptions}
            onChange={setFabricTypeFilter}
          />
          {/* Sort button */}
          <button
            type="button"
            id="queue-sort-button"
            onClick={openSortModal}
            className={[
              "flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-all",
              activeSortCount > 0
                ? "border-accent bg-accent text-white"
                : "border-border bg-card text-secondary hover:border-zinc-300",
            ].join(" ")}
          >
            <SortAscending size={13} weight="bold" />
            {activeSortCount > 0 ? `Sort (${activeSortCount})` : "Sort"}
          </button>
          {(activeFilterCount > 0 || activeSortCount > 0) && (
            <button
              type="button"
              onClick={() => {
                setBuildingFilter([]);
                setInstallDateFilter("all");
                setStatusFilters([]);
                setFabricTypeFilter([]);
                setSortLevels([]);
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
              {bucket.windows.length === 0 ? (
                <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-4 text-sm text-tertiary">
                  Nothing queued here.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {bucket.windows.map((item) => {
                    const busy = isPending && busyWindowId === item.windowId;
                    const returnedToRole = isReturnedToRole(item, role);
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
                        {/* Context header — tap to go to unit */}
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
                              {item.installationDate && (
                                <span>{formatInstallDate(item.installationDate)}</span>
                              )}
                            </div>
                          </div>
                        </button>

                        <div className="px-4 py-4 space-y-4">
                          {/* Window identity + dimensions */}
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
                            </div>
                            <p className="font-mono text-[18px] font-semibold leading-none tracking-tight text-foreground">
                              {item.width ?? "—"} × {item.height ?? "—"}{item.depth != null ? ` × ${item.depth}` : ""}
                            </p>
                          </div>

                          {/* Ready date + issue */}
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

                          {item.issueStatus === "open" && item.issueNotes && (
                            <div className={`max-w-[65ch] rounded-[var(--radius-md)] border px-3 py-3 text-[12px] leading-6 ${returnedToRole ? "border-red-200 bg-white/90 text-red-800" : "border-amber-200 bg-amber-50/80 text-amber-800"}`}>
                              <p className="font-semibold">
                                {item.issueReason || (returnedToRole ? "Returned for rework" : "Issue open")}
                              </p>
                              <p className="mt-1">{item.issueNotes}</p>
                            </div>
                          )}

                          {/* Manufacturing summary */}
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

                          {/* Actions */}
                          <div className="flex flex-wrap gap-2.5">
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
                                          updateWindowInSchedule(current, role, item.windowId, () => null),
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
                                          updateWindowInSchedule(current, role, item.windowId, () => null),
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
                                          updateWindowInSchedule(current, role, item.windowId, () => null),
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
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      {/* Sort Modal */}
      {sortModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={() => setSortModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-[var(--radius-xl)] border border-border bg-card p-6 pb-10 shadow-xl sm:rounded-[var(--radius-xl)] sm:pb-6 max-h-[85dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">Sort queue</h2>
              <button
                type="button"
                onClick={() => setSortModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-tertiary hover:bg-surface"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <p className="mb-4 text-[12px] text-tertiary">
              Add up to 3 sort levels. Sort applies within each day bucket, after priority items.
            </p>

            <div className="space-y-2">
              {draftSortLevels.map((level, idx) => {
                const usedFields = new Set(
                  draftSortLevels.filter((_, i) => i !== idx).map((l) => l.field)
                );
                const availableOptions = sortFieldOptions.filter(
                  (o) => !usedFields.has(o.value as SortField)
                );
                return (
                  <div
                    key={idx}
                    className="flex items-center gap-2 rounded-xl border border-border bg-surface/50 px-3 py-2.5"
                  >
                    {/* Level badge */}
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                      {idx + 1}
                    </span>
                    {/* Field select */}
                    <select
                      id={`sort-field-${idx}`}
                      value={level.field}
                      onChange={(e) => updateDraftLevel(idx, { field: e.target.value as SortField })}
                      className="flex-1 min-w-0 rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium text-foreground focus:outline-none"
                    >
                      {availableOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    {/* Direction toggle */}
                    <button
                      type="button"
                      id={`sort-direction-${idx}`}
                      onClick={() =>
                        updateDraftLevel(idx, {
                          direction: level.direction === "asc" ? "desc" : "asc",
                        })
                      }
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-card text-secondary transition-colors hover:bg-surface"
                      title={level.direction === "asc" ? "Ascending" : "Descending"}
                    >
                      {level.direction === "asc" ? (
                        <ArrowUp size={13} weight="bold" />
                      ) : (
                        <ArrowDown size={13} weight="bold" />
                      )}
                    </button>
                    {/* Remove */}
                    <button
                      type="button"
                      id={`sort-remove-${idx}`}
                      onClick={() => removeDraftLevel(idx)}
                      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-red-50 hover:text-red-500"
                    >
                      <Trash size={13} />
                    </button>
                  </div>
                );
              })}

              {draftSortLevels.length < 3 && (
                <button
                  type="button"
                  id="sort-add-level"
                  onClick={addDraftLevel}
                  className="w-full rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-tertiary transition-colors hover:border-accent hover:text-accent"
                >
                  + Add sort level
                </button>
              )}
            </div>

            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => { setDraftSortLevels([]); }}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-[13px] font-semibold text-secondary hover:bg-surface"
              >
                <Trash size={13} />
                Clear
              </button>
              <button
                type="button"
                onClick={() => setSortModalOpen(false)}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 text-[13px] font-semibold text-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                id="sort-apply"
                onClick={applySort}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-white"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {printModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          onClick={() => setPrintModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-[var(--radius-xl)] border border-border bg-card p-6 pb-10 shadow-xl sm:rounded-[var(--radius-xl)] sm:pb-6 max-h-[85dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">Print labels</h2>
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-tertiary hover:bg-surface"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <p className="mb-4 text-[12px] text-tertiary">
              Select which days to print. Only uncut blinds are included.
            </p>
            <div className="space-y-2">
              {printDayOptions.length === 0 ? (
                <p className="text-[12px] text-tertiary italic">No scheduled cutting days found.</p>
              ) : printDayOptions.map((option, idx) => {
                const checked = printSelectedDays.includes(idx);
                const empty = option.pendingIds.length === 0;
                return (
                  <label
                    key={option.date}
                    className={[
                      "flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition-colors",
                      empty ? "cursor-not-allowed opacity-40 border-border" : checked ? "border-accent bg-accent/5" : "border-border hover:bg-surface",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        disabled={empty}
                        checked={checked}
                        onChange={() => {
                          if (empty) return;
                          setPrintSelectedDays((prev) =>
                            prev.includes(idx) ? prev.filter((d) => d !== idx) : [...prev, idx]
                          );
                        }}
                        className="accent-accent h-4 w-4 rounded"
                      />
                      <span className="text-[13px] font-medium text-foreground">{option.label}</span>
                    </div>
                    <span className="text-[12px] text-tertiary">
                      {option.pendingIds.length} uncut
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setPrintModalOpen(false)}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 text-[13px] font-semibold text-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={printSelectedDays.length === 0 || printSelectedDays.every((idx) => printDayOptions[idx]?.pendingIds.length === 0)}
                onClick={handlePrint}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                <Printer size={14} />
                Print
              </button>
            </div>
          </div>
        </div>
      )}
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
