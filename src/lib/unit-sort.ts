import { getFloor } from "@/lib/app-dataset";
import type { Unit } from "@/lib/types";

export type UnitSortField =
  | "clientName"
  | "buildingName"
  | "unitNumber"
  | "floor"
  | "measurementDate"
  | "installationDate"
  | "bracketingDate"
  | "completeByDate"
  | "status";

export type UnitSortDirection = "asc" | "desc";

export type UnitSortLevel = {
  field: UnitSortField;
  direction: UnitSortDirection;
};

export const UNIT_SORT_FIELD_LABELS: Record<UnitSortField, string> = {
  clientName: "Client Name",
  buildingName: "Building",
  unitNumber: "Unit Number",
  floor: "Floor",
  measurementDate: "Measurement Date",
  installationDate: "Installation Date",
  bracketingDate: "Bracket Date",
  completeByDate: "Complete By",
  status: "Status",
};

function getUnitSortValue(unit: Unit, field: UnitSortField): string | number | null {
  switch (field) {
    case "clientName": return unit.clientName ?? null;
    case "buildingName": return unit.buildingName ?? null;
    case "unitNumber": return unit.unitNumber ?? null;
    case "floor": {
      const f = getFloor(unit.unitNumber);
      const n = Number(f);
      return Number.isFinite(n) ? n : f;
    }
    case "measurementDate": return unit.measurementDate ?? null;
    case "installationDate": return unit.installationDate ?? null;
    case "bracketingDate": return unit.bracketingDate ?? null;
    case "completeByDate": return unit.completeByDate ?? null;
    case "status": return unit.status ?? null;
  }
}

export function sortUnits(units: Unit[], levels: UnitSortLevel[]): Unit[] {
  if (levels.length === 0) return units;
  return [...units].sort((a, b) => {
    for (const level of levels) {
      const va = getUnitSortValue(a, level.field);
      const vb = getUnitSortValue(b, level.field);
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
