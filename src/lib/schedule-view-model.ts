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

function getManufacturingRoleDate(
  item: ManufacturingWindowItem,
  role: "cutter" | "assembler" | "qc",
  currentWorkDate: string
) {
  const rawDate =
    role === "cutter"
      ? item.scheduledCutDate
      : role === "assembler"
        ? item.scheduledAssemblyDate
        : item.scheduledQcDate;
  if (!rawDate) return null;
  return rawDate < currentWorkDate ? currentWorkDate : rawDate;
}

function isVisibleForManufacturingRole(
  item: ManufacturingWindowItem,
  role: "cutter" | "assembler" | "qc"
) {
  if (role === "cutter") return item.productionStatus === "pending";
  if (role === "assembler") return item.productionStatus === "cut";
  return item.productionStatus === "assembled";
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
  const datedEntriesByDate = new Map<string, ManufacturingWindowItem[]>();
  const issueItems: ManufacturingWindowItem[] = [];
  const unscheduledItems: ManufacturingWindowItem[] = [];

  for (const item of roleItems) {
    const roleDate = getManufacturingRoleDate(item, role, currentWorkDate);
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
    const roleDate = getManufacturingRoleDate(item, role, currentWorkDate);
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
