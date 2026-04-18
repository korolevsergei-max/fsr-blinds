"use client";

import { useEffect, useState } from "react";
import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";

interface Props {
  items: ManufacturingWindowItem[];
  filterSummary: string;
  sortSummary: string;
}

export function CutListPdfClient({ items, filterSummary, sortSummary }: Props) {
  const [status, setStatus] = useState<"generating" | "done" | "error">("generating");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    async function generate() {
      try {
        const { buildCutListPdf } = await import("@/lib/cut-list-pdf");
        const blob = await buildCutListPdf({ items, filterSummary, sortSummary });

        const today = new Date().toISOString().slice(0, 10);
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `cutting-list-${today}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setStatus("done");
      } catch (err) {
        console.error("PDF generation failed", err);
        setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    }

    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, Arial, sans-serif",
        background: "#f4f4f3",
        gap: "12px",
      }}
    >
      {status === "generating" && (
        <>
          <div
            style={{
              width: 36,
              height: 36,
              border: "3px solid #e5e7eb",
              borderTopColor: "#111",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <p style={{ color: "#555", fontSize: 14, margin: 0 }}>Generating PDF…</p>
        </>
      )}
      {status === "done" && (
        <>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <p style={{ color: "#111", fontSize: 15, fontWeight: 600, margin: 0 }}>
            Cutting list PDF downloaded.
          </p>
          <p style={{ color: "#777", fontSize: 13, margin: 0 }}>You can close this tab.</p>
        </>
      )}
      {status === "error" && (
        <>
          <p style={{ color: "#dc2626", fontSize: 15, fontWeight: 600, margin: 0 }}>
            PDF generation failed.
          </p>
          {errorMsg && (
            <p style={{ color: "#777", fontSize: 12, margin: 0, maxWidth: 400, textAlign: "center" }}>
              {errorMsg}
            </p>
          )}
          <button
            onClick={() => window.close()}
            style={{
              marginTop: 8,
              padding: "8px 16px",
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Close tab
          </button>
        </>
      )}
    </div>
  );
}
