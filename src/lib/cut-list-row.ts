import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import { computeManufacturingSummary } from "@/lib/manufacturing-summary";
import { getFloor } from "@/lib/app-dataset";

// computeManufacturingSummary rows: 0=W×H, 1=FabAdj, 2=FabMachine, 3=FabPostCut,
// 4=Valance, 5=Tube, 6=BottomRail, 7=Wand, 8=WinInstall, 9=BlindType, 10=ChainSide
const SPEC_INDICES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10];

/** Same rows, as raw decimal inches — for sheets that print fractions instead. */
const MEASUREMENT_INDICES = { fabMach: 2, fabCut: 3, valance: 4, tube: 5, botRail: 6 } as const;

export interface CutListRow {
  date: string;
  building: string;
  floor: string;
  unit: string;
  returned: string;
  isReturned: boolean;
  install: string;
  room: string;
  win: string;
  type: string;
  dimensions: string;
  fabAdj: string;
  fabMach: string;
  fabCut: string;
  valance: string;
  tube: string;
  botRail: string;
  wand: string;
  installation: string;
  chain: string;
  /** Decimal inches behind the five derived spec columns; null with no measurements. */
  inches: Record<keyof typeof MEASUREMENT_INDICES, number | null>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatScheduledDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function toCutListRow(item: ManufacturingWindowItem): CutListRow {
  const summary = computeManufacturingSummary(item);
  const specValues = summary.hasMeasurements
    ? SPEC_INDICES.map((i) => summary.rows[i]?.value ?? "—")
    : SPEC_INDICES.map(() => "—");

  const isReturned = !!item.escalation;
  const returnedText = isReturned
    ? item.escalation?.reason
      ? `Yes / ${item.escalation.reason}`
      : "Yes"
    : "No";

  return {
    date: formatScheduledDate(item.scheduledCutDate),
    building: item.buildingName,
    floor: getFloor(item.unitNumber),
    unit: item.unitNumber,
    returned: returnedText,
    isReturned,
    install: formatDate(item.installationDate),
    room: item.roomName,
    win: item.label,
    type: item.blindType === "blackout" ? "Blackout" : "Screen",
    dimensions: specValues[0],
    fabAdj: specValues[1],
    fabMach: specValues[2],
    fabCut: specValues[3],
    valance: specValues[4],
    tube: specValues[5],
    botRail: specValues[6],
    wand: specValues[7],
    installation: specValues[8],
    chain: specValues[9].replace(/[←→]/g, "").trim(),
    inches: {
      fabMach: summary.rows[MEASUREMENT_INDICES.fabMach]?.inches ?? null,
      fabCut: summary.rows[MEASUREMENT_INDICES.fabCut]?.inches ?? null,
      valance: summary.rows[MEASUREMENT_INDICES.valance]?.inches ?? null,
      tube: summary.rows[MEASUREMENT_INDICES.tube]?.inches ?? null,
      botRail: summary.rows[MEASUREMENT_INDICES.botRail]?.inches ?? null,
    },
  };
}
