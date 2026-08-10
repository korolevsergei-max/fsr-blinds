import type { BlindType, ChainSide, FabricAdjustmentSide, WandChain, WindowInstallation } from "@/lib/types";

export interface ManufacturingSummaryInput {
  width: number | null;
  height: number | null;
  depth: number | null;
  windowInstallation: WindowInstallation;
  wandChain: WandChain | null;
  fabricAdjustmentSide: FabricAdjustmentSide;
  fabricAdjustmentInches: number | null;
  blindType: BlindType;
  chainSide: ChainSide | null;
}

export interface ManufacturingSummaryRow {
  label: string;
  value: string;
  /**
   * Decimal inches behind `value`, on the rows that are a single derived
   * measurement. Consumers that print a different notation — the subcontractor
   * sheet prints mixed fractions — read this instead of re-deriving (or worse,
   * parsing back out of) the formatted string.
   */
  inches?: number;
}

export interface ManufacturingSummary {
  hasMeasurements: boolean;
  rows: ManufacturingSummaryRow[];
}

function fmt(n: number): string {
  return `${parseFloat(n.toFixed(4))}"`;
}

export function computeManufacturingSummary(input: ManufacturingSummaryInput): ManufacturingSummary {
  const { width, height, depth, windowInstallation, wandChain, fabricAdjustmentSide, fabricAdjustmentInches, blindType, chainSide } = input;

  if (width == null) {
    return { hasMeasurements: false, rows: [] };
  }

  const fabricMachineWidth =
    fabricAdjustmentSide !== "none" && fabricAdjustmentInches != null
      ? width - fabricAdjustmentInches
      : width;

  const fabricPostCut = fabricMachineWidth - 1.375;

  const fabricAdjLabel =
    fabricAdjustmentSide === "none"
      ? "None"
      : fabricAdjustmentInches != null
        ? `${fabricAdjustmentSide.charAt(0).toUpperCase() + fabricAdjustmentSide.slice(1)}: ${fabricAdjustmentInches}"`
        : fabricAdjustmentSide.charAt(0).toUpperCase() + fabricAdjustmentSide.slice(1);

  return {
    hasMeasurements: true,
    rows: [
      {
        label: "Window W × H",
        value: `${fmt(width)} × ${height != null ? fmt(height) : "—"}${depth != null ? ` × ${fmt(depth)}` : ""}`,
      },
      { label: "Fabric adj.", value: fabricAdjLabel },
      { label: "Fabric width (machine)", value: fmt(fabricMachineWidth), inches: fabricMachineWidth },
      { label: "Fabric width (post-cut)", value: fmt(fabricPostCut), inches: fabricPostCut },
      { label: "Valance width", value: fmt(width - 0.0625), inches: width - 0.0625 },
      { label: "Tube width", value: fmt(width - 1.375), inches: width - 1.375 },
      { label: "Bottom rail", value: fmt(fabricPostCut), inches: fabricPostCut },
      { label: "Wand & chain", value: wandChain != null ? `${wandChain}"` : "Not set" },
      { label: "Window installation", value: windowInstallation === "inside" ? "Inside" : "Outside" },
      { label: "Blind type", value: blindType === "blackout" ? "Blackout" : "Screen" },
      {
        label: "Chain side",
        value: chainSide === "left" ? "← Left" : chainSide === "right" ? "Right →" : "Not set",
      },
    ],
  };
}
