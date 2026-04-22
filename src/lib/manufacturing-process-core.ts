export type ManufacturingProcessInstallStatusFilter =
  | "all"
  | "installed"
  | "not_installed";

export interface ManufacturingProcessFilters {
  clientId: string;
  buildingId: string;
  floor: string;
  installStatus: ManufacturingProcessInstallStatusFilter;
  completeByDate: string;
}

export interface ManufacturingProcessRow {
  kind: "unit";
  unitId: string;
  clientId: string;
  clientName: string;
  buildingId: string;
  buildingName: string;
  floor: string;
  unitNumber: string;
  completeByDate: string | null;
  totalBlinds: number;
  cutCount: number;
  assembledCount: number;
  qcCount: number;
  installedCount: number;
  isInstalled: boolean;
}

export interface ManufacturingProcessFloorRow {
  kind: "floor";
  groupKey: string;
  clientId: string;
  clientName: string;
  buildingId: string;
  buildingName: string;
  floor: string;
  completeByDate: string | null;
  totalBlinds: number;
  cutCount: number;
  assembledCount: number;
  qcCount: number;
  installedCount: number;
  isInstalled: boolean;
  unitCount: number;
}

export interface ManufacturingProcessUnitInput {
  id: string;
  clientId: string;
  clientName: string;
  buildingId: string;
  buildingName: string;
  unitNumber: string;
  completeByDate: string | null;
  totalBlinds: number;
  assignedInstallerId: string | null;
}

export type ManufacturingProcessProductionStatus =
  | "pending"
  | "cut"
  | "assembled"
  | "qc_approved";

export interface ManufacturingProcessProductionInput {
  unitId: string;
  status: ManufacturingProcessProductionStatus;
}

export type ManufacturingProcessSortField =
  | "clientName"
  | "buildingName"
  | "floor"
  | "unitNumber"
  | "completeByDate"
  | "totalBlinds"
  | "cutProgress"
  | "assembledProgress"
  | "qcProgress"
  | "installProgress";

export type ManufacturingProcessSortDirection = "asc" | "desc";

export interface ManufacturingProcessSortLevel {
  field: ManufacturingProcessSortField;
  direction: ManufacturingProcessSortDirection;
}

export const MANUFACTURING_PROCESS_SORT_FIELD_LABELS: Record<
  ManufacturingProcessSortField,
  string
> = {
  clientName: "Client",
  buildingName: "Building",
  floor: "Floor",
  unitNumber: "Unit",
  completeByDate: "Due",
  totalBlinds: "Blinds",
  cutProgress: "Cut",
  assembledProgress: "Asse",
  qcProgress: "QC",
  installProgress: "Inst",
};

export type ManufacturingProcessScope =
  | { role: "owner" }
  | { role: "scheduler"; scopedUnitIds: string[] }
  | { role: "installer"; installerId: string };

function incrementCount(map: Map<string, number>, unitId: string) {
  map.set(unitId, (map.get(unitId) ?? 0) + 1);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function compareOptionalText(a: string | null, b: string | null): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return compareText(a, b);
}

function clampCompletedCount(totalBlinds: number, count: number): number {
  return Math.max(0, Math.min(totalBlinds, count));
}

function getProgressValue(completed: number, total: number) {
  return total > 0 ? completed / total : -1;
}

function getFloor(unitNumber: string): string {
  const num = parseInt(unitNumber, 10);
  if (Number.isNaN(num)) return unitNumber[0] ?? "?";
  if (num < 200) return "1";
  if (num < 300) return "2";
  if (num < 400) return "3";
  if (num < 500) return "4";
  if (num < 600) return "5";
  if (num < 700) return "6";
  if (num < 800) return "7";
  if (num < 900) return "8";
  if (num < 1000) return "9";
  return Math.floor(num / 100).toString();
}

export function compareManufacturingProcessRows(
  a: ManufacturingProcessRow,
  b: ManufacturingProcessRow
): number {
  const clientCompare = compareText(a.clientName, b.clientName);
  if (clientCompare !== 0) return clientCompare;

  const buildingCompare = compareText(a.buildingName, b.buildingName);
  if (buildingCompare !== 0) return buildingCompare;

  const floorCompare = compareText(a.floor, b.floor);
  if (floorCompare !== 0) return floorCompare;

  return compareText(a.unitNumber, b.unitNumber);
}

export function compareManufacturingProcessFloorRows(
  a: ManufacturingProcessFloorRow,
  b: ManufacturingProcessFloorRow
): number {
  const clientCompare = compareText(a.clientName, b.clientName);
  if (clientCompare !== 0) return clientCompare;

  const buildingCompare = a.buildingName.localeCompare(b.buildingName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (buildingCompare !== 0) return buildingCompare;

  const floorCompare = a.floor.localeCompare(b.floor, undefined, {
    numeric: true,
    sensitivity: "base",
  });
  if (floorCompare !== 0) return floorCompare;

  return 0;
}

function compareManufacturingProcessDisplayRows(
  a: ManufacturingProcessRow | ManufacturingProcessFloorRow,
  b: ManufacturingProcessRow | ManufacturingProcessFloorRow
): number {
  if (a.kind === "unit" && b.kind === "unit") return compareManufacturingProcessRows(a, b);
  if (a.kind === "floor" && b.kind === "floor") return compareManufacturingProcessFloorRows(a, b);

  const clientCompare = compareText(a.clientName, b.clientName);
  if (clientCompare !== 0) return clientCompare;
  const buildingCompare = compareText(a.buildingName, b.buildingName);
  if (buildingCompare !== 0) return buildingCompare;
  return compareText(a.floor, b.floor);
}

export function scopeManufacturingProcessUnits(
  units: ManufacturingProcessUnitInput[],
  scope: ManufacturingProcessScope
): ManufacturingProcessUnitInput[] {
  if (scope.role === "owner") return units;

  if (scope.role === "scheduler") {
    const allowed = new Set(scope.scopedUnitIds);
    return units.filter((unit) => allowed.has(unit.id));
  }

  return units.filter((unit) => unit.assignedInstallerId === scope.installerId);
}

export function buildManufacturingProcessRows(
  units: ManufacturingProcessUnitInput[],
  productionRows: ManufacturingProcessProductionInput[],
  installedWindowUnitIds: string[]
): ManufacturingProcessRow[] {
  const cutCountMap = new Map<string, number>();
  const assembledCountMap = new Map<string, number>();
  const qcApprovedCountMap = new Map<string, number>();
  const installedCountMap = new Map<string, number>();

  for (const row of productionRows) {
    if (row.status === "cut" || row.status === "assembled" || row.status === "qc_approved") {
      incrementCount(cutCountMap, row.unitId);
    }
    if (row.status === "assembled" || row.status === "qc_approved") {
      incrementCount(assembledCountMap, row.unitId);
    }
    if (row.status === "qc_approved") {
      incrementCount(qcApprovedCountMap, row.unitId);
    }
  }

  for (const unitId of installedWindowUnitIds) {
    incrementCount(installedCountMap, unitId);
  }

  return units
    .map((unit) => {
      const totalBlinds = unit.totalBlinds;
      const cutCount = cutCountMap.get(unit.id) ?? 0;
      const assembledCount = assembledCountMap.get(unit.id) ?? 0;
      const qcApprovedCount = qcApprovedCountMap.get(unit.id) ?? 0;
      const installedCount = installedCountMap.get(unit.id) ?? 0;
      const effectiveQcCount =
        installedCount >= totalBlinds && qcApprovedCount < totalBlinds
          ? totalBlinds
          : qcApprovedCount;
      const toInstall = Math.max(0, totalBlinds - installedCount);

      return {
        kind: "unit",
        unitId: unit.id,
        clientId: unit.clientId,
        clientName: unit.clientName,
        buildingId: unit.buildingId,
        buildingName: unit.buildingName,
        floor: getFloor(unit.unitNumber),
        unitNumber: unit.unitNumber,
        completeByDate: unit.completeByDate,
        totalBlinds,
        cutCount: clampCompletedCount(totalBlinds, cutCount),
        assembledCount: clampCompletedCount(totalBlinds, assembledCount),
        qcCount: clampCompletedCount(totalBlinds, effectiveQcCount),
        installedCount: clampCompletedCount(totalBlinds, installedCount),
        isInstalled: totalBlinds > 0 && toInstall === 0,
      } satisfies ManufacturingProcessRow;
    })
    .sort(compareManufacturingProcessRows);
}

export function aggregateManufacturingProcessRows(
  rows: ManufacturingProcessRow[]
): ManufacturingProcessFloorRow[] {
  const grouped = new Map<string, ManufacturingProcessFloorRow>();

  for (const row of rows) {
    const key = `${row.clientId}::${row.buildingId}::${row.floor}`;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, {
        kind: "floor",
        groupKey: key,
        clientId: row.clientId,
        clientName: row.clientName,
        buildingId: row.buildingId,
        buildingName: row.buildingName,
        floor: row.floor,
        completeByDate: row.completeByDate,
        totalBlinds: row.totalBlinds,
        cutCount: row.cutCount,
        assembledCount: row.assembledCount,
        qcCount: row.qcCount,
        installedCount: row.installedCount,
        isInstalled: row.isInstalled,
        unitCount: 1,
      });
      continue;
    }

    existing.totalBlinds += row.totalBlinds;
    existing.cutCount += row.cutCount;
    existing.assembledCount += row.assembledCount;
    existing.qcCount += row.qcCount;
    existing.installedCount += row.installedCount;
    existing.unitCount += 1;
    if (
      existing.completeByDate == null ||
      (row.completeByDate != null &&
        compareOptionalText(row.completeByDate, existing.completeByDate) < 0)
    ) {
      existing.completeByDate = row.completeByDate;
    }
    existing.isInstalled = existing.totalBlinds > 0 && existing.installedCount >= existing.totalBlinds;
  }

  return [...grouped.values()].sort(compareManufacturingProcessFloorRows);
}

export function filterManufacturingProcessRows(
  rows: ManufacturingProcessRow[],
  filters: ManufacturingProcessFilters
): ManufacturingProcessRow[] {
  return rows.filter((row) => {
    if (filters.clientId !== "all" && row.clientId !== filters.clientId) return false;
    if (filters.buildingId !== "all" && row.buildingId !== filters.buildingId) return false;
    if (filters.floor !== "all" && row.floor !== filters.floor) return false;
    if (filters.installStatus === "installed" && !row.isInstalled) return false;
    if (filters.installStatus === "not_installed" && row.isInstalled) return false;
    if (filters.completeByDate && row.completeByDate !== filters.completeByDate) return false;
    return true;
  });
}

export function getManufacturingProcessFilterOptions(
  rows: ManufacturingProcessRow[],
  clientId: string,
  buildingId: string
) {
  const clients = [
    ...new Map(
      rows.map((row) => [row.clientId, { value: row.clientId, label: row.clientName }])
    ).values(),
  ].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
  );

  const buildingCandidates = rows.filter((row) => clientId === "all" || row.clientId === clientId);
  const buildings = [
    ...new Map(
      buildingCandidates.map((row) => [
        row.buildingId,
        { value: row.buildingId, label: row.buildingName },
      ])
    ).values(),
  ].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true, sensitivity: "base" })
  );

  const floorCandidates = rows.filter((row) => {
    if (clientId !== "all" && row.clientId !== clientId) return false;
    if (buildingId !== "all" && row.buildingId !== buildingId) return false;
    return true;
  });
  const floors = [...new Set(floorCandidates.map((row) => row.floor))].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
  );

  return { clients, buildings, floors };
}

function compareProgress(
  aCompleted: number,
  aTotal: number,
  bCompleted: number,
  bTotal: number
): number {
  const progressCompare = getProgressValue(aCompleted, aTotal) - getProgressValue(bCompleted, bTotal);
  if (progressCompare !== 0) return progressCompare;
  const countCompare = aCompleted - bCompleted;
  if (countCompare !== 0) return countCompare;
  return aTotal - bTotal;
}

function compareByField(
  a: ManufacturingProcessRow | ManufacturingProcessFloorRow,
  b: ManufacturingProcessRow | ManufacturingProcessFloorRow,
  field: ManufacturingProcessSortField
): number {
  switch (field) {
    case "clientName":
      return compareText(a.clientName, b.clientName);
    case "buildingName":
      return compareText(a.buildingName, b.buildingName);
    case "floor":
      return compareText(a.floor, b.floor);
    case "unitNumber":
      return compareOptionalText(a.kind === "unit" ? a.unitNumber : null, b.kind === "unit" ? b.unitNumber : null);
    case "completeByDate":
      return compareOptionalText(a.completeByDate, b.completeByDate);
    case "totalBlinds":
      return a.totalBlinds - b.totalBlinds;
    case "cutProgress":
      return compareProgress(a.cutCount, a.totalBlinds, b.cutCount, b.totalBlinds);
    case "assembledProgress":
      return compareProgress(a.assembledCount, a.totalBlinds, b.assembledCount, b.totalBlinds);
    case "qcProgress":
      return compareProgress(a.qcCount, a.totalBlinds, b.qcCount, b.totalBlinds);
    case "installProgress":
      return compareProgress(a.installedCount, a.totalBlinds, b.installedCount, b.totalBlinds);
  }
}

export function sortManufacturingProcessRows<T extends ManufacturingProcessRow | ManufacturingProcessFloorRow>(
  rows: T[],
  levels: ManufacturingProcessSortLevel[]
): T[] {
  if (levels.length === 0) return rows;

  return [...rows].sort((a, b) => {
    for (const level of levels) {
      const compare = compareByField(a, b, level.field);
      if (compare !== 0) return level.direction === "asc" ? compare : -compare;
    }
    return compareManufacturingProcessDisplayRows(a, b);
  });
}
