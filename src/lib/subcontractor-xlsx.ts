import { toCutListRow } from "@/lib/cut-list-row";
import { toFractionInches } from "@/lib/fraction-inches";
import type { SubcontractorWorkItem } from "@/lib/subcontractor-data";

/**
 * THE export column contract.
 *
 * The consumer is the subcontractor's own production software, so this shape
 * belongs to them, not to us. To change what they receive, edit THIS ARRAY and
 * nothing else — the sheet name, filename and download plumbing below are fixed,
 * and the CSV writer reads the same definition, so the two can never drift.
 *
 * Agreed with the subcontractor on 2026-08-06, walking through a sample export:
 *   - Window width and window height as SEPARATE columns, not a combined "W × H".
 *   - Measurements as mixed fractions (35 1/2), not decimals — they read tape
 *     measures on the floor. See fraction-inches.ts.
 *   - "Date added" is the day the unit entered THEIR queue, not the in-house
 *     scheduled cut date (which does not exist for subcontracted units).
 * The two internal-schedule columns from the cutter's sheet ("Date", "Returned")
 * are dropped for the same reason.
 */
export type ExportColumn = {
  header: string;
  width: number;
  value: (item: SubcontractorWorkItem) => string | number;
};

/**
 * `toCutListRow` runs computeManufacturingSummary, and nine columns below read
 * from it — without this cache that is nine recomputations per row, on every
 * render of the table as well as every export. Keyed by item identity, so it
 * costs nothing and invalidates itself when the loader returns fresh objects.
 */
const rowCache = new WeakMap<SubcontractorWorkItem, ReturnType<typeof toCutListRow>>();

function specs(item: SubcontractorWorkItem): ReturnType<typeof toCutListRow> {
  let row = rowCache.get(item);
  if (!row) {
    row = toCutListRow(item);
    rowCache.set(item, row);
  }
  return row;
}

const dash = (v: string) => (v === "—" ? "" : v);

/** ISO timestamp → YYYY-MM-DD, the form their software ingests. */
function toDateOnly(value: string | null | undefined): string {
  return value ? value.split("T")[0]! : "";
}

const BASE_COLUMNS: ExportColumn[] = [
  { header: "Date added", width: 13, value: (i) => toDateOnly(i.queueAddedAt) },
  { header: "Building", width: 22, value: (i) => i.buildingName },
  { header: "Unit", width: 10, value: (i) => i.unitNumber },
  { header: "Room", width: 16, value: (i) => i.roomName },
  { header: "Window", width: 10, value: (i) => i.label },
  { header: "Type", width: 12, value: (i) => (i.blindType === "blackout" ? "Blackout" : "Screen") },
  { header: "Window width", width: 14, value: (i) => toFractionInches(i.width) },
  { header: "Window height", width: 14, value: (i) => toFractionInches(i.height) },
  { header: "Fab adj.", width: 14, value: (i) => dash(specs(i).fabAdj) },
  { header: "Fab (mach.)", width: 14, value: (i) => dash(specs(i).fabMach) },
  { header: "Fab (cut)", width: 14, value: (i) => dash(specs(i).fabCut) },
  { header: "Valance", width: 12, value: (i) => dash(specs(i).valance) },
  { header: "Tube", width: 12, value: (i) => dash(specs(i).tube) },
  { header: "Bot. rail", width: 12, value: (i) => dash(specs(i).botRail) },
  { header: "Wand", width: 10, value: (i) => dash(specs(i).wand) },
  { header: "In/Out", width: 10, value: (i) => dash(specs(i).installation) },
  { header: "Chain", width: 12, value: (i) => dash(specs(i).chain) },
];

/** Only meaningful on the Completed view, so it is appended there rather than
 *  shipping an empty column on every production export. */
const COMPLETED_COLUMN: ExportColumn = {
  header: "Date completed",
  width: 15,
  value: (i) => toDateOnly(i.qcApprovedAt),
};

export function exportColumnsFor(view: "production" | "completed"): ExportColumn[] {
  return view === "completed" ? [...BASE_COLUMNS, COMPLETED_COLUMN] : BASE_COLUMNS;
}

function buildRows(
  items: SubcontractorWorkItem[],
  columns: ExportColumn[]
): Record<string, string | number>[] {
  return items.map((item) => {
    const row: Record<string, string | number> = {};
    for (const col of columns) row[col.header] = col.value(item);
    return row;
  });
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "worklist";
}

export function buildExportFilename(partnerName: string, extension: string): string {
  const today = new Date().toISOString().split("T")[0];
  return `fsr-worklist-${slugify(partnerName)}-${today}.${extension}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Build and download the work list as a real .xlsx.
 *
 * SheetJS is ~400 KB, so it is imported HERE, inside the click path, never at
 * module scope — a static import would land it in the shared bundle and blow the
 * ≤300 KB first-load budget that `npm run perf-budget` enforces. Same treatment
 * jsPDF already gets in cut-list-pdf-client.tsx.
 */
export async function downloadWorklistXlsx(
  items: SubcontractorWorkItem[],
  partnerName: string,
  view: "production" | "completed" = "production"
): Promise<void> {
  const XLSX = await import("xlsx");
  const columns = exportColumnsFor(view);

  const worksheet = XLSX.utils.json_to_sheet(buildRows(items, columns), {
    header: columns.map((c) => c.header),
  });
  worksheet["!cols"] = columns.map((c) => ({ wch: c.width }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    view === "completed" ? "Completed" : "Production"
  );

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  triggerDownload(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    buildExportFilename(partnerName, "xlsx")
  );
}

/** Same columns, no dependency — for software that would rather ingest CSV. */
export function downloadWorklistCsv(
  items: SubcontractorWorkItem[],
  partnerName: string,
  view: "production" | "completed" = "production"
): void {
  const columns = exportColumnsFor(view);
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = [
    columns.map((c) => escape(c.header)).join(","),
    ...items.map((item) => columns.map((c) => escape(c.value(item))).join(",")),
  ];

  triggerDownload(
    // BOM so Excel opens UTF-8 correctly on a double-click.
    new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }),
    buildExportFilename(partnerName, "csv")
  );
}
