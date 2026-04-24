import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import { toCutListRow } from "@/lib/cut-list-row";

// Column widths in mm — sum = 287mm = A4 landscape (297mm) - 5mm left - 5mm right margin
const COLUMNS = [
  { label: "Date",        w: 18 },
  { label: "Building",    w: 25 },
  { label: "Fl.",         w: 6 },
  { label: "Unit",        w: 11 },
  { label: "Returned",    w: 21 },
  { label: "Ins.Date",    w: 14 },
  { label: "Room",        w: 17 },
  { label: "Win.",        w: 9 },
  { label: "Type",        w: 15 },
  { label: "W x H",       w: 24 },
  { label: "Fab adj.",    w: 15 },
  { label: "Fab (mach.)", w: 16 },
  { label: "Fab (cut)",   w: 15 },
  { label: "Valance",     w: 14 },
  { label: "Tube",        w: 14 },
  { label: "Bot. rail",   w: 14 },
  { label: "Wand",        w: 12 },
  { label: "In/Out",      w: 13 },
  { label: "Chain",       w: 14 },
];

export interface CutListPdfOptions {
  items: ManufacturingWindowItem[];
  filterSummary: string;
  sortSummary: string;
}

export async function buildCutListPdf({ items, filterSummary, sortSummary }: CutListPdfOptions): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  // --- Header ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(17, 17, 17);
  doc.text(`Cutting list — ${items.length} blind${items.length === 1 ? "" : "s"}`, 5, 8);

  let tableStartY = 14;

  if (filterSummary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(filterSummary, 5, 13);
    tableStartY = 17;
  }

  if (sortSummary) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(sortSummary, 5, tableStartY);
    tableStartY += 4;
  }

  // --- Table data ---
  const rows = items.map((item) => {
    const r = toCutListRow(item);
    return [
      r.date, r.building, r.floor, r.unit, r.returned, r.install,
      r.room, r.win, r.type, r.dimensions, r.fabAdj, r.fabMach,
      r.fabCut, r.valance, r.tube, r.botRail, r.wand, r.installation, r.chain,
    ];
  });

  const returnedColIndex = 4;
  const returnedFlags = items.map((item) => toCutListRow(item).isReturned);

  const columnStyles: Record<number, { cellWidth: number }> = {};
  COLUMNS.forEach((col, i) => {
    columnStyles[i] = { cellWidth: col.w };
  });

  autoTable(doc, {
    startY: tableStartY,
    margin: { left: 5, right: 5, top: 5, bottom: 5 },
    head: [COLUMNS.map((c) => c.label)],
    body: rows,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 1,
      overflow: "linebreak",
      lineWidth: 0.1,
      lineColor: [229, 231, 235],
      textColor: [17, 17, 17],
      valign: "top",
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      lineColor: [68, 68, 68],
    },
    alternateRowStyles: {
      fillColor: [247, 247, 247],
    },
    columnStyles,
    showHead: "everyPage",
    didParseCell: (data) => {
      if (data.section === "body") {
        const rowIdx = data.row.index;
        const isAlt = rowIdx % 2 === 1;
        if (returnedFlags[rowIdx]) {
          data.cell.styles.fillColor = isAlt ? [255, 236, 236] : [255, 247, 247];
          if (data.column.index === returnedColIndex) {
            data.cell.styles.textColor = [220, 38, 38];
            data.cell.styles.fontStyle = "bold";
          }
        }
      }
    },
  });

  return doc.output("blob");
}
