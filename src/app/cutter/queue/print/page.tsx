import { loadWindowsForPrint } from "@/lib/manufacturing-print-data";
import type { ManufacturingHighlightSection } from "@/components/windows/manufacturing-summary-card";
import { LabelPdfClient } from "./label-pdf-client";

function parseHighlight(raw: string | undefined): ManufacturingHighlightSection | null {
  if (raw === "fabric" || raw === "valance" || raw === "tube_rail") return raw;
  return null;
}

export default async function CutterPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; component?: string }>;
}) {
  const params = await searchParams;
  const rawIds = params.ids ?? "";
  const windowIds = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const windows = await loadWindowsForPrint(windowIds);
  const highlight = parseHighlight(params.component);

  if (windows.length === 0) {
    return (
      <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif", textAlign: "center" }}>
        <p style={{ fontSize: "14pt", color: "#666" }}>No windows found for printing.</p>
      </div>
    );
  }

  const packedGroups: typeof windows[] = [];
  if (highlight) {
    for (let i = 0; i < windows.length; i += 3) {
      packedGroups.push(windows.slice(i, i + 3));
    }
  }

  return (
    <LabelPdfClient
      items={windows}
      highlightSection={highlight}
      packedGroups={packedGroups}
    />
  );
}
