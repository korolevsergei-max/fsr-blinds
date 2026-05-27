import type {
  BlindType,
  ChainSide,
  FabricAdjustmentSide,
  ManufacturingCalendarOverride,
  ManufacturingIssueStatus,
  ManufacturingSettings,
  ProductionStatus,
  WandChain,
  WindowInstallation,
  WindowManufacturingEscalation,
} from "./types.ts";
import { addWorkingDays } from "./manufacturing-calendar.ts";

export interface ManufacturingWindowItem {
  windowId: string;
  unitId: string;
  buildingId: string;
  clientId: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  completeByDate: string | null;
  targetReadyDate: string | null;
  roomName: string;
  label: string;
  blindType: BlindType;
  width: number | null;
  height: number | null;
  depth: number | null;
  notes: string;
  productionStatus: ProductionStatus;
  issueStatus: ManufacturingIssueStatus;
  issueReason: string;
  issueNotes: string;
  escalation: WindowManufacturingEscalation | null;
  latestEscalation: WindowManufacturingEscalation | null;
  escalationHistory: WindowManufacturingEscalation[];
  wasReworkInCycle: boolean;
  cutAt: string | null;
  assembledAt: string | null;
  qcApprovedAt: string | null;
  manufacturingLabelPrintedAt: string | null;
  packagingLabelPrintedAt: string | null;
  cutListPrintedAt: string | null;
  allMeasuredAt: string | null;
  productionEnteredAt: string | null;
  scheduledCutDate: string | null;
  scheduledAssemblyDate: string | null;
  scheduledQcDate: string | null;
  isScheduleLocked: boolean;
  overCapacityOverride: boolean;
  windowInstallation: WindowInstallation;
  wandChain: WandChain | null;
  fabricAdjustmentSide: FabricAdjustmentSide;
  fabricAdjustmentInches: number | null;
  chainSide: ChainSide | null;
}

export interface ManufacturingUnitCard {
  unitId: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  completeByDate: string | null;
  scheduledCount: number;
  blindTypeGroups: Array<{
    blindType: BlindType;
    windows: ManufacturingWindowItem[];
  }>;
}

export interface ManufacturingDayBucket {
  date: string | null;
  label: string;
  capacity: number;
  scheduledCount: number;
  isOverCapacity: boolean;
  units: ManufacturingUnitCard[];
}

export interface ManufacturingRoleSchedule {
  settings: ManufacturingSettings;
  currentWorkDate: string;
  todayCount: number;
  tomorrowCount: number;
  upcomingCount: number;
  issueCount: number;
  overdueCount: number;
  unscheduledCount: number;
  allItems: ManufacturingWindowItem[];
  buckets: ManufacturingDayBucket[];
}

export function getQueueWindowPriority(
  role: "cutter" | "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  if (item.issueStatus === "open" && item.escalation?.targetRole === role) return 0;
  if (item.issueStatus === "open") return 0;
  if (item.wasReworkInCycle) return 0;
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
  role: "cutter" | "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  return item.issueStatus === "open" && item.escalation?.targetRole === role;
}

export function isReworkPriority(
  role: "cutter" | "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  return isReturnedToRole(role, item) || item.wasReworkInCycle;
}

export function countQueueReadyWindows(
  role: "cutter" | "assembler" | "qc",
  windows: ManufacturingWindowItem[]
) {
  return windows.filter((item) => getQueueWindowPriority(role, item) < 3).length;
}

export function sortQueueWindows(
  role: "cutter" | "assembler" | "qc",
  windows: ManufacturingWindowItem[]
) {
  return [...windows].sort((a, b) => {
    const priorityDiff = getQueueWindowPriority(role, a) - getQueueWindowPriority(role, b);
    if (priorityDiff !== 0) return priorityDiff;

    if (isReworkPriority(role, a) || isReworkPriority(role, b)) {
      const aReturned = isReturnedToRole(role, a) ? 0 : 1;
      const bReturned = isReturnedToRole(role, b) ? 0 : 1;
      if (aReturned !== bReturned) return aReturned - bReturned;

      const aOpened = a.latestEscalation?.openedAt ?? "9999-12-31T00:00:00Z";
      const bOpened = b.latestEscalation?.openedAt ?? "9999-12-31T00:00:00Z";
      if (aOpened !== bOpened) return aOpened.localeCompare(bOpened);
    }

    const readyDateA = a.targetReadyDate ?? "9999-12-31";
    const readyDateB = b.targetReadyDate ?? "9999-12-31";
    if (readyDateA !== readyDateB) return readyDateA.localeCompare(readyDateB);

    if (a.roomName !== b.roomName) return a.roomName.localeCompare(b.roomName);
    return a.label.localeCompare(b.label);
  });
}

export function buildRoleScheduleOutput(
  role: "cutter" | "assembler" | "qc",
  items: ManufacturingWindowItem[],
  allItems: ManufacturingWindowItem[],
  currentWorkDate: string,
  settings: ManufacturingSettings,
  overrides: Map<string, ManufacturingCalendarOverride>,
): ManufacturingRoleSchedule {
  const roleDateKey =
    role === "cutter"
      ? "scheduledCutDate"
      : role === "assembler"
        ? "scheduledAssemblyDate"
        : "scheduledQcDate";
  const today = currentWorkDate;
  const tomorrow = addWorkingDays(today, 1, settings, overrides);
  const capacity =
    role === "cutter"
      ? settings.cutterDailyCapacity
      : role === "assembler"
        ? settings.assemblerDailyCapacity
        : settings.qcDailyCapacity;

  const byBucket = new Map<string, ManufacturingWindowItem[]>();
  for (const item of items) {
    const rawDate = item[roleDateKey];
    const date = rawDate && rawDate < currentWorkDate ? currentWorkDate : rawDate;
    if (isReworkPriority(role, item) || item.issueStatus === "open") {
      const list = byBucket.get("__issues__") ?? [];
      list.push(item);
      byBucket.set("__issues__", list);
      continue;
    }
    if (!date) {
      const list = byBucket.get("__unscheduled__") ?? [];
      list.push(item);
      byBucket.set("__unscheduled__", list);
      continue;
    }
    const bucketList = byBucket.get(date) ?? [];
    bucketList.push(item);
    byBucket.set(date, bucketList);
  }

  // Clamp the earliest scheduled date to today so the queue always starts with
  // a "Today" bucket — cutters/assemblers should work on the next available
  // items now, not wait until the scheduled date.
  const dateBucketKeys = [...byBucket.keys()].filter((k) => !k.startsWith("__"));
  if (dateBucketKeys.length > 0) {
    const earliestKey = dateBucketKeys.sort()[0];
    if (earliestKey > currentWorkDate) {
      const earliest = byBucket.get(earliestKey)!;
      byBucket.delete(earliestKey);
      const existing = byBucket.get(currentWorkDate) ?? [];
      byBucket.set(currentWorkDate, [...existing, ...earliest]);
    }
  }

  const rankKey = (key: string): number => {
    if (key === "__issues__") return 0;
    if (key === "__unscheduled__") return 2;
    return 1;
  };
  const orderedKeys = [...byBucket.keys()].sort((a, b) => {
    const rankDiff = rankKey(a) - rankKey(b);
    if (rankDiff !== 0) return rankDiff;
    return a.localeCompare(b);
  });

  const buckets: ManufacturingDayBucket[] = orderedKeys.map((key) => {
    const bucketItems = [...(byBucket.get(key) ?? [])];
    const unitsMap = new Map<string, ManufacturingUnitCard>();
    for (const item of bucketItems) {
      const existing = unitsMap.get(item.unitId);
      if (!existing) {
        unitsMap.set(item.unitId, {
          unitId: item.unitId,
          unitNumber: item.unitNumber,
          buildingName: item.buildingName,
          clientName: item.clientName,
          installationDate: item.installationDate,
          completeByDate: item.completeByDate,
          scheduledCount: 1,
          blindTypeGroups: [{ blindType: item.blindType, windows: [item] }],
        });
        continue;
      }
      existing.scheduledCount += 1;
      const group = existing.blindTypeGroups.find((entry) => entry.blindType === item.blindType);
      if (group) {
        group.windows.push(item);
      } else {
        existing.blindTypeGroups.push({ blindType: item.blindType, windows: [item] });
      }
    }

    const units = [...unitsMap.values()]
      .map((unit) => ({
        ...unit,
        blindTypeGroups: [...unit.blindTypeGroups]
          .map((group) => ({
            ...group,
            windows: sortQueueWindows(role, group.windows),
          }))
          .sort((a, b) => {
            const aReady = countQueueReadyWindows(role, a.windows);
            const bReady = countQueueReadyWindows(role, b.windows);
            if (aReady !== bReady) return bReady - aReady;

            const aPriority = Math.min(...a.windows.map((window) => getQueueWindowPriority(role, window)));
            const bPriority = Math.min(...b.windows.map((window) => getQueueWindowPriority(role, window)));
            if (aPriority !== bPriority) return aPriority - bPriority;

            return a.blindType.localeCompare(b.blindType);
          }),
      }))
      .sort((a, b) => {
        const aWindows = a.blindTypeGroups.flatMap((group) => group.windows);
        const bWindows = b.blindTypeGroups.flatMap((group) => group.windows);
        const aPriority = Math.min(...aWindows.map((window) => getQueueWindowPriority(role, window)));
        const bPriority = Math.min(...bWindows.map((window) => getQueueWindowPriority(role, window)));
        if (aPriority !== bPriority) return aPriority - bPriority;

        const aReady = countQueueReadyWindows(role, aWindows);
        const bReady = countQueueReadyWindows(role, bWindows);
        if (aReady !== bReady) return bReady - aReady;

        const aDate = a.installationDate ?? a.completeByDate ?? "9999-12-31";
        const bDate = b.installationDate ?? b.completeByDate ?? "9999-12-31";
        if (aDate !== bDate) return aDate.localeCompare(bDate);

        return a.unitNumber.localeCompare(b.unitNumber);
      });

    return {
      date: key.startsWith("__") ? null : key,
      label:
        key === "__issues__"
          ? "Rework — priority"
          : key === "__unscheduled__"
            ? "Unscheduled"
            : key === today
              ? "Today"
              : key === tomorrow
                ? "Next Working Day"
                : key,
      capacity,
      scheduledCount: bucketItems.length,
      isOverCapacity: !key.startsWith("__") && bucketItems.length > capacity,
      units,
    };
  });

  const datedBuckets = buckets.filter((bucket) => bucket.date);
  const issueCount = byBucket.get("__issues__")?.length ?? 0;
  const unscheduledCount = byBucket.get("__unscheduled__")?.length ?? 0;
  const overdueCount = datedBuckets
    .filter((bucket) => bucket.date !== null && bucket.date < today)
    .reduce((sum, bucket) => sum + bucket.scheduledCount, 0);

  return {
    settings,
    currentWorkDate,
    todayCount: buckets.find((bucket) => bucket.date === today)?.scheduledCount ?? 0,
    tomorrowCount: buckets.find((bucket) => bucket.date === tomorrow)?.scheduledCount ?? 0,
    upcomingCount: datedBuckets
      .filter((bucket) => bucket.date !== null && bucket.date > tomorrow)
      .reduce((sum, bucket) => sum + bucket.scheduledCount, 0),
    issueCount,
    overdueCount,
    unscheduledCount,
    allItems,
    buckets,
  };
}
