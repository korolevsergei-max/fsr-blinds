"use client";

import { useState, useTransition, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  UploadSimple,
  FileText,
  CheckCircle,
  Warning,
  DownloadSimple,
} from "@phosphor-icons/react";
import type { AppDataset } from "@/lib/app-dataset";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { SectionLabel } from "@/components/ui/section-label";
import { bulkImportUnits } from "@/app/actions/management-actions";

type ParsedRow = {
  unitNumber: string;
  earliestBracketing: string;
  earliestInstallation: string;
  occupancyDate: string;
};

function parseCSV(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const headerLine = lines[0].toLowerCase();
  const delimiter = headerLine.includes("\t") ? "\t" : ",";
  const headers = headerLine.split(delimiter).map((h) => h.trim());

  const unitCol = headers.findIndex(
    (h) =>
      h.includes("unit") &&
      (h.includes("number") || h.includes("num") || h.includes("#") || h === "unit")
  );
  const bracketCol = headers.findIndex(
    (h) => h.includes("bracket") || h.includes("earliest_bracket")
  );
  const installCol = headers.findIndex(
    (h) => h.includes("install") || h.includes("earliest_install")
  );
  const occupancyCol = headers.findIndex(
    (h) => h.includes("occupancy") || h.includes("occ")
  );

  const unitIdx = unitCol >= 0 ? unitCol : 0;
  const bracketIdx = bracketCol >= 0 ? bracketCol : 1;
  const installIdx = installCol >= 0 ? installCol : 2;
  const occupancyIdx = occupancyCol >= 0 ? occupancyCol : 3;

  return lines.slice(1).map((line) => {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    return {
      unitNumber: cols[unitIdx] || "",
      earliestBracketing: cols[bracketIdx] || "",
      earliestInstallation: cols[installIdx] || "",
      occupancyDate: cols[occupancyIdx] || "",
    };
  });
}

export function ImportUnits({ data }: { data: AppDataset }) {
  const { id: buildingId } = useParams<{ id: string }>();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const building = data.buildings.find((b) => b.id === buildingId);
  const client = building
    ? data.clients.find((c) => c.id === building.clientId)
    : null;

  const [parsed, setParsed] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [inputMode, setInputMode] = useState<"file" | "paste">("file");
  const [pasteData, setPasteData] = useState("");
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!building || !client) {
    return <div className="p-6 text-center text-muted">Building not found</div>;
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result;
      if (typeof text !== "string") return;
      const rows = parseCSV(text);
      if (rows.length === 0) {
        setError("No valid rows found. Make sure the CSV has a header row.");
        return;
      }
      setParsed(rows);
    };
    reader.readAsText(file);
  };

  const handlePasteParse = () => {
    if (!pasteData.trim()) {
      setError("Please paste some data first.");
      return;
    }
    setError("");
    setResult(null);

    // Support lists separated by commas, newlines, or tabs
    const rawTokens = pasteData.split(/[\n\t,]+/);
    const validUnits = rawTokens.map(t => t.trim()).filter(Boolean);
    
    if (validUnits.length === 0) {
      setError("No valid unit numbers found.");
      return;
    }

    const rows = validUnits.map(unitNum => ({
      unitNumber: unitNum,
      earliestBracketing: "",
      earliestInstallation: "",
      occupancyDate: "",
    }));

    setParsed(rows);
  };

  const handleImport = () => {
    const valid = parsed.filter((r) => r.unitNumber.trim());
    if (valid.length === 0) {
      setError("No valid unit numbers found");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await bulkImportUnits(building.id, client!.id, valid);
      setResult(res);
    });
  };

  const downloadTemplate = () => {
    const csv = "unit_number,earliest_bracketing_date,earliest_installation_date,occupancy_date\nUnit 101,2026-04-01,2026-05-01,2026-06-01\nUnit 102,2026-04-01,2026-05-01,2026-06-01\n";
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "unit_import_template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col min-h-[100dvh]">
      <PageHeader
        title="Import Units"
        subtitle={building.name}
        backHref={`/management/buildings/${building.id}`}
      />

      <div className="flex-1 px-4 py-5 flex flex-col gap-5">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-border p-4"
        >
          <SectionLabel as="h3">CSV / TSV format</SectionLabel>
          <p className="text-xs text-muted mb-3">
            Upload or paste a spreadsheet with columns: <span className="font-mono text-zinc-700">unit_number</span>,{" "}
            <span className="font-mono text-zinc-700">earliest_bracketing_date</span>,{" "}
            <span className="font-mono text-zinc-700">earliest_installation_date</span>, and{" "}
            <span className="font-mono text-zinc-700">occupancy_date</span>.
            Dates should be YYYY-MM-DD format.
          </p>
          <Button size="sm" variant="secondary" onClick={downloadTemplate}>
            <DownloadSimple size={14} />
            Download Template
          </Button>
        </motion.div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
            {error}
          </p>
        )}

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.04 }}
          className="flex bg-zinc-100 p-1 rounded-xl"
        >
          <button
            type="button"
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
              inputMode === "file" ? "bg-white shadow border border-border text-foreground" : "text-secondary hover:text-foreground"
            }`}
            onClick={() => setInputMode("file")}
          >
            Upload File
          </button>
          <button
            type="button"
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
              inputMode === "paste" ? "bg-white shadow border border-border text-foreground" : "text-secondary hover:text-foreground"
            }`}
            onClick={() => setInputMode("paste")}
          >
            Paste Data
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          {inputMode === "file" ? (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFile}
                className="hidden"
              />
              <button
                onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-zinc-200 rounded-2xl py-8 flex flex-col items-center gap-2 hover:border-accent/40 transition-colors"
                disabled={pending}
              >
                <UploadSimple size={28} className="text-zinc-400" />
                <span className="text-sm text-muted">
                  {fileName || "Tap to select CSV file"}
                </span>
              </button>
            </>
          ) : (
            <div className="flex flex-col gap-3">
              <textarea
                className="w-full h-40 resize-y rounded-2xl border border-border p-4 text-sm font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all placeholder:text-zinc-400 placeholder:font-sans"
                placeholder="Paste unit numbers separated by commas or newlines..."
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                disabled={pending}
              />
              <Button onClick={handlePasteParse} variant="secondary" disabled={pending || !pasteData.trim()}>
                Parse Pasted Data
              </Button>
            </div>
          )}
        </motion.div>

        {parsed.length > 0 && !result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.12 }}
          >
            <SectionLabel as="h3">Preview ({parsed.length} rows)</SectionLabel>
            <div className="bg-white rounded-xl border border-border overflow-hidden">
              <div className="grid grid-cols-4 gap-0 text-[10px] font-semibold text-muted uppercase px-3 py-2 border-b border-border bg-zinc-50">
                <span>Unit</span>
                <span>Bracketing</span>
                <span>Installation</span>
                <span>Occupancy</span>
              </div>
              <div className="max-h-48 overflow-y-auto divide-y divide-border">
                {parsed.slice(0, 50).map((row, i) => (
                  <div key={i} className="grid grid-cols-4 gap-0 px-3 py-2 text-xs">
                    <span className="font-medium text-zinc-900">{row.unitNumber || "—"}</span>
                    <span className="text-muted font-mono">{row.earliestBracketing || "—"}</span>
                    <span className="text-muted font-mono">{row.earliestInstallation || "—"}</span>
                    <span className="text-muted font-mono">{row.occupancyDate || "—"}</span>
                  </div>
                ))}
              </div>
              {parsed.length > 50 && (
                <div className="px-3 py-2 text-xs text-muted border-t border-border">
                  +{parsed.length - 50} more rows
                </div>
              )}
            </div>

            <div className="mt-4">
              <Button fullWidth size="lg" disabled={pending} onClick={handleImport}>
                {pending ? "Importing…" : `Import ${parsed.filter((r) => r.unitNumber.trim()).length} Units`}
              </Button>
            </div>
          </motion.div>
        )}

        {result && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl border border-border p-4 flex flex-col gap-3"
          >
            <SectionLabel as="h3" noMargin>Import results</SectionLabel>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" weight="fill" />
                <span className="text-sm font-semibold text-zinc-900">{result.created} created</span>
              </div>
              {result.skipped > 0 && (
                <div className="flex items-center gap-2">
                  <FileText size={16} className="text-zinc-400" />
                  <span className="text-sm text-muted">{result.skipped} skipped</span>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="flex items-center gap-2">
                  <Warning size={16} className="text-amber-500" />
                  <span className="text-sm text-amber-600">{result.errors.length} errors</span>
                </div>
              )}
            </div>
            {result.errors.length > 0 && (
              <div className="text-xs text-red-600 space-y-1">
                {result.errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}
            <Button
              size="sm"
              onClick={() => router.push(`/management/buildings/${building.id}`)}
            >
              Back to Building
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
