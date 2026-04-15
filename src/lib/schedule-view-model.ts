import type { AppDataset } from "@/lib/app-dataset";
import type { ManufacturingRoleSchedule, ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import type { ScheduleEntry, Unit } from "@/lib/types";
import { computeUnitFlags } from "@/lib/unit-flags";
import {
  formatDateKey,
  getScopeInterval,
  isDateWithinInterval,
  matchesInstallDateFilter,
  type ScheduleInstallDateFilter,
  type ScheduleScope,
} from "@/lib/schedule-ui";

export interface InstallationSummary {
  scheduled: number;
  completed: number;
  issues: number;
}

export interface InstallationScheduleState {
  entries: ScheduleEntry[];
  entriesByDate: Map<string, ScheduleEntry[]>;
  summary: InstallationSummary;
  availableBuildingIds: string[];
}

function hasOpenManufacturingIssue(data: AppDataset, unit: Unit) {
  if (unit.manufacturingRiskFlag && unit.manufacturingRiskFlag !== "green") return true;
  return data.manufacturingEscalations.some(
    (item) => item.unitId === unit.id && item.status === "open"
  );
}

export function buildInstallationScheduleState(args: {
  data: AppDataset;
  baseEntries: ScheduleEntry[];
  today: Date;
  scope: ScheduleScope;
  weekOffset: number;
  monthOffset: number;
  clientFilter: string[];
  buildingFilter: string[];
  installDateFilter: ScheduleInstallDateFilter;
}): InstallationScheduleState {
  const {
    data,
    baseEntries,
    today,
    scope,
    weekOffset,
    monthOffset,
    clientFilter,
    buildingFilter,
    installDateFilter,
  } = args;

  const unitsById = new Map(data.units.map((unit) => [unit.id, unit]));
  const visibleInstallationEntries = baseEntries.filter((entry) => entry.taskType === "installation");

  const availableBuildingIds = [
    ...new Set(
      visibleInstallationEntries
        .map((entry) => unitsById.get(entry.unitId))
        .filter((unit): unit is Unit => Boolean(unit))
        .filter((unit) => clientFilter.length === 0 || clientFilter.includes(unit.clientId))
        .map((unit) => unit.buildingId)
    ),
  ];

  const interval = getScopeInterval(scope, today, weekOffset, monthOffset);
  const scopedEntries = visibleInstallationEntries.filter((entry) => {
    const unit = unitsById.get(entry.unitId);
    if (!unit) return false;
    if (clientFilter.length > 0 && !clientFilter.includes(unit.clientId)) return false;
    if (buildingFilter.length > 0 && !buildingFilter.includes(unit.buildingId)) return false;
    if (!matchesInstallDateFilter(unit.installationDate, installDateFilter, today)) return false;
    return isDateWithinInterval(entry.date, interval.startKey, interval.endKey);
  });

  const entriesByDate = new Map<string, ScheduleEntry[]>();
  for (const entry of scopedEntries) {
    const list = entriesByDate.get(entry.date) ?? [];
    list.push(entry);
    entriesByDate.set(entry.date, list);
  }

  const issueUnitIds = new Set<string>();
  const todayKey = formatDateKey(today);
  for (const entry of scopedEntries) {
    const unit = unitsById.get(entry.unitId);
    if (!unit) continue;
    const flags = computeUnitFlags(unit, todayKey);
    if (flags.includes("past_install_due") || hasOpenManufacturingIssue(data, unit)) {
      issueUnitIds.add(unit.id);
    }
  }

  return {
    entries: scopedEntries,
    entriesByDate,
    summary: {
      scheduled: scopedEntries.length,
      completed: scopedEntries.filter((entry) => unitsById.get(entry.unitId)?.status === "installed").length,
      issues: issueUnitIds.size,
    },
    availableBuildingIds,
  };
}

export interface ManufacturingSummary {
  scheduled: number;
  completed: number;
  issues: number;
}

export interface ManufacturingDerivedSection {
  key: string;
  label: string;
  date: string | null;
  scheduledCount: number;
  capacity: number;
  units: ManufacturingRoleSchedule["buckets"][number]["units"];
}

export interface ManufacturingScheduleState {
  availableBuildingIds: string[];
  summary: ManufacturingSummary;
  datedEntriesByDate: Map<string, ManufacturingWindowItem[]>;
  issueItems: ManufacturingWindowItem[];
  unscheduledItems: ManufacturingWindowItem[];
}

export type ManufacturingDashboardCategory =
  | "today"
  | "returned"
  | "at_risk"
  | "behind";

export interface ManufacturingDashboardUnitCard {
  unitId: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  scheduledCount: number;
  blindTypeGroups: Array<{
    blindType: ManufacturingWindowItem["blindType"];
    windows: ManufacturingWindowItem[];
  }>;
}

export interface ManufacturingDashboardSection {
  category: ManufacturingDashboardCategory;
  label: string;
  count: number;
  units: ManufacturingDashboardUnitCard[];
}

export interface ManufacturingDashboardState {
  counts: Record<ManufacturingDashboardCategory, number>;
  sections: ManufacturingDashboardSection[];
  unitsByCategory: Record<ManufacturingDashboardCategory, ManufacturingDashboardUnitCard[]>;
}

function getManufacturingRoleDate(
  item: ManufacturingWindowItem,
  role: "cutter" | "assembler" | "qc",
  currentWorkDate: string,
  earliestScheduledDate?: string
) {
  const rawDate =
    role === "cutter"
      ? item.scheduledCutDate
      : role === "assembler"
        ? item.scheduledAssemblyDate
        : item.scheduledQcDate;
  if (!rawDate) return null;
  // Clamp past dates to today. Also clamp the earliest future date bucket to
  // today so the schedule matches the role queue (which always starts at today).
  if (rawDate < currentWorkDate) return currentWorkDate;
  if (earliestScheduledDate && rawDate === earliestScheduledDate && rawDate > currentWorkDate) {
    return currentWorkDate;
  }
  return rawDate;
}

function isVisibleForManufacturingRole(
  item: ManufacturingWindowItem,
  role: "cutter" | "assembler" | "qc"
) {
  if (role === "cutter") return item.productionStatus === "pending";
  if (role === "assembler") return item.productionStatus === "cut";
  return item.productionStatus === "assembled";
}

function compareNullableDate(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function compareDashboardItems(a: ManufacturingWindowItem, b: ManufacturingWindowItem) {
  const installCompare = compareNullableDate(a.installationDate, b.installationDate);
  if (installCompare !== 0) return installCompare;

  const readyCompare = compareNullableDate(a.targetReadyDate, b.targetReadyDate);
  if (readyCompare !== 0) return readyCompare;

  const unitCompare = a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
  if (unitCompare !== 0) return unitCompare;

  const roomCompare = a.roomName.localeCompare(b.roomName, undefined, { numeric: true });
  if (roomCompare !== 0) return roomCompare;

  return a.label.localeCompare(b.label, undefined, { numeric: true });
}

function groupDashboardUnits(items: ManufacturingWindowItem[]): ManufacturingDashboardUnitCard[] {
  const unitMap = new Map<string, ManufacturingDashboardUnitCard>();

  for (const item of [...items].sort(compareDashboardItems)) {
    const existing = unitMap.get(item.unitId);
    if (!existing) {
      unitMap.set(item.unitId, {
        unitId: item.unitId,
        unitNumber: item.unitNumber,
        buildingName: item.buildingName,
        clientName: item.clientName,
        installationDate: item.installationDate,
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

  return [...unitMap.values()]
    .map((unit) => ({
      ...unit,
      blindTypeGroups: unit.blindTypeGroups
        .map((group) => ({
          ...group,
          windows: [...group.windows].sort(compareDashboardItems),
        }))
        .sort((a, b) => a.blindType.localeCompare(b.blindType)),
    }))
    .sort((a, b) => {
      const installCompare = compareNullableDate(a.installationDate, b.installationDate);
      if (installCompare !== 0) return installCompare;
      return a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
    });
}

function getDaysUntilInstall(installationDate: string | null, todayKey: string) {
  if (!installationDate) return null;
  const install = new Date(`${installationDate}T00:00:00`).getTime();
  const today = new Date(`${todayKey}T00:00:00`).getTime();
  return Math.floor((install - today) / (1000 * 60 * 60 * 24));
}

function getManufacturingDashboardCategory(
  item: ManufacturingWindowItem,
  role: "cutter" | "assembler" | "qc",
  currentWorkDate: string
): ManufacturingDashboardCategory | null {
  if (!isVisibleForManufacturingRole(item, role)) return null;

  if (item.issueStatus === "open" && item.escalation?.targetRole === role) {
    return "returned";
  }

  const daysUntilInstall = getDaysUntilInstall(item.installationDate, currentWorkDate);
  if (daysUntilInstall !== null && daysUntilInstall <= 0) {
    return "behind";
  }
  if (daysUntilInstall !== null && daysUntilInstall >= 1 && daysUntilInstall <= 3) {
    return "at_risk";
  }

  const roleDate = getManufacturingRoleDate(item, role, currentWorkDate);
  if (roleDate === currentWorkDate) {
    return "today";
  }

  return null;
}

export function buildManufacturingScheduleState(args: {
  schedule: ManufacturingRoleSchedule;
  role: "cutter" | "assembler" | "qc";
  today: Date;
  scope: ScheduleScope;
  weekOffset: number;
  monthOffset: number;
  clientFilter: string[];
  buildingFilter: string[];
  installDateFilter: ScheduleInstallDateFilter;
}): ManufacturingScheduleState {
  const {
    schedule,
    role,
    today,
    scope,
    weekOffset,
    monthOffset,
    clientFilter,
    buildingFilter,
    installDateFilter,
  } = args;

  const currentWorkDate = schedule.currentWorkDate ?? formatDateKey(today);
  const workDate = new Date(`${currentWorkDate}T00:00:00`);
  const interval = getScopeInterval(
    scope,
    scope === "today" ? workDate : today,
    weekOffset,
    monthOffset
  );

  const availableBuildingIds = [
    ...new Set(
      schedule.allItems
        .filter((item) => clientFilter.length === 0 || clientFilter.includes(item.clientId))
        .map((item) => item.buildingId)
    ),
  ];

  const filteredItems = schedule.allItems.filter((item) => {
    if (clientFilter.length > 0 && !clientFilter.includes(item.clientId)) return false;
    if (buildingFilter.length > 0 && !buildingFilter.includes(item.buildingId)) return false;
    if (!matchesInstallDateFilter(item.installationDate, installDateFilter, today)) return false;
    return true;
  });

  const roleItems = filteredItems.filter((item) => isVisibleForManufacturingRole(item, role));

  // Find the earliest scheduled date across all role-visible items. If it's in
  // the future, clamp it to today — mirroring the queue's bucket logic so that
  // the owner's schedule and the role queue always agree on which day items fall on.
  const scheduledDates = roleItems
    .filter((item) => item.issueStatus !== "open")
    .map((item) =>
      role === "cutter"
        ? item.scheduledCutDate
        : role === "assembler"
          ? item.scheduledAssemblyDate
          : item.scheduledQcDate
    )
    .filter((d): d is string => d !== null && d >= currentWorkDate);
  const earliestScheduledDate = scheduledDates.length > 0 ? scheduledDates.sort()[0] : undefined;

  const datedEntriesByDate = new Map<string, ManufacturingWindowItem[]>();
  const issueItems: ManufacturingWindowItem[] = [];
  const unscheduledItems: ManufacturingWindowItem[] = [];

  for (const item of roleItems) {
    const roleDate = getManufacturingRoleDate(item, role, currentWorkDate, earliestScheduledDate);
    const inScope = roleDate ? isDateWithinInterval(roleDate, interval.startKey, interval.endKey) : false;
    const hasIssue = item.issueStatus === "open" || Boolean(item.escalation);

    if (hasIssue) {
      if (inScope || !roleDate) issueItems.push(item);
      continue;
    }

    if (!roleDate) {
      if (scope !== "today") unscheduledItems.push(item);
      continue;
    }

    if (!inScope) continue;
    const list = datedEntriesByDate.get(roleDate) ?? [];
    list.push(item);
    datedEntriesByDate.set(roleDate, list);
  }

  const completed = filteredItems.filter((item) => {
    if (!item.qcApprovedAt) return false;
    return isDateWithinInterval(item.qcApprovedAt.slice(0, 10), interval.startKey, interval.endKey);
  }).length;

  const scheduled = roleItems.filter((item) => {
    const roleDate = getManufacturingRoleDate(item, role, currentWorkDate, earliestScheduledDate);
    return Boolean(roleDate && isDateWithinInterval(roleDate, interval.startKey, interval.endKey));
  }).length;

  return {
    availableBuildingIds,
    summary: {
      scheduled,
      completed,
      issues: issueItems.length,
    },
    datedEntriesByDate,
    issueItems,
    unscheduledItems,
  };
}

export function buildManufacturingDashboardState(args: {
  schedule: ManufacturingRoleSchedule;
  role: "cutter" | "assembler" | "qc";
  today: Date;
  clientFilter: string[];
  buildingFilter: string[];
  installDateFilter: ScheduleInstallDateFilter;
}): ManufacturingDashboardState {
  const {
    schedule,
    role,
    today,
    clientFilter,
    buildingFilter,
    installDateFilter,
  } = args;

  const currentWorkDate = schedule.currentWorkDate ?? formatDateKey(today);
  const categories: ManufacturingDashboardCategory[] = ["returned", "behind", "at_risk", "today"];
  const categoryLabels: Record<ManufacturingDashboardCategory, string> = {
    today: "Today",
    returned: "Returned",
    at_risk: "At Risk",
    behind: "Behind",
  };

  const itemsByCategory = {
    today: [] as ManufacturingWindowItem[],
    returned: [] as ManufacturingWindowItem[],
    at_risk: [] as ManufacturingWindowItem[],
    behind: [] as ManufacturingWindowItem[],
  };

  for (const item of schedule.allItems) {
    if (clientFilter.length > 0 && !clientFilter.includes(item.clientId)) continue;
    if (buildingFilter.length > 0 && !buildingFilter.includes(item.buildingId)) continue;
    if (!matchesInstallDateFilter(item.installationDate, installDateFilter, today)) continue;

    const category = getManufacturingDashboardCategory(item, role, currentWorkDate);
    if (!category) continue;
    itemsByCategory[category].push(item);
  }

  const counts = {
    today: itemsByCategory.today.length,
    returned: itemsByCategory.returned.length,
    at_risk: itemsByCategory.at_risk.length,
    behind: itemsByCategory.behind.length,
  };

  return {
    counts,
    sections: categories.map((category) => ({
      category,
      label: categoryLabels[category],
      count: counts[category],
      units: groupDashboardUnits(itemsByCategory[category]),
    })),
    unitsByCategory: {
      today: groupDashboardUnits(itemsByCategory.today),
      returned: groupDashboardUnits(itemsByCategory.returned),
      at_risk: groupDashboardUnits(itemsByCategory.at_risk),
      behind: groupDashboardUnits(itemsByCategory.behind),
    },
  };
}
