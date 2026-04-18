import { computeManufacturingSummary } from "@/lib/manufacturing-summary";
import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import type { ManufacturingHighlightSection } from "@/components/windows/manufacturing-summary-card";

function fmtDate(date: string | null) {
  if (!date) return null;
  const d = new Date(`${date}T00:00:00`);
  return d.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" });
}

const HIGHLIGHT_BG = "#dbeafe"; // sky-100 equivalent, prints predictably

// Which summaryPairs cell each highlight section should tint.
// summaryPairs layout:
//   [0] W×H   | Bottom rail
//   [1] Fabric adj | Wand & chain
//   [2] Machine    | Window installation
//   [3] Post-cut   | Blind type
//   [4] Valance    | Tube
function isCellHighlighted(
  section: ManufacturingHighlightSection,
  pairIdx: number,
  side: "left" | "right"
) {
  if (section === "fabric") {
    return side === "left" && (pairIdx === 1 || pairIdx === 2 || pairIdx === 3);
  }
  if (section === "valance") {
    return side === "left" && pairIdx === 4;
  }
  // tube_rail → Bottom rail (pair 0, right) + Tube (pair 4, right)
  return side === "right" && (pairIdx === 0 || pairIdx === 4);
}

// Each physical Avery 2315 label: 3" wide × 2" tall
// Safety margin: 0.125" from each edge → usable: 2.75" × 1.75"
function LabelContent({
  item,
  highlightSection,
}: {
  item: ManufacturingWindowItem;
  highlightSection?: ManufacturingHighlightSection | null;
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

  const installDate = fmtDate(item.installationDate);
  const readyDate = fmtDate(item.targetReadyDate);

  // Summary rows grouped for 2-column layout: [left, right]
  const summaryPairs: [string, string][] = s.hasMeasurements ? [
    [s.rows[0].value,                               s.rows[6].value],   // W×H | wand&chain
    [`${s.rows[1].label}: ${s.rows[1].value}`,     `${s.rows[7].label}: ${s.rows[7].value}`],  // fabric adj | installation
    [`Machine: ${s.rows[2].value}`,                `${s.rows[8].label}: ${s.rows[8].value}`],  // machine | blind type
    [`Post-cut: ${s.rows[3].value}`,               `${s.rows[9].label}: ${s.rows[9].value}`],  // post-cut | chain side
    [`Valance: ${s.rows[4].value}`,                `Tube: ${s.rows[5].value}`],                // valance | tube
  ] : [];

  const base: React.CSSProperties = {
    fontFamily: "'Arial', 'Helvetica', sans-serif",
    color: "#000",
  };

  return (
    <div style={{
      ...base,
      width: "3in",
      height: "2in",
      padding: "0.125in",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      gap: "0.045in",
      overflow: "hidden",
    }}>
      {/* Header: unit + building + install date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "7.5pt", fontWeight: "700", lineHeight: 1 }}>
          Unit {item.unitNumber} · {item.buildingName}
        </span>
        {installDate && (
          <span style={{ fontSize: "6.5pt", color: "#333", lineHeight: 1 }}>
            Install {installDate}
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ borderTop: "0.75pt solid #000" }} />

      {/* Window identity */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "0.08in" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.06in", minWidth: 0 }}>
          <span style={{ fontSize: "15pt", fontWeight: "900", lineHeight: 1, flexShrink: 0 }}>{item.label}</span>
          <span style={{ fontSize: "7pt", fontWeight: "600", lineHeight: 1, whiteSpace: "nowrap" }}>{item.roomName}</span>
          <span style={{ fontSize: "7pt", fontWeight: "700", textTransform: "uppercase", lineHeight: 1, letterSpacing: "0.03em", whiteSpace: "nowrap" }}>{item.blindType}</span>
        </div>
        <span style={{ fontSize: "13pt", fontWeight: "900", lineHeight: 1, whiteSpace: "nowrap", flexShrink: 0 }}>
          {item.width ?? "—"} × {item.height ?? "—"}{item.depth != null ? ` × ${item.depth}` : ""}
        </span>
      </div>

      {/* Ready date */}
      {readyDate && (
        <div style={{ fontSize: "6.5pt", color: "#444", lineHeight: 1 }}>
          Ready by {readyDate}
        </div>
      )}

      {/* Divider */}
      <div style={{ borderTop: "0.75pt solid #000" }} />

      {/* Manufacturing summary — 2 columns */}
      {s.hasMeasurements && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.03in" }}>
          {/* W×H full width row */}
          <div style={{ display: "flex", justifyContent: "space-between", gap: "0.1in" }}>
            <span style={{ fontSize: "6.5pt", color: "#555", lineHeight: 1 }}>Window W × H</span>
            <span style={{ fontSize: "6.5pt", fontWeight: "700", lineHeight: 1 }}>{summaryPairs[0][0]}</span>
            <span
              style={{
                fontSize: "6.5pt",
                color: "#555",
                lineHeight: 1,
                marginLeft: "0.05in",
                background:
                  highlightSection && isCellHighlighted(highlightSection, 0, "right") ? HIGHLIGHT_BG : "transparent",
                padding: "0.01in 0.03in",
                borderRadius: "0.02in",
              }}
            >
              {s.rows[6].label}
            </span>
            <span
              style={{
                fontSize: "6.5pt",
                fontWeight: "700",
                lineHeight: 1,
                background:
                  highlightSection && isCellHighlighted(highlightSection, 0, "right") ? HIGHLIGHT_BG : "transparent",
                padding: "0.01in 0.03in",
                borderRadius: "0.02in",
              }}
            >
              {summaryPairs[0][1]}
            </span>
          </div>

          <div style={{ borderTop: "0.5pt solid #ccc" }} />

          {/* 2-column rows for remaining specs */}
          {summaryPairs.slice(1).map(([left, right], i) => {
            const pairIdx = i + 1;
            const leftHl = highlightSection ? isCellHighlighted(highlightSection, pairIdx, "left") : false;
            const rightHl = highlightSection ? isCellHighlighted(highlightSection, pairIdx, "right") : false;
            return (
              <div key={i} style={{ display: "flex", gap: "0.06in" }}>
                <span
                  style={{
                    fontSize: "6pt",
                    lineHeight: 1.25,
                    flex: 1,
                    borderRight: "0.5pt solid #ddd",
                    paddingRight: "0.05in",
                    background: leftHl ? HIGHLIGHT_BG : "transparent",
                    borderRadius: leftHl ? "0.02in" : undefined,
                  }}
                >
                  {left}
                </span>
                <span
                  style={{
                    fontSize: "6pt",
                    lineHeight: 1.25,
                    flex: 1,
                    background: rightHl ? HIGHLIGHT_BG : "transparent",
                    borderRadius: rightHl ? "0.02in" : undefined,
                  }}
                >
                  {right}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Label({
  item,
  highlightSection,
}: {
  item: ManufacturingWindowItem;
  highlightSection?: ManufacturingHighlightSection | null;
}) {
  return (
    <div style={{
      width: "3in",
      height: "2in",
      boxSizing: "border-box",
      flexShrink: 0,
    }}>
      <LabelContent item={item} highlightSection={highlightSection} />
    </div>
  );
}

// Sheet = one physical Avery 2315 sheet: 4" × 6"
// Labels centred horizontally with 0.5" margin each side, stacked 3-high.
// Default sheet repeats one unit 3× (one for fabric, valance, tube).
export function CutLabelSheet({ item }: { item: ManufacturingWindowItem }) {
  return (
    <div style={{
      width: "4in",
      height: "6in",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      paddingLeft: "0.5in",
      pageBreakAfter: "always",
      breakAfter: "page",
      flexShrink: 0,
    }}>
      <Label item={item} />
      <Label item={item} />
      <Label item={item} />
    </div>
  );
}

// Packed sheet used when a single component is selected: one label per unit,
// up to 3 different units packed on the same physical Avery 2315 sheet.
export function CutLabelPackedSheet({
  items,
  highlightSection,
}: {
  items: ManufacturingWindowItem[];
  highlightSection: ManufacturingHighlightSection;
}) {
  return (
    <div style={{
      width: "4in",
      height: "6in",
      boxSizing: "border-box",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-start",
      paddingLeft: "0.5in",
      pageBreakAfter: "always",
      breakAfter: "page",
      flexShrink: 0,
    }}>
      {items.map((item) => (
        <Label key={item.windowId} item={item} highlightSection={highlightSection} />
      ))}
    </div>
  );
}
