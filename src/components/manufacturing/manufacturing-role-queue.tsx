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
import { InstallDateCalendarFilter, NOT_SET_SENTINEL } from "@/components/ui/install-date-calendar-filter";
import { getFloor } from "@/lib/app-dataset";
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
import { ManufacturingSummaryCard, type ManufacturingHighlightSection } from "@/components/windows/manufacturing-summary-card";
import { ReturnBlindDialog } from "@/components/manufacturing/return-blind-dialog";
import type { PushbackDirection } from "@/lib/pushback-reasons";

type ComponentFilter = "all" | ManufacturingHighlightSection;
type DisplayLimit = "all" | "25" | "50" | "75" | "100";
type PrintLabelMode = "manufacturing" | "packaging" | "both";

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

function getBucketKey(bucket: { date: string | null; label: string }) {
  return bucket.date ?? `__${bucket.label}__`;
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
  | "clientName"
  | "unitNumber"
  | "buildingName"
  | "floor"
  | "installationDate"
  | "completionDate"
  | "blindType"
  | "fabricWidth"
  | "windowWidth"
  | "valanceWidth"
  | "tubeWidth"
  | "label";

type SortDirection = "asc" | "desc";

type SortLevel = {
  field: SortField;
  direction: SortDirection;
};

const SORT_FIELD_LABELS: Record<SortField, string> = {
  clientName: "Client Name",
  unitNumber: "Unit Number",
  buildingName: "Building",
  floor: "Floor",
  installationDate: "Installation Date",
  completionDate: "Completion Date",
  blindType: "Fabric Type",
  fabricWidth: "Fabric Width",
  windowWidth: "Window Width",
  valanceWidth: "Valance Width",
  tubeWidth: "Tube Width",
  label: "Window Label",
};

function computeFabricWidth(item: ManufacturingWindowItem): number | null {
  if (item.width == null) return null;
  if (item.fabricAdjustmentSide !== "none" && item.fabricAdjustmentInches != null) {
    return item.width - item.fabricAdjustmentInches;
  }
  return item.width;
}

function getCompletionTimestamp(item: ManufacturingWindowItem, role: "cutter" | "assembler" | "qc"): string | null {
  if (role === "cutter") return item.cutAt ?? null;
  if (role === "assembler") return item.assembledAt ?? null;
  return item.qcApprovedAt ?? null;
}

function getSortValue(item: ManufacturingWindowItem, field: SortField, role: "cutter" | "assembler" | "qc"): string | number | null {
  switch (field) {
    case "clientName": return item.clientName;
    case "unitNumber": return item.unitNumber;
    case "buildingName": return item.buildingName;
    case "floor": {
      const f = getFloor(item.unitNumber);
      const n = Number(f);
      return Number.isFinite(n) ? n : f;
    }
    case "installationDate": return item.installationDate ?? null;
    case "completionDate": return getCompletionTimestamp(item, role);
    case "blindType": return item.blindType;
    case "fabricWidth": return computeFabricWidth(item);
    case "windowWidth": return item.width;
    case "valanceWidth": return item.width != null ? item.width - 0.0625 : null;
    case "tubeWidth": return item.width != null ? item.width - 1.375 : null;
    case "label": return item.label;
  }
}

function multiLevelSort(
  windows: ManufacturingWindowItem[],
  levels: SortLevel[],
  role: "cutter" | "assembler" | "qc"
): ManufacturingWindowItem[] {
  if (levels.length === 0) return windows;
  return [...windows].sort((a, b) => {
    for (const level of levels) {
      const va = getSortValue(a, level.field, role);
      const vb = getSortValue(b, level.field, role);
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
  const [installDates, setInstallDates] = useState<string[]>([]);
  const [completionDates, setCompletionDates] = useState<string[]>([]);
  const [statusFilters, setStatusFilters] = useState<QueueStatusFilter[]>([]);
  const [fabricTypeFilter, setFabricTypeFilter] = useState<string[]>([]);
  const [floorFilter, setFloorFilter] = useState<string[]>([]);
  const [componentFilter, setComponentFilter] = useState<ComponentFilter>("all");
  const [displayLimit, setDisplayLimit] = useState<DisplayLimit>("all");
  const [sortLevels, setSortLevels] = useState<SortLevel[]>([]);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [draftSortLevels, setDraftSortLevels] = useState<SortLevel[]>([]);
  const [ezSort, setEzSort] = useState<"list_packaging" | "manufacturing" | null>(null);
  const [ezSortModalOpen, setEzSortModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [printLabelMode, setPrintLabelMode] = useState<PrintLabelMode>("manufacturing");
  const [skipAlreadyPrinted, setSkipAlreadyPrinted] = useState(true);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [printAction, setPrintAction] = useState<"list" | "labels">("list");
  const [selectedBucketKeys, setSelectedBucketKeys] = useState<Set<string>>(new Set());
  const [pushbackTarget, setPushbackTarget] = useState<{
    item: ManufacturingWindowItem;
    direction: PushbackDirection;
  } | null>(null);
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
    runWindowAction(target.item.windowId, action, { refreshOnSuccess: true });
    setPushbackTarget(null);
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

  const availableInstallDates = new Set(
    localSchedule.allItems.map((item) => item.installationDate).filter((d): d is string => d != null)
  );

  const availableCompletionDates = new Set(
    localSchedule.allItems
      .map((item) => getCompletionTimestamp(item, role))
      .filter((t): t is string => t != null)
      .map((t) => t.slice(0, 10))
  );

  const unitLabelPrintedFlags = new Map<string, { mfg: boolean; pkg: boolean }>();
  {
    const byUnit = new Map<string, ManufacturingWindowItem[]>();
    for (const item of localSchedule.allItems) {
      if (!byUnit.has(item.unitId)) byUnit.set(item.unitId, []);
      byUnit.get(item.unitId)!.push(item);
    }
    for (const [unitId, items] of byUnit) {
      unitLabelPrintedFlags.set(unitId, {
        mfg: items.length > 0 && items.every((w) => w.manufacturingLabelPrintedAt != null),
        pkg: items.length > 0 && items.every((w) => w.packagingLabelPrintedAt != null),
      });
    }
  }

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
    installDates.length > 0,
    completionDates.length > 0,
    statusFilters.length > 0,
    fabricTypeFilter.length > 0,
    floorFilter.length > 0,
    componentFilter !== "all",
    displayLimit !== "all",
  ].filter(Boolean).length;

  const activeSortCount = sortLevels.length;

  const fabricTypeOptions = [
    { value: "all", label: "All types" },
    { value: "screen", label: "Screen" },
    { value: "blackout", label: "Blackout" },
  ];

  const componentOptions: { value: ComponentFilter; label: string }[] = [
    { value: "all", label: "All components" },
    { value: "fabric", label: "Fabric" },
    { value: "valance", label: "Valance" },
    { value: "tube_rail", label: "Tube / Bottom rail" },
  ];

  const displayLimitOptions: { value: DisplayLimit; label: string }[] = [
    { value: "all", label: "No limit" },
    { value: "25", label: "25 units" },
    { value: "50", label: "50 units" },
    { value: "75", label: "75 units" },
    { value: "100", label: "100 units" },
  ];

  const highlightSection: ManufacturingHighlightSection | null =
    componentFilter === "all" ? null : componentFilter;

  const floorOptions = [
    { value: "all", label: "All floors" },
    ...[
      ...new Map(
        localSchedule.allItems.map((item) => {
          const f = getFloor(item.unitNumber);
          return [f, { value: f, label: `Floor ${f}` }];
        })
      ).values(),
    ].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true })),
  ];

  const sortFieldOptions = Object.entries(SORT_FIELD_LABELS).map(([value, label]) => ({ value, label }));

  function openSortModal() {
    setDraftSortLevels(sortLevels);
    setSortModalOpen(true);
  }

  function applySort() {
    setSortLevels(draftSortLevels);
    setEzSort(null);
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


  // Flatten to per-bucket window list, with optional multi-level sort
  const filteredBuckets = localSchedule.buckets
    .map((bucket) => {
      const windows: ManufacturingWindowItem[] = [];
      for (const unit of bucket.units) {
        for (const group of unit.blindTypeGroups) {
          for (const item of group.windows) {
            if (buildingFilter.length > 0 && !buildingFilter.includes(item.buildingId)) continue;
            if (floorFilter.length > 0 && !floorFilter.includes(getFloor(item.unitNumber))) continue;
            if (installDates.length > 0) {
              const wantsNotSet = installDates.includes(NOT_SET_SENTINEL);
              const specificDates = installDates.filter((d) => d !== NOT_SET_SENTINEL);
              const matchesNotSet = wantsNotSet && item.installationDate == null;
              const matchesDate = item.installationDate != null && specificDates.includes(item.installationDate);
              if (!matchesNotSet && !matchesDate) continue;
            }
            if (completionDates.length > 0) {
              const ts = getCompletionTimestamp(item, role);
              if (!ts || !completionDates.includes(ts.slice(0, 10))) continue;
            }
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
        // Pin true issue/returned items at the very top (priority 0),
        // then sort ALL remaining items together as one unified group.
        // Splitting by sub-priorities (1, 2, 3…) would fragment items of the
        // same blind type across groups, breaking e.g. "sort by Fabric Type".
        const isIssue = (w: ManufacturingWindowItem) => isReturnedToRole(w, role) || w.issueStatus === "open";
        const issues = windows.filter(isIssue);
        const rest   = windows.filter((w) => !isIssue(w));
        windows.length = 0;
        windows.push(...issues, ...multiLevelSort(rest, sortLevels, role));
      } else {
        windows.sort((a, b) => {
          const pa = getWindowPriority(role, a);
          const pb = getWindowPriority(role, b);
          if (pa !== pb) return pa - pb;
          const buildingCmp = (a.buildingName ?? "").localeCompare(b.buildingName ?? "");
          if (buildingCmp !== 0) return buildingCmp;
          const fa = getFloor(a.unitNumber);
          const fb = getFloor(b.unitNumber);
          const fan = Number(fa);
          const fbn = Number(fb);
          if (Number.isFinite(fan) && Number.isFinite(fbn) && fan !== fbn) return fan - fbn;
          if (fa !== fb) return fa.localeCompare(fb, undefined, { numeric: true });
          return String(a.unitNumber ?? "").localeCompare(String(b.unitNumber ?? ""), undefined, { numeric: true });
        });
      }

      return { ...bucket, windows, scheduledCount: windows.length };
    })
    .filter((bucket) => bucket.windows.length > 0)
    .sort((a, b) => {
      const da = a.date ?? "9999-99-99";
      const db = b.date ?? "9999-99-99";
      return da.localeCompare(db);
    });

  const maxVisibleItems = displayLimit === "all" ? Infinity : Number(displayLimit);
  const visibleBuckets = filteredBuckets.reduce<(typeof filteredBuckets)[number][]>((acc, bucket) => {
    const usedCount = acc.reduce((sum, entry) => sum + entry.windows.length, 0);
    const remainingVisibleItems = maxVisibleItems - usedCount;
    if (remainingVisibleItems <= 0) return acc;

    const windows = bucket.windows.slice(0, remainingVisibleItems);
    if (windows.length === 0) return acc;

    acc.push({ ...bucket, windows, scheduledCount: windows.length });
    return acc;
  }, []);

  const selectedPrintableIds = visibleBuckets
    .filter((b) => selectedBucketKeys.has(getBucketKey(b)))
    .flatMap((b) => b.windows.filter((w) => w.productionStatus === "pending").map((w) => w.windowId));

  const handlePrint = () => {
    if (selectedPrintableIds.length === 0) return;

    const params = new URLSearchParams({
      ids: selectedPrintableIds.join(","),
      labelMode: printLabelMode,
    });
    if (skipAlreadyPrinted) params.set("skipPrinted", "1");
    const url = `/cutter/queue/print?${params.toString()}`;
    window.open(url, "_blank");
    setPrintModalOpen(false);
  };

  function buildFilterParts() {
    const filterParts: string[] = [];
    if (buildingFilter.length > 0) {
      const names = buildingFilter.map((id) => buildingOptions.find((o) => o.value === id)?.label ?? id).join(", ");
      filterParts.push(`Building: ${names}`);
    }
    if (floorFilter.length > 0) filterParts.push(`Floor: ${floorFilter.join(", ")}`);
    if (installDates.length > 0) {
      const formatted = installDates.map((d) => {
        const [y, m, day] = d.split("-").map(Number);
        return new Date(y, m - 1, day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
      });
      filterParts.push(`Install: ${formatted.join(", ")}`);
    }
    if (statusFilters.length > 0) {
      const labels = statusFilters.map((s) => queueStatusOptions.find((o) => o.value === s)?.label ?? s).join(", ");
      filterParts.push(`Status: ${labels}`);
    }
    if (fabricTypeFilter.length > 0) {
      const labels = fabricTypeFilter.map((v) => fabricTypeOptions.find((o) => o.value === v)?.label ?? v).join(", ");
      filterParts.push(`Fabric: ${labels}`);
    }
    if (componentFilter !== "all") {
      const label = componentOptions.find((o) => o.value === componentFilter)?.label ?? componentFilter;
      filterParts.push(`Component: ${label}`);
    }
    return filterParts;
  }

  function handleDatePickerConfirm() {
    setDatePickerOpen(false);
    if (printAction === "list") {
      const ids = visibleBuckets
        .filter((b) => selectedBucketKeys.has(getBucketKey(b)))
        .flatMap((b) => b.windows.map((w) => w.windowId));
      if (ids.length === 0) return;
      const filterParts = buildFilterParts();
      const sortSummary = sortLevels.length > 0
        ? `Sorted by: ${sortLevels.map((l) => `${SORT_FIELD_LABELS[l.field]} ${l.direction === "asc" ? "↑" : "↓"}`).join(", ")}`
        : "";
      const urlParams = new URLSearchParams();
      urlParams.set("ids", ids.join(","));
      if (filterParts.length > 0) urlParams.set("f", filterParts.join(" • "));
      if (sortSummary) urlParams.set("s", sortSummary);
      window.open(`/cutter/queue/print-list?${urlParams}`, "_blank");
    } else {
      setPrintModalOpen(true);
    }
  }

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
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (visibleBuckets.length === 0) return;
                  setSelectedBucketKeys(new Set(visibleBuckets.map(getBucketKey)));
                  setPrintAction("list");
                  setDatePickerOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[12px] font-semibold text-secondary transition-colors hover:bg-surface"
              >
                <Printer size={15} />
                Print list
              </button>
              <button
                type="button"
                onClick={() => {
                  if (visibleBuckets.length === 0) return;
                  setSelectedBucketKeys(new Set(visibleBuckets.map(getBucketKey)));
                  setPrintAction("labels");
                  setPrintLabelMode("manufacturing");
                  setDatePickerOpen(true);
                }}
                className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2 text-[12px] font-semibold text-secondary transition-colors hover:bg-surface"
              >
                <Printer size={15} />
                Print labels
              </button>
            </div>
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
          {/* Sort button — first */}
          <button
            type="button"
            id="queue-sort-button"
            onClick={openSortModal}
            className={[
              "flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-all",
              activeSortCount > 0 && ezSort == null
                ? "border-accent bg-accent text-white"
                : "border-border bg-card text-secondary hover:border-zinc-300",
            ].join(" ")}
          >
            <SortAscending size={13} weight="bold" />
            {activeSortCount > 0 && ezSort == null ? `Sort (${activeSortCount})` : "Sort"}
          </button>
          {/* EZ Sort button */}
          <button
            type="button"
            id="queue-ez-sort-button"
            onClick={() => setEzSortModalOpen(true)}
            className={[
              "flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-all",
              ezSort != null
                ? "border-accent bg-accent text-white"
                : "border-border bg-card text-secondary hover:border-zinc-300",
            ].join(" ")}
          >
            {ezSort === "list_packaging"
              ? "EZ: List + Pkg"
              : ezSort === "manufacturing"
              ? "EZ: Mfg Labels"
              : "EZ Sort"}
          </button>
          {role === "cutter" && (
            <FilterDropdown
              label="Component"
              value={componentFilter}
              options={componentOptions}
              onChange={(value) => setComponentFilter(value as ComponentFilter)}
            />
          )}
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
          <InstallDateCalendarFilter
            selectedDates={installDates}
            onChange={setInstallDates}
            availableDates={availableInstallDates}
            showNotSet
          />
          <InstallDateCalendarFilter
            label="Completion Date"
            selectedDates={completionDates}
            onChange={setCompletionDates}
            availableDates={availableCompletionDates}
          />
          <FilterDropdown
            multiple
            label="Queue State"
            values={statusFilters}
            options={queueStatusOptions}
            onChange={(values) => setStatusFilters(values as QueueStatusFilter[])}
          />
          <FilterDropdown
            label="Units"
            value={displayLimit}
            options={displayLimitOptions}
            onChange={(value) => setDisplayLimit(value as DisplayLimit)}
          />
          <FilterDropdown
            multiple
            label="Fabric Type"
            values={fabricTypeFilter}
            options={fabricTypeOptions}
            onChange={setFabricTypeFilter}
          />
          {(activeFilterCount > 0 || activeSortCount > 0 || ezSort != null) && (
            <button
              type="button"
              onClick={() => {
                setBuildingFilter([]);
                setFloorFilter([]);
                setInstallDates([]);
                setCompletionDates([]);
                setStatusFilters([]);
                setFabricTypeFilter([]);
                setComponentFilter("all");
                setDisplayLimit("all");
                setSortLevels([]);
                setEzSort(null);
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
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                              <p className="text-[11px] font-medium text-secondary">
                                Unit {item.unitNumber} · {item.buildingName}
                              </p>
                              {unitLabelPrintedFlags.get(item.unitId)?.mfg && (
                                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[9px] font-semibold text-zinc-700 border border-zinc-300">
                                  MFG labels printed
                                </span>
                              )}
                              {unitLabelPrintedFlags.get(item.unitId)?.pkg && (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-semibold text-amber-700 border border-amber-200">
                                  PKG labels printed
                                </span>
                              )}
                            </div>
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
                            highlightSection={highlightSection}
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
                                    label="Move 1 day back"
                                    tone="secondary"
                                    busy={busy}
                                    onClick={() => handleMove(item, "earlier")}
                                  />
                                  <ActionButton
                                    label="Move 1 day forward"
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
                                    label="Move 1 day back"
                                    tone="secondary"
                                    busy={false}
                                    disabled
                                    onClick={() => undefined}
                                  />
                                  <ActionButton
                                    label="Move 1 day forward"
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
                                  label="Move 1 day back"
                                  tone="secondary"
                                  busy={busy}
                                  disabled={item.productionStatus !== "cut"}
                                  onClick={() => handleMove(item, "earlier")}
                                />
                                <ActionButton
                                  label="Move 1 day forward"
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
                                  label="Move 1 day back"
                                  tone="secondary"
                                  busy={busy}
                                  disabled={item.productionStatus !== "assembled"}
                                  onClick={() => handleMove(item, "earlier")}
                                />
                                <ActionButton
                                  label="Move 1 day forward"
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
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm pb-16 sm:pb-0 sm:items-center"
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

      {ezSortModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm pb-16 sm:pb-0 sm:items-center"
          onClick={() => setEzSortModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-[var(--radius-xl)] border border-border bg-card p-6 pb-10 shadow-xl sm:rounded-[var(--radius-xl)] sm:pb-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">EZ Sort</h2>
              <button
                type="button"
                onClick={() => setEzSortModalOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-tertiary hover:bg-surface"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <p className="mb-4 text-[12px] text-tertiary">
              Apply a preset sort within each day bucket.
            </p>
            <div className="space-y-2">
              {(
                [
                  {
                    value: "list_packaging" as const,
                    label: "List + Packaging Labels",
                    description: "Building → Unit → Window label (W1, W2…)",
                  },
                  {
                    value: "manufacturing" as const,
                    label: "Manufacturing Labels",
                    description: "Fabric type → Window width (widest first)",
                  },
                ] as const
              ).map((option) => {
                const checked = ezSort === option.value;
                return (
                  <label
                    key={option.value}
                    className={[
                      "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                      checked ? "border-accent bg-accent/5" : "border-border hover:bg-surface",
                    ].join(" ")}
                  >
                    <input
                      type="radio"
                      name="ez-sort-option"
                      checked={checked}
                      onChange={() => {
                        setEzSort(option.value);
                        if (option.value === "list_packaging") {
                          setSortLevels([
                            { field: "buildingName", direction: "asc" },
                            { field: "unitNumber", direction: "asc" },
                            { field: "label", direction: "asc" },
                          ]);
                        } else {
                          setSortLevels([
                            { field: "blindType", direction: "asc" },
                            { field: "windowWidth", direction: "desc" },
                          ]);
                        }
                        setEzSortModalOpen(false);
                      }}
                      className="mt-0.5 h-4 w-4 accent-accent"
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px] font-medium text-foreground">{option.label}</span>
                      <p className="mt-1 text-[12px] text-tertiary">{option.description}</p>
                    </div>
                  </label>
                );
              })}
            </div>
            {ezSort != null && (
              <button
                type="button"
                onClick={() => {
                  setEzSort(null);
                  setSortLevels([]);
                  setEzSortModalOpen(false);
                }}
                className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-2.5 text-[13px] font-semibold text-red-600 hover:bg-red-100"
              >
                <Trash size={13} />
                Clear EZ Sort
              </button>
            )}
            <button
              type="button"
              onClick={() => setEzSortModalOpen(false)}
              className="mt-2 w-full rounded-xl border border-border bg-card py-2.5 text-[13px] font-semibold text-secondary hover:bg-surface"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {datePickerOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm pb-16 sm:pb-0 sm:items-center"
          onClick={() => setDatePickerOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-[var(--radius-xl)] border border-border bg-card p-6 pb-10 shadow-xl sm:rounded-[var(--radius-xl)] sm:pb-6 max-h-[85dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-foreground">Select days to print</h2>
              <button
                type="button"
                onClick={() => setDatePickerOpen(false)}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-tertiary hover:bg-surface"
              >
                <X size={14} weight="bold" />
              </button>
            </div>
            <p className="mb-3 text-[12px] text-tertiary">
              Choose which days to include in the {printAction === "list" ? "print list" : "labels"}.
            </p>
            <div className="mb-3 flex gap-3">
              <button
                type="button"
                onClick={() => setSelectedBucketKeys(new Set(visibleBuckets.map(getBucketKey)))}
                className="text-[12px] font-medium text-accent hover:underline"
              >
                Select all
              </button>
              <button
                type="button"
                onClick={() => setSelectedBucketKeys(new Set())}
                className="text-[12px] font-medium text-secondary hover:underline"
              >
                Deselect all
              </button>
            </div>
            <div className="space-y-2">
              {visibleBuckets.length === 0 ? (
                <p className="text-[12px] text-tertiary italic">No items in queue.</p>
              ) : (
                visibleBuckets.map((bucket) => {
                  const key = getBucketKey(bucket);
                  const checked = selectedBucketKeys.has(key);
                  const dayParts = getBucketDayParts(bucket.date);
                  const dayDisplay = dayParts
                    ? `${dayParts.dayLabel.toUpperCase()} ${dayParts.dayNumber}`
                    : null;
                  const isSpecial = bucket.date === null;
                  return (
                    <label
                      key={key}
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors",
                        checked ? "border-accent bg-accent/5" : "border-border hover:bg-surface",
                      ].join(" ")}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setSelectedBucketKeys((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded accent-accent flex-shrink-0"
                      />
                      <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                        <div className="min-w-0">
                          {isSpecial ? (
                            <span className="text-[13px] font-medium text-foreground">{bucket.label}</span>
                          ) : (
                            <span className="text-[13px] font-medium text-foreground">
                              <span className="font-bold">{dayDisplay}</span>
                              {bucket.label !== bucket.date && (
                                <span className="ml-1.5 text-tertiary font-normal">· {bucket.label}</span>
                              )}
                            </span>
                          )}
                        </div>
                        <span className="flex-shrink-0 text-[12px] text-tertiary">
                          {bucket.windows.length} blind{bucket.windows.length === 1 ? "" : "s"}
                        </span>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
            <div className="mt-5 flex gap-2.5">
              <button
                type="button"
                onClick={() => setDatePickerOpen(false)}
                className="flex-1 rounded-xl border border-border bg-card py-2.5 text-[13px] font-semibold text-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={selectedBucketKeys.size === 0}
                onClick={handleDatePickerConfirm}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent py-2.5 text-[13px] font-semibold text-white disabled:opacity-40"
              >
                <Printer size={14} />
                {printAction === "list" ? "Print" : "Next"}
              </button>
            </div>
          </div>
        </div>
      )}

      {printModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm pb-16 sm:pb-0 sm:items-center"
          onClick={() => setPrintModalOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-t-[var(--radius-xl)] border border-border bg-card p-6 pb-10 shadow-xl sm:rounded-[var(--radius-xl)] sm:pb-6 max-h-[85dvh] min-h-[280px] overflow-y-auto"
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
              Choose which label type to print. Only selected-day uncut blinds are included.
            </p>
            <div className="space-y-2">
              {selectedPrintableIds.length === 0 ? (
                <p className="text-[12px] text-tertiary italic">No uncut blinds found for selected days.</p>
              ) : (
                <>
                  {[
                    {
                      value: "manufacturing",
                      label: "Manufacturing",
                      description: "Print 1 manufacturing label per blind.",
                    },
                    {
                      value: "packaging",
                      label: "Packaging",
                      description: "Print 1 packaging label per blind.",
                    },
                    {
                      value: "both",
                      label: "Both",
                      description: "Print manufacturing then packaging labels for each blind.",
                    },
                  ].map((option) => {
                    const checked = printLabelMode === option.value;
                    return (
                      <label
                        key={option.value}
                        className={[
                          "flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition-colors",
                          checked ? "border-accent bg-accent/5" : "border-border hover:bg-surface",
                        ].join(" ")}
                      >
                        <input
                          type="radio"
                          name="print-label-mode"
                          checked={checked}
                          onChange={() => setPrintLabelMode(option.value as PrintLabelMode)}
                          className="mt-0.5 h-4 w-4 accent-accent"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[13px] font-medium text-foreground">{option.label}</span>
                            <span className="text-[12px] text-tertiary">
                              {option.value === "both" ? selectedPrintableIds.length * 2 : selectedPrintableIds.length} label{(option.value === "both" ? selectedPrintableIds.length * 2 : selectedPrintableIds.length) === 1 ? "" : "s"}
                            </span>
                          </div>
                          <p className="mt-1 text-[12px] text-tertiary">{option.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </>
              )}
            </div>
            {selectedPrintableIds.length > 0 && (
              <label className="mt-4 flex items-center gap-2 text-[12px] text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={skipAlreadyPrinted}
                  onChange={(e) => setSkipAlreadyPrinted(e.target.checked)}
                  className="h-4 w-4 accent-accent"
                />
                Skip blinds whose {printLabelMode === "both" ? "manufacturing or packaging" : printLabelMode} label was already printed
              </label>
            )}
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
                disabled={selectedPrintableIds.length === 0}
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
