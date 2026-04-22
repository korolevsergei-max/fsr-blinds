import { loadWindowsForPrint } from "@/lib/manufacturing-print-data";
import { parseLabelMode } from "@/lib/cut-labels";
import { LabelPdfClient } from "./label-pdf-client";

export default async function CutterPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; labelMode?: string }>;
}) {
  const params = await searchParams;
  const rawIds = params.ids ?? "";
  const windowIds = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const windows = await loadWindowsForPrint(windowIds);
  const labelMode = parseLabelMode(params.labelMode);

  if (windows.length === 0) {
    return (
      <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif", textAlign: "center" }}>
        <p style={{ fontSize: "14pt", color: "#666" }}>No windows found for printing.</p>
      </div>
    );
  }

  return <LabelPdfClient items={windows} labelMode={labelMode} />;
}
