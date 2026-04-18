"use client";

import { useEffect, useRef, useState } from "react";
import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import type { ManufacturingHighlightSection } from "@/components/windows/manufacturing-summary-card";
import { CutLabelSheet, CutLabelPackedSheet } from "@/components/manufacturing/cut-label-sheet";

interface Props {
  items: ManufacturingWindowItem[];
  highlightSection: ManufacturingHighlightSection | null;
  packedGroups: ManufacturingWindowItem[][];
}

export function LabelPdfClient({ items, highlightSection, packedGroups }: Props) {
  const [status, setStatus] = useState<"generating" | "done" | "error">("generating");
  const [errorMsg, setErrorMsg] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function generate() {
      // Small delay to let styles apply before capture
      await new Promise((r) => setTimeout(r, 150));

      try {
        const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
          import("jspdf"),
          import("html2canvas-pro"),
        ]);

        const container = containerRef.current;
        if (!container) throw new Error("Container not mounted");

        const sheets = Array.from(container.querySelectorAll<HTMLElement>(".label-sheet"));
        if (sheets.length === 0) throw new Error("No label sheets found");

        const doc = new jsPDF({
          orientation: "portrait",
          unit: "in",
          format: [4, 6],
        });

        for (let i = 0; i < sheets.length; i++) {
          const canvas = await html2canvas(sheets[i], {
            scale: 3,
            useCORS: true,
            backgroundColor: "#ffffff",
            logging: false,
          });

          if (i > 0) doc.addPage([4, 6]);
          doc.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, 4, 6);
        }

        const today = new Date().toISOString().slice(0, 10);
        doc.save(`cut-labels-${today}.pdf`);
        setStatus("done");
      } catch (err) {
        console.error("Label PDF generation failed", err);
        setErrorMsg(err instanceof Error ? err.message : "Unknown error");
        setStatus("error");
      }
    }

    generate();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, Arial, sans-serif" }}>
      {/* Status overlay */}
      <div style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "#f4f4f3",
        gap: 12,
        zIndex: 10,
      }}>
        {status === "generating" && (
          <>
            <div style={{
              width: 36,
              height: 36,
              border: "3px solid #e5e7eb",
              borderTopColor: "#111",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <p style={{ color: "#555", fontSize: 14, margin: 0 }}>Generating label PDF…</p>
          </>
        )}
        {status === "done" && (
          <>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <p style={{ color: "#111", fontSize: 15, fontWeight: 600, margin: 0 }}>Label PDF downloaded.</p>
            <p style={{ color: "#777", fontSize: 13, margin: 0 }}>You can close this tab.</p>
          </>
        )}
        {status === "error" && (
          <>
            <p style={{ color: "#dc2626", fontSize: 15, fontWeight: 600, margin: 0 }}>PDF generation failed.</p>
            {errorMsg && (
              <p style={{ color: "#777", fontSize: 12, margin: 0, maxWidth: 400, textAlign: "center" }}>{errorMsg}</p>
            )}
            <button
              onClick={() => window.close()}
              style={{ marginTop: 8, padding: "8px 16px", fontSize: 13, borderRadius: 8, border: "1px solid #e5e7eb", background: "#fff", cursor: "pointer" }}
            >
              Close tab
            </button>
          </>
        )}
      </div>

      {/* Off-screen render container — html2canvas captures from here */}
      <div
        ref={containerRef}
        style={{
          position: "fixed",
          top: 0,
          left: "-9999px",
          width: "4in",
          pointerEvents: "none",
        }}
      >
        {highlightSection
          ? packedGroups.map((group, idx) => (
              <div key={idx} className="label-sheet" style={{ width: "4in", height: "6in", background: "#fff" }}>
                <CutLabelPackedSheet items={group} highlightSection={highlightSection} />
              </div>
            ))
          : items.map((item) => (
              <div key={item.windowId} className="label-sheet" style={{ width: "4in", height: "6in", background: "#fff" }}>
                <CutLabelSheet item={item} />
              </div>
            ))}
      </div>
    </div>
  );
}
