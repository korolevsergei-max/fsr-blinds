import { getFloor } from "@/lib/app-dataset";
import type { CutterUnitGroup } from "@/components/manufacturing/cutter-unit-card";

export type CutterUnitSortField =
  | "clientName"
  | "buildingName"
  | "unitNumber"
  | "floor"
  | "measurementDate"
  | "installationDate"
  | "completeByDate"
  | "productionEnteredAt";

export type CutterUnitSortDirection = "asc" | "desc";

export type CutterUnitSortLevel = {
  field: CutterUnitSortField;
  direction: CutterUnitSortDirection;
};

export const CUTTER_UNIT_SORT_FIELD_LABELS: Record<CutterUnitSortField, string> = {
  clientName: "Client",
  buildingName: "Building",
  unitNumber: "Unit Number",
  floor: "Floor",
  measurementDate: "Measurement Date",
  installationDate: "Install Date",
  completeByDate: "Complete By",
  productionEnteredAt: "Production Entered",
};

function getSortValue(
  group: CutterUnitGroup,
  field: CutterUnitSortField
): string | number | null {
  switch (field) {
    case "clientName":
      return group.clientName ?? null;
    case "buildingName":
      return group.buildingName ?? null;
    case "unitNumber":
      return group.unitNumber ?? null;
    case "floor": {
      const f = getFloor(group.unitNumber);
      const n = Number(f);
      return Number.isFinite(n) ? n : f;
    }
    case "measurementDate":
      return group.allMeasuredAt ?? null;
    case "installationDate":
      return group.installationDate ?? null;
    case "completeByDate":
      return group.completeByDate ?? null;
    case "productionEnteredAt":
      return group.productionEnteredAt ?? null;
  }
}

export function sortCutterUnitGroups(
  groups: CutterUnitGroup[],
  levels: CutterUnitSortLevel[]
): CutterUnitGroup[] {
  if (levels.length === 0) return groups;
  return [...groups].sort((a, b) => {
    for (const level of levels) {
      const va = getSortValue(a, level.field);
      const vb = getSortValue(b, level.field);
      if (va == null && vb == null) continue;
      if (va == null) return 1;
      if (vb == null) return -1;
      let cmp: number;
      if (typeof va === "number" && typeof vb === "number") {
        cmp = va - vb;
      } else {
        cmp = String(va).localeCompare(String(vb), undefined, { numeric: true });
      }
      if (cmp !== 0) return level.direction === "asc" ? cmp : -cmp;
    }
    return 0;
  });
}
