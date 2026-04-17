import type { BlindType, ChainSide, FabricAdjustmentSide, WandChain, WindowInstallation } from "@/lib/types";

export interface ManufacturingSummaryProps {
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

function fmt(n: number): string {
  return `${parseFloat(n.toFixed(4))}"`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[11px] text-zinc-500 shrink-0">{label}</span>
      <span className="text-[11px] font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-zinc-100" />;
}

export function ManufacturingSummaryCard({
  width,
  height,
  depth,
  windowInstallation,
  wandChain,
  fabricAdjustmentSide,
  fabricAdjustmentInches,
  blindType,
  chainSide,
}: ManufacturingSummaryProps) {
  const hasMeasurements = width != null;

  const fabricMachineWidth =
    width != null
      ? fabricAdjustmentSide !== "none" && fabricAdjustmentInches != null
        ? width - fabricAdjustmentInches
        : width
      : null;

  const fabricImpliedPostCut =
    fabricMachineWidth != null ? fabricMachineWidth - 1.375 : null;

  const fabricAdjustmentLabel =
    fabricAdjustmentSide === "none"
      ? "None"
      : fabricAdjustmentInches != null
        ? `${fabricAdjustmentSide.charAt(0).toUpperCase() + fabricAdjustmentSide.slice(1)}: ${fabricAdjustmentInches}"`
        : fabricAdjustmentSide.charAt(0).toUpperCase() + fabricAdjustmentSide.slice(1);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 space-y-2">
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.1em]">
        Summary for Manufacturing
      </p>

      {!hasMeasurements ? (
        <p className="text-[11px] text-zinc-400 italic">Enter window measurements above to see calculations.</p>
      ) : (
        <>
          {/* Window measurements */}
          <Row
            label="Window W × H"
            value={`${fmt(width!)} × ${height != null ? fmt(height) : "—"}${depth != null ? ` × ${fmt(depth)}` : ""}`}
          />

          <Divider />

          {/* Fabric */}
          <Row
            label="Fabric adj."
            value={fabricAdjustmentLabel}
          />
          <Row
            label="Fabric width (machine)"
            value={fabricMachineWidth != null ? fmt(fabricMachineWidth) : "—"}
          />
          <Row
            label="Fabric width (post-cut)"
            value={fabricImpliedPostCut != null ? fmt(fabricImpliedPostCut) : "—"}
          />

          <Divider />

          {/* Valance & tube */}
          <Row label="Valance width" value={fmt(width! - 0.0625)} />
          <Row label="Tube width" value={fmt(width! - 1.375)} />

          <Divider />

          {/* Other specs */}
          <Row
            label="Wand & chain"
            value={wandChain != null ? `${wandChain}"` : "Not set"}
          />
          <Row
            label="Window installation"
            value={windowInstallation === "inside" ? "Inside" : "Outside"}
          />
          <Row
            label="Blind type"
            value={blindType === "blackout" ? "Blackout" : "Screen"}
          />
          <Row
            label="Chain side"
            value={
              chainSide === "left"
                ? "← Left"
                : chainSide === "right"
                  ? "Right →"
                  : "Not set"
            }
          />
        </>
      )}
    </div>
  );
}
