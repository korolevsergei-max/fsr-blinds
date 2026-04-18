import { computeManufacturingSummary, type ManufacturingSummaryInput } from "@/lib/manufacturing-summary";

export type { ManufacturingSummaryInput as ManufacturingSummaryProps };

export type ManufacturingHighlightSection = "fabric" | "valance" | "tube_rail";

// Row indices in computeManufacturingSummary().rows that each highlight covers.
const HIGHLIGHT_ROWS: Record<ManufacturingHighlightSection, Set<number>> = {
  fabric: new Set([1, 2, 3]),
  valance: new Set([4]),
  tube_rail: new Set([5, 6]),
};

function Row({ label, value, highlighted, even }: { label: string; value: string; highlighted?: boolean; even?: boolean }) {
  return (
    <div
      className={[
        "flex items-baseline justify-between gap-3 -mx-1.5 rounded-md px-1.5 py-0.5",
        highlighted
          ? "bg-sky-100/80"
          : even
          ? "bg-zinc-50"
          : "",
      ].join(" ")}
    >
      <span className="text-[11px] text-zinc-500 shrink-0">{label}</span>
      <span className="text-[11px] font-semibold text-foreground text-right">{value}</span>
    </div>
  );
}

function Divider() {
  return <div className="border-t border-zinc-100" />;
}

export function ManufacturingSummaryCard(
  props: ManufacturingSummaryInput & { highlightSection?: ManufacturingHighlightSection | null }
) {
  const { highlightSection, ...summaryInput } = props;
  const summary = computeManufacturingSummary(summaryInput);
  const hl = highlightSection ? HIGHLIGHT_ROWS[highlightSection] : null;
  const isHl = (idx: number) => Boolean(hl?.has(idx));

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 space-y-2">
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.1em]">
        Manufacturing Spec
      </p>

      {!summary.hasMeasurements ? (
        <p className="text-[11px] text-zinc-400 italic">Enter window measurements above to see calculations.</p>
      ) : (
        <>
          <Row label={summary.rows[0].label} value={summary.rows[0].value} even />
          <Divider />
          <Row label={summary.rows[1].label} value={summary.rows[1].value} highlighted={isHl(1)} />
          <Row label={summary.rows[2].label} value={summary.rows[2].value} highlighted={isHl(2)} even />
          <Row label={summary.rows[3].label} value={summary.rows[3].value} highlighted={isHl(3)} />
          <Divider />
          <Row label={summary.rows[4].label} value={summary.rows[4].value} highlighted={isHl(4)} even />
          <Row label={summary.rows[5].label} value={summary.rows[5].value} highlighted={isHl(5)} />
          <Row label={summary.rows[6].label} value={summary.rows[6].value} highlighted={isHl(6)} even />
          <Divider />
          <Row label={summary.rows[7].label} value={summary.rows[7].value} />
          <Row label={summary.rows[8].label} value={summary.rows[8].value} even />
          <Row label={summary.rows[9].label} value={summary.rows[9].value} />
          <Row label={summary.rows[10].label} value={summary.rows[10].value} even />
        </>
      )}
    </div>
  );
}
