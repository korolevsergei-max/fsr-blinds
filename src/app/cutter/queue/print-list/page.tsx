import { loadWindowsForPrint } from "@/lib/manufacturing-print-data";
import { CutListPdfClient } from "./cut-list-pdf-client";

export default async function CutterPrintListPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string; f?: string; s?: string }>;
}) {
  const params = await searchParams;
  const rawIds = params.ids ?? "";
  const filterSummary = params.f ?? "";
  const sortSummary = params.s ?? "";

  const windowIds = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const windows = await loadWindowsForPrint(windowIds);

  if (windows.length === 0) {
    return (
      <div
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, Arial, sans-serif",
          background: "#f4f4f3",
        }}
      >
        <p style={{ fontSize: 14, color: "#666" }}>No windows found for printing.</p>
      </div>
    );
  }

  return (
    <CutListPdfClient
      items={windows}
      filterSummary={filterSummary}
      sortSummary={sortSummary}
    />
  );
}
