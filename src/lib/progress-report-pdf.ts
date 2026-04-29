import type { jsPDF } from "jspdf";

export type ProgressReportPdfRow = {
  snapshotDate: string;
  floor: number | null;
  unitNumber: string;
  buildingName: string;
  assignedDisplay: string | null;
  expectedBlinds: number;
  doneBlinds: number;
};

export type ProgressReportPdfFilter = {
  label: string;
  value: string;
};

export type ProgressReportPdfTotals = {
  rows: number;
  done: number;
  expected: number;
  completePercent: number;
};

export type ProgressReportPdfOptions = {
  rows: ProgressReportPdfRow[];
  stageLabel: string;
  from: string;
  to: string;
  filters: ProgressReportPdfFilter[];
  totals: ProgressReportPdfTotals;
};

const PAGE = {
  width: 297,
  height: 210,
  marginX: 10,
  marginBottom: 9,
};

const COLUMNS = [
  { label: "Date", w: 24 },
  { label: "Floor", w: 14 },
  { label: "Unit", w: 18 },
  { label: "Building", w: 58 },
  { label: "Assigned", w: 117 },
  { label: "Blinds", w: 28 },
  { label: "%", w: 18 },
] as const;

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function formatGeneratedAt(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function percent(done: number, expected: number): number {
  if (expected <= 0) return 0;
  return Math.round((done / expected) * 100);
}

function plural(count: number, singular: string, pluralValue = `${singular}s`) {
  return `${count.toLocaleString()} ${count === 1 ? singular : pluralValue}`;
}

function drawMetric(
  doc: Pick<
    jsPDF,
    | "roundedRect"
    | "setDrawColor"
    | "setFillColor"
    | "setFont"
    | "setFontSize"
    | "setTextColor"
    | "text"
  >,
  label: string,
  value: string,
  x: number,
  y: number,
  w: number
) {
  doc.setDrawColor(229, 231, 235);
  doc.setFillColor(250, 250, 249);
  doc.roundedRect(x, y, w, 19, 2.5, 2.5, "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.8);
  doc.setTextColor(138, 138, 143);
  doc.text(label.toUpperCase(), x + 4, y + 6.3);

  doc.setFontSize(12);
  doc.setTextColor(24, 24, 27);
  doc.text(value, x + 4, y + 14.5);
}

export async function buildProgressReportPdf({
  rows,
  stageLabel,
  from,
  to,
  filters,
  totals,
}: ProgressReportPdfOptions): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const generatedAt = formatGeneratedAt(new Date());
  const reportRange = `${formatDate(from)} to ${formatDate(to)}`;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, PAGE.width, PAGE.height, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(160, 160, 165);
  doc.text("PROGRESS REPORT", PAGE.marginX, 13);

  doc.setFontSize(18);
  doc.setTextColor(24, 24, 27);
  doc.text(stageLabel, PAGE.marginX, 23);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.2);
  doc.setTextColor(90, 90, 94);
  doc.text(`Historical daily snapshots by process`, PAGE.marginX, 29);
  doc.text(`Generated ${generatedAt}`, PAGE.width - PAGE.marginX, 13, { align: "right" });

  const metricY = 37;
  const metricW = 42;
  drawMetric(doc, "Date range", reportRange, PAGE.marginX, metricY, 67);
  drawMetric(doc, "Rows", totals.rows.toLocaleString(), 82, metricY, metricW);
  drawMetric(doc, "Blinds", `${totals.done.toLocaleString()} / ${totals.expected.toLocaleString()}`, 128, metricY, 53);
  drawMetric(doc, "Complete", `${totals.completePercent}%`, 185, metricY, metricW);
  drawMetric(doc, "Process", stageLabel, 231, metricY, 56);

  let y = 64;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.2);
  doc.setTextColor(160, 160, 165);
  doc.text("FILTERS", PAGE.marginX, y);
  y += 4.8;

  const filterColWidth = (PAGE.width - PAGE.marginX * 2 - 6) / 2;
  const filterRows = Math.ceil(filters.length / 2);
  const filterStartY = y;

  filters.forEach((filter, index) => {
    const col = index % 2;
    const row = Math.floor(index / 2);
    const x = PAGE.marginX + col * (filterColWidth + 6);
    const rowY = filterStartY + row * 9.2;
    const valueWidth = filterColWidth - 30;
    const valueLines = doc.splitTextToSize(filter.value, valueWidth).slice(0, 2);

    doc.setFillColor(250, 250, 249);
    doc.setDrawColor(237, 237, 235);
    doc.roundedRect(x, rowY, filterColWidth, 7.4, 1.8, 1.8, "FD");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(113, 113, 122);
    doc.text(filter.label.toUpperCase(), x + 3, rowY + 4.9);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(valueLines.length > 1 ? 5.8 : 6.7);
    doc.setTextColor(39, 39, 42);
    doc.text(valueLines, x + 28, rowY + (valueLines.length > 1 ? 3.4 : 4.9));
  });

  y = filterStartY + filterRows * 9.2 + 5;

  doc.setDrawColor(229, 231, 235);
  doc.line(PAGE.marginX, y, PAGE.width - PAGE.marginX, y);
  y += 7;

  if (rows.length === 0) {
    doc.setFillColor(250, 250, 249);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(PAGE.marginX, y, PAGE.width - PAGE.marginX * 2, 34, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(24, 24, 27);
    doc.text("No snapshot rows found", PAGE.width / 2, y + 15, { align: "center" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(113, 113, 122);
    doc.text("Try another process, date range, or filter set.", PAGE.width / 2, y + 22, { align: "center" });
  } else {
    const tableRows = rows.map((row) => {
      const rowPercent = percent(row.doneBlinds, row.expectedBlinds);
      return [
        formatDate(row.snapshotDate),
        row.floor == null ? "-" : String(row.floor),
        row.unitNumber,
        row.buildingName,
        row.assignedDisplay?.trim() || "-",
        `${row.doneBlinds} / ${row.expectedBlinds}`,
        `${rowPercent}%`,
      ];
    });

    const columnStyles: Record<number, { cellWidth: number; halign?: "left" | "right" | "center" }> = {};
    COLUMNS.forEach((col, index) => {
      columnStyles[index] = {
        cellWidth: col.w,
        halign: index >= 5 ? "right" : index === 1 ? "center" : "left",
      };
    });

    autoTable(doc, {
      startY: y,
      margin: { left: PAGE.marginX, right: PAGE.marginX, top: 10, bottom: PAGE.marginBottom },
      head: [COLUMNS.map((column) => column.label)],
      body: tableRows,
      theme: "grid",
      styles: {
        font: "helvetica",
        fontSize: 7.4,
        cellPadding: 1.5,
        overflow: "linebreak",
        lineWidth: 0.1,
        lineColor: [229, 231, 235],
        textColor: [24, 24, 27],
        valign: "middle",
      },
      headStyles: {
        fillColor: [24, 24, 27],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize: 7.6,
        lineColor: [63, 63, 70],
      },
      alternateRowStyles: {
        fillColor: [250, 250, 249],
      },
      columnStyles,
      showHead: "everyPage",
    });
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(113, 113, 122);
    doc.text("FSR Blinds", PAGE.marginX, PAGE.height - 4);
    doc.text(`${page} / ${pageCount}`, PAGE.width - PAGE.marginX, PAGE.height - 4, { align: "right" });
    doc.text(
      `${plural(totals.rows, "row")} - ${plural(totals.expected, "blind")} tracked`,
      PAGE.width / 2,
      PAGE.height - 4,
      { align: "center" }
    );
  }

  return doc.output("blob");
}
