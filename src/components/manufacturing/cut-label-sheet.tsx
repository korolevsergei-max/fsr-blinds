import { computeManufacturingSummary } from "@/lib/manufacturing-summary";
import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import type { LabelKind, PrintableLabelItem } from "@/lib/cut-labels";

function fmtDate(date: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

function getLabelKindStyles(kind: LabelKind) {
  if (kind === "manufacturing") {
    return {
      text: "MANUFACTURING",
      background: "#111827",
      color: "#ffffff",
    };
  }

  return {
    text: "PACKAGING",
    background: "#d97706",
    color: "#ffffff",
  };
}

// Each physical label: 4" wide × 2" tall (2×4 Avery sheet, 10-up)
function LabelContent({
  item,
  kind,
}: {
  item: ManufacturingWindowItem;
  kind: LabelKind;
}) {
  const s = computeManufacturingSummary({
    width: item.width,
    height: item.height,
    depth: item.depth,
    windowInstallation: item.windowInstallation,
    wandChain: item.wandChain,
    fabricAdjustmentSide: item.fabricAdjustmentSide,
    fabricAdjustmentInches: item.fabricAdjustmentInches,
    blindType: item.blindType,
    chainSide: item.chainSide,
  });

  const dueDate = fmtDate(item.installationDate ?? item.completeByDate);
  const dueDatePrefix = item.installationDate ? "Install" : "Complete by";
  const kindBadge = getLabelKindStyles(kind);

  const wandText =
    item.chainSide === "left" ? "WAND L" : item.chainSide === "right" ? "WAND R" : "WAND ?";

  return (
    <div
      style={{
        fontFamily: "'Arial','Helvetica',sans-serif",
        color: "#000",
        width: "4in",
        height: "2in",
        padding: "0.1in",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        gap: "0.03in",
        overflow: "hidden",
      }}
    >
      {/* Row 1: HUGE unit number + room name (stacked) + kind badge */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "0.08in" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.01in", minWidth: 0 }}>
          <span style={{ fontSize: "20pt", fontWeight: 900, lineHeight: 1, letterSpacing: "-0.01em" }}>
            UNIT {item.unitNumber}
          </span>
          {(item.roomName || item.label) && (
            <span style={{ fontSize: "9pt", fontWeight: 800, lineHeight: 1, textTransform: "uppercase", letterSpacing: "0.03em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {item.roomName}{item.roomName && item.label ? ` - ${item.label}` : item.label}
            </span>
          )}
        </div>
        <span
          style={{
            flexShrink: 0,
            fontSize: "6.5pt",
            fontWeight: 800,
            letterSpacing: "0.06em",
            padding: "0.045in 0.06in",
            borderRadius: "999px",
            background: kindBadge.background,
            color: kindBadge.color,
          }}
        >
          {kindBadge.text}
        </span>
      </div>

      {/* Row 2: blind type — large bold */}
      <span
        style={{
          fontSize: "11pt",
          fontWeight: 800,
          lineHeight: 1,
          textTransform: "uppercase",
          letterSpacing: "0.02em",
        }}
      >
        {item.blindType}
      </span>

      {/* Row 3: W × H + boxed wand side */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "0.08in" }}>
        <span style={{ fontSize: "16pt", fontWeight: 900, lineHeight: 1 }}>
          {item.width ?? "—"} × {item.height ?? "—"}
          {item.depth != null ? ` × ${item.depth}` : ""}
        </span>
        <span
          style={{
            fontSize: "11pt",
            fontWeight: 900,
            lineHeight: 1,
            padding: "0.04in 0.08in",
            border: "1.5pt solid #000",
            borderRadius: "0.06in",
            whiteSpace: "nowrap",
          }}
        >
          {wandText}
        </span>
      </div>

      <div style={{ borderTop: "0.75pt solid #000" }} />

      {/* Row 4: building · room · window code + due date */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "0.08in", alignItems: "baseline" }}>
        <div
          style={{
            fontSize: "10pt",
            fontWeight: 800,
            lineHeight: 1.05,
            color: "#000",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {item.buildingName}
        </div>
        {dueDate && (
          <span style={{ flexShrink: 0, fontSize: "7pt", lineHeight: 1, color: "#333" }}>
            {dueDatePrefix} {dueDate}
          </span>
        )}
      </div>

      {/* Manufacturing summary block — small, 2-column grid */}
      {s.hasMeasurements && (
        <div
          style={{
            flex: 1,
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            columnGap: "0.08in",
            rowGap: "0.015in",
            fontSize: "9pt",
            lineHeight: 1.2,
            color: "#222",
          }}
        >
          <span>Machine: {s.rows[2].value}</span>
          <span>Post-cut: {s.rows[3].value}</span>
          <span>Valance: {s.rows[4].value}</span>
          <span>Tube: {s.rows[5].value}</span>
          <span>{s.rows[1].label}: {s.rows[1].value}</span>
          <span>{s.rows[7].label}: {s.rows[7].value}</span>
          <span>{s.rows[6].label}: {s.rows[6].value}</span>
          <span>{s.rows[9].label}: {s.rows[9].value}</span>
        </div>
      )}
    </div>
  );
}

function Label({
  item,
  kind,
}: {
  item: ManufacturingWindowItem;
  kind: LabelKind;
}) {
  return (
    <div style={{
      width: "4in",
      height: "2in",
      boxSizing: "border-box",
      flexShrink: 0,
    }}>
      <LabelContent item={item} kind={kind} />
    </div>
  );
}

// Sheet = 8.5" × 11" (US Letter), 2 cols × 5 rows = 10 labels per sheet.
// Label size: 4" wide × 2" tall. Margins: 0.25" L/R, 0.5" T/B.
export function CutLabelSheet({ labels }: { labels: PrintableLabelItem[] }) {
  return (
    <div style={{
      width: "8.5in",
      height: "11in",
      boxSizing: "border-box",
      display: "grid",
      gridTemplateColumns: "4in 4in",
      gridTemplateRows: "2in 2in 2in 2in 2in",
      columnGap: "0.19in",
      paddingLeft: "0",
      paddingRight: "0",
      paddingTop: "0.5in",
      paddingBottom: "0.5in",
      pageBreakAfter: "always",
      breakAfter: "page",
      flexShrink: 0,
    }}>
      {labels.map((label) => (
        <Label key={label.key} item={label.item} kind={label.kind} />
      ))}
    </div>
  );
}
