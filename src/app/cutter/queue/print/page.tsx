import { loadWindowsForPrint } from "@/lib/manufacturing-print-data";
import { parseLabelMode } from "@/lib/cut-labels";
import { LabelPdfClient } from "./label-pdf-client";

export default async function CutterPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; labelMode?: string; skipPrinted?: string }>;
}) {
  const params = await searchParams;
  const rawIds = params.ids ?? "";
  const windowIds = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const labelMode = parseLabelMode(params.labelMode);
  const skipPrinted = params.skipPrinted === "1";

  const windows = await loadWindowsForPrint(windowIds, { skipPrinted, labelMode });

  if (windows.length === 0) {
    if (skipPrinted) {
      return (
        <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif", textAlign: "center" }}>
          <p style={{ fontSize: "14pt", color: "#444", maxWidth: 480, margin: "0 auto" }}>
            All selected blinds already had their labels printed.
          </p>
          <p style={{ fontSize: "11pt", color: "#777", marginTop: 8 }}>
            Uncheck &ldquo;Skip already printed&rdquo; in the print dialog to print anyway.
          </p>
        </div>
      );
    }
    return (
      <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif", textAlign: "center" }}>
        <p style={{ fontSize: "14pt", color: "#666" }}>No windows found for printing.</p>
      </div>
    );
  }

  return <LabelPdfClient items={windows} labelMode={labelMode} />;
}
