import { computeManufacturingSummary, type ManufacturingSummaryInput } from "@/lib/manufacturing-summary";

export type { ManufacturingSummaryInput as ManufacturingSummaryProps };

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

export function ManufacturingSummaryCard(props: ManufacturingSummaryInput) {
  const summary = computeManufacturingSummary(props);

  return (
    <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-3.5 space-y-2">
      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.1em]">
        Summary for Manufacturing
      </p>

      {!summary.hasMeasurements ? (
        <p className="text-[11px] text-zinc-400 italic">Enter window measurements above to see calculations.</p>
      ) : (
        <>
          <Row label={summary.rows[0].label} value={summary.rows[0].value} />
          <Divider />
          <Row label={summary.rows[1].label} value={summary.rows[1].value} />
          <Row label={summary.rows[2].label} value={summary.rows[2].value} />
          <Row label={summary.rows[3].label} value={summary.rows[3].value} />
          <Divider />
          <Row label={summary.rows[4].label} value={summary.rows[4].value} />
          <Row label={summary.rows[5].label} value={summary.rows[5].value} />
          <Divider />
          <Row label={summary.rows[6].label} value={summary.rows[6].value} />
          <Row label={summary.rows[7].label} value={summary.rows[7].value} />
          <Row label={summary.rows[8].label} value={summary.rows[8].value} />
          <Row label={summary.rows[9].label} value={summary.rows[9].value} />
        </>
      )}
    </div>
  );
}
