import type { AppDataset } from "./app-dataset";
import { UNIT_STATUS_ORDER, type UnitStatus } from "./types.ts";

export type UnitCoverageCounts = {
  totalWindows: number;
  measuredCount: number;
  bracketedCount: number;
  manufacturedCount: number;
  installedCount: number;
  allMeasured: boolean;
  allBracketed: boolean;
  allManufactured: boolean;
  allInstalled: boolean;
};

export function deriveUnitStatusFromCounts({
  totalWindows,
  measuredCount,
  bracketedCount,
  manufacturedCount,
  installedCount,
}: Pick<
  UnitCoverageCounts,
  "totalWindows" | "measuredCount" | "bracketedCount" | "manufacturedCount" | "installedCount"
>): UnitStatus {
  if (totalWindows === 0) return "not_started";
  if (installedCount >= totalWindows) return "installed";
  if (manufacturedCount >= totalWindows) return "manufactured";
  if (bracketedCount >= totalWindows) return "bracketed";
  if (measuredCount >= totalWindows) return "measured";
  return "not_started";
}

export function getUnitCoverageFromDataset(
  data: AppDataset,
  unitId: string
): UnitCoverageCounts {
  const roomIds = new Set(
    data.rooms.filter((room) => room.unitId === unitId).map((room) => room.id)
  );
  const windows = data.windows.filter((windowItem) => roomIds.has(windowItem.roomId));
  const totalWindows = windows.length;
  const measuredCount = windows.filter((windowItem) => windowItem.measured).length;
  const bracketedCount = windows.filter((windowItem) => windowItem.bracketed).length;
  const manufacturedCount = 0;
  const installedCount = windows.filter((windowItem) => windowItem.installed).length;

  return {
    totalWindows,
    measuredCount,
    bracketedCount,
    manufacturedCount,
    installedCount,
    allMeasured: totalWindows > 0 && measuredCount >= totalWindows,
    allBracketed: totalWindows > 0 && bracketedCount >= totalWindows,
    allManufactured: false,
    allInstalled: totalWindows > 0 && installedCount >= totalWindows,
  };
}

export function reconcileUnitDerivedState(
  data: AppDataset,
  unitId: string,
  {
    photoDelta = 0,
    unitStatus,
  }: {
    photoDelta?: number;
    unitStatus?: UnitStatus | null;
  } = {}
): AppDataset {
  const rooms = data.rooms.map((room) => {
    if (room.unitId !== unitId) return room;
    const roomWindows = data.windows.filter((windowItem) => windowItem.roomId === room.id);
    return {
      ...room,
      windowCount: roomWindows.length,
      completedWindows: roomWindows.filter((windowItem) => windowItem.measured).length,
    };
  });

  const roomCount = rooms.filter((room) => room.unitId === unitId).length;
  const coverage = getUnitCoverageFromDataset({ ...data, rooms }, unitId);
  const existingUnit = data.units.find((unit) => unit.id === unitId);
  const derived = deriveUnitStatusFromCounts(coverage);
  // Client coverage has no QC data (manufacturedCount is hardcoded 0); preserve
  // cached manufactured/installed instead of letting derivation downgrade them.
  const existingStatus = existingUnit?.status as UnitStatus | undefined;
  const shouldPreserveCached =
    !unitStatus &&
    (existingStatus === "manufactured" || existingStatus === "installed") &&
    UNIT_STATUS_ORDER[derived] < UNIT_STATUS_ORDER[existingStatus];
  const status = unitStatus ?? (shouldPreserveCached ? existingStatus! : derived);

  const units = data.units.map((unit) => {
    if (unit.id !== unitId) return unit;
    return {
      ...unit,
      roomCount,
      windowCount: coverage.totalWindows,
      photosUploaded: Math.max(0, unit.photosUploaded + photoDelta),
      status,
    };
  });

  return {
    ...data,
    rooms,
    units,
  };
}
