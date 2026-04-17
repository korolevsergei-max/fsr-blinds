import { loadWindowsForPrint } from "@/lib/manufacturing-print-data";
import { CutLabelSheet } from "@/components/manufacturing/cut-label-sheet";
import { AutoPrint } from "./auto-print";
import { PrintToolbar } from "./print-toolbar";

export default async function CutterPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string }>;
}) {
  const params = await searchParams;
  const rawIds = params.ids ?? "";
  const windowIds = rawIds
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const windows = await loadWindowsForPrint(windowIds);

  if (windows.length === 0) {
    return (
      <div style={{ padding: "2rem", fontFamily: "Arial, sans-serif", textAlign: "center" }}>
        <p style={{ fontSize: "14pt", color: "#666" }}>No windows found for printing.</p>
      </div>
    );
  }

  return (
    <>
      <style>{`
        @page { size: 4in 6in; margin: 0; }
        * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        @media screen {
          body { background: #d1d5db !important; }
          .print-sheet { margin: 1.5rem auto; background: white; box-shadow: 0 2px 12px rgba(0,0,0,0.2); display: block; width: 4in; }
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-sheet { margin: 0 !important; box-shadow: none !important; }
        }
      `}</style>
      <AutoPrint />
      <PrintToolbar count={windows.length} />
      <div style={{ paddingTop: "2.5rem", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {windows.map((item) => (
          <div key={item.windowId} className="print-sheet">
            <CutLabelSheet item={item} />
          </div>
        ))}
      </div>
    </>
  );
}
