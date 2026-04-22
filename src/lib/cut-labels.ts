import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";

export type LabelMode = "manufacturing" | "packaging" | "both";
export type LabelKind = Exclude<LabelMode, "both">;

export type PrintableLabelItem = {
  key: string;
  item: ManufacturingWindowItem;
  kind: LabelKind;
};

export function parseLabelMode(raw: string | undefined): LabelMode {
  if (raw === "manufacturing" || raw === "packaging" || raw === "both") {
    return raw;
  }
  return "manufacturing";
}

export function buildPrintableLabelItems(
  items: ManufacturingWindowItem[],
  mode: LabelMode
): PrintableLabelItem[] {
  if (mode === "both") {
    return items.flatMap((item) => [
      { key: `${item.windowId}:manufacturing`, item, kind: "manufacturing" as const },
      { key: `${item.windowId}:packaging`, item, kind: "packaging" as const },
    ]);
  }

  return items.map((item) => ({
    key: `${item.windowId}:${mode}`,
    item,
    kind: mode,
  }));
}

export function packPrintableLabelItems(
  labels: PrintableLabelItem[],
  pageSize = 3
): PrintableLabelItem[][] {
  const groups: PrintableLabelItem[][] = [];

  for (let i = 0; i < labels.length; i += pageSize) {
    groups.push(labels.slice(i, i + pageSize));
  }

  return groups;
}
