"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
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
import { DateInput } from "@/components/ui/date-input";
import { bulkImportUnits } from "@/app/actions/management-actions";

type ParsedRow = {
  unitNumber: string;
  earliestBracketing: string;
  earliestInstallation: string;
  occupancyDate: string;
  completeByDate: string | null;
  schedulerId: string | null;
  installerId: string | null;
};

type SelectOption = {
  value: string;
  label: string;
};

function CompactSelect({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder: string;
  ariaLabel: string;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={ariaLabel}
      className="h-7 w-full min-w-0 truncate rounded-md border border-border bg-white px-1.5 text-[11px] font-semibold text-foreground outline-none transition-colors hover:bg-surface focus:border-accent focus:ring-1 focus:ring-accent"
    >
      <option value="">{placeholder}</option>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

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
  const completeByCol = headers.findIndex(
    (h) => h.includes("complete_by") || h.includes("complete by") || h.includes("complete")
  );
  const schedulerCol = headers.findIndex((h) => h.includes("scheduler") && h.includes("id"));
  const installerCol = headers.findIndex((h) => h.includes("installer") && h.includes("id"));

  const unitIdx = unitCol >= 0 ? unitCol : 0;
  const bracketIdx = bracketCol >= 0 ? bracketCol : 1;
  const installIdx = installCol >= 0 ? installCol : 2;
  const occupancyIdx = occupancyCol >= 0 ? occupancyCol : 3;
  const completeByIdx = completeByCol >= 0 ? completeByCol : -1;
  const schedulerIdx = schedulerCol >= 0 ? schedulerCol : -1;
  const installerIdx = installerCol >= 0 ? installerCol : -1;

  return lines.slice(1).map((line) => {
    const cols = line.split(delimiter).map((c) => c.trim().replace(/^["']|["']$/g, ""));
    return {
      unitNumber: cols[unitIdx] || "",
      earliestBracketing: cols[bracketIdx] || "",
      earliestInstallation: cols[installIdx] || "",
      occupancyDate: cols[occupancyIdx] || "",
      completeByDate: completeByIdx >= 0 ? cols[completeByIdx] || null : null,
      schedulerId: schedulerIdx >= 0 ? cols[schedulerIdx] || null : null,
      installerId: installerIdx >= 0 ? cols[installerIdx] || null : null,
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
  const [inputMode, setInputMode] = useState<"file" | "paste">("paste");
  const [pasteData, setPasteData] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<{
    created: number;
    skipped: number;
    errors: string[];
  } | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  const schedulerOptions = useMemo(
    () => data.schedulers.map((scheduler) => ({ value: scheduler.id, label: scheduler.name })),
    [data.schedulers]
  );
  const installerOptions = useMemo(
    () =>
      data.installers
        .filter((installer) => Boolean(installer.id) && !installer.id.startsWith("sch-"))
        .map((installer) => ({ value: installer.id, label: installer.name })),
    [data.installers]
  );
  const validUnitCount = useMemo(
    () => parsed.filter((r) => r.unitNumber.trim()).length,
    [parsed]
  );
  const missingCompleteByCount = useMemo(
    () => parsed.filter((r) => r.unitNumber.trim() && !r.completeByDate).length,
    [parsed]
  );
  const allSelected = parsed.length > 0 && selectedRows.size === parsed.length;
  const partiallySelected = selectedRows.size > 0 && selectedRows.size < parsed.length;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = partiallySelected;
    }
  }, [partiallySelected, selectedRows.size, parsed.length]);

  if (!building || !client) {
    return <div className="p-6 text-center text-muted">Building not found</div>;
  }

  const setParsedRows = (rows: ParsedRow[]) => {
    setParsed(rows);
    setSelectedRows(new Set(rows.map((_, index) => index)));
  };

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
      setParsedRows(rows);
    };
    reader.readAsText(file);
  };

  const handlePasteParse = (options?: { quietEmpty?: boolean }) => {
    if (!pasteData.trim()) {
      if (options?.quietEmpty) return;
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
      completeByDate: null,
      schedulerId: null,
      installerId: null,
    }));

    setParsedRows(rows);
  };

  const handleImport = () => {
    const valid = parsed.filter((r) => r.unitNumber.trim());
    if (valid.length === 0) {
      setError("No valid unit numbers found");
      return;
    }
    const missingCompleteBy = valid.filter((r) => !r.completeByDate);
    if (missingCompleteBy.length > 0) {
      setError("Complete-by date is required for every unit before importing.");
      return;
    }
    setError("");
    startTransition(async () => {
      const res = await bulkImportUnits(building.id, client!.id, valid);
      setResult(res);
    });
  };

  const toggleSelectAll = () => {
    setSelectedRows((current) => {
      if (current.size === parsed.length) return new Set();
      return new Set(parsed.map((_, index) => index));
    });
  };

  const toggleRow = (index: number) => {
    setSelectedRows((current) => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const updateRowDate = (index: number, value: string) => {
    setParsed((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, completeByDate: value || null } : row
      )
    );
  };

  const updateRowScheduler = (index: number, value: string) => {
    setParsed((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, schedulerId: value || null } : row
      )
    );
  };

  const updateRowInstaller = (index: number, value: string) => {
    setParsed((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, installerId: value || null } : row
      )
    );
  };

  const applyDateToSelected = (value: string) => {
    setParsed((current) =>
      current.map((row, rowIndex) =>
        selectedRows.has(rowIndex) ? { ...row, completeByDate: value || null } : row
      )
    );
  };

  const applySchedulerToSelected = (value: string) => {
    setParsed((current) =>
      current.map((row, rowIndex) =>
        selectedRows.has(rowIndex) ? { ...row, schedulerId: value || null } : row
      )
    );
  };

  const applyInstallerToSelected = (value: string) => {
    setParsed((current) =>
      current.map((row, rowIndex) =>
        selectedRows.has(rowIndex) ? { ...row, installerId: value || null } : row
      )
    );
  };

  const downloadTemplate = () => {
    const csv = "unit_number,complete_by_date,earliest_bracketing_date,earliest_installation_date,occupancy_date\nUnit 101,2026-04-30,2026-04-01,2026-05-01,2026-06-01\nUnit 102,2026-04-30,2026-04-01,2026-05-01,2026-06-01\n";
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
            <div className="flex flex-col gap-3">
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
              <div className="bg-white rounded-2xl border border-border p-4">
                <SectionLabel as="h3">CSV / TSV format</SectionLabel>
                <p className="text-xs text-muted mb-3">
                  Upload a spreadsheet with columns: <span className="font-mono text-zinc-700">unit_number</span>,{" "}
                  <span className="font-mono text-zinc-700">complete_by_date</span>,{" "}
                  <span className="font-mono text-zinc-700">earliest_bracketing_date</span>,{" "}
                  <span className="font-mono text-zinc-700">earliest_installation_date</span>, and{" "}
                  <span className="font-mono text-zinc-700">occupancy_date</span>.
                  Dates should be YYYY-MM-DD format.
                </p>
                <Button size="sm" variant="secondary" onClick={downloadTemplate}>
                  <DownloadSimple size={14} />
                  Download Template
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <textarea
                className="w-full h-40 resize-y rounded-2xl border border-border p-4 text-sm font-mono text-zinc-800 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all placeholder:text-zinc-400 placeholder:font-sans"
                placeholder="Paste unit numbers separated by commas or newlines..."
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                onBlur={() => handlePasteParse({ quietEmpty: true })}
                disabled={pending}
              />
              <Button onClick={() => handlePasteParse()} variant="secondary" disabled={pending || !pasteData.trim()}>
                Parse
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
            <SectionLabel as="h3">Dates & assignments ({parsed.length} rows)</SectionLabel>
            {missingCompleteByCount > 0 && (
              <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] font-semibold leading-snug text-amber-800">
                Complete-by date is required for {missingCompleteByCount} unit{missingCompleteByCount !== 1 ? "s" : ""}.
              </p>
            )}
            <div className="mb-3 flex flex-col gap-2 rounded-xl border border-border bg-white p-3">
              <div className="flex items-center gap-2">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="Select all units"
                  className="h-4 w-4 shrink-0 rounded border-zinc-300 accent-[var(--accent)]"
                />
                <span className="text-sm font-semibold text-zinc-900">Select All</span>
                {selectedRows.size > 0 && (
                  <span className="ml-auto rounded-full bg-zinc-50 px-2 py-0.5 text-[11px] font-semibold text-tertiary ring-1 ring-border">
                    {selectedRows.size} selected
                  </span>
                )}
              </div>
              {selectedRows.size > 0 ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <DateInput
                    value=""
                    onChange={applyDateToSelected}
                    compact
                    placeholder="Apply date"
                    className="w-full min-w-0"
                    triggerClassName="h-9 w-full min-w-0 justify-between rounded-md border border-border bg-white px-2 py-1 hover:bg-surface"
                  />
                  <select
                    value=""
                    onChange={(event) =>
                      applyInstallerToSelected(event.target.value === "__clear__" ? "" : event.target.value)
                    }
                    aria-label="Apply installer to selected"
                    className="h-9 w-full min-w-0 rounded-md border border-border bg-white px-2 text-[12px] font-semibold text-foreground outline-none hover:bg-surface focus:border-accent focus:ring-1 focus:ring-accent"
                  >
                    <option value="">Set installer</option>
                    <option value="__clear__">No installer</option>
                    {installerOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <select
                    value=""
                    onChange={(event) =>
                      applySchedulerToSelected(event.target.value === "__clear__" ? "" : event.target.value)
                    }
                    aria-label="Apply scheduler to selected"
                    className="h-9 w-full min-w-0 rounded-md border border-border bg-white px-2 text-[12px] font-semibold text-foreground outline-none hover:bg-surface focus:border-accent focus:ring-1 focus:ring-accent"
                  >
                    <option value="">Set scheduler</option>
                    <option value="__clear__">No scheduler</option>
                    {schedulerOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <p className="text-[12px] font-medium text-tertiary">
                  Select units to apply bulk changes.
                </p>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-border bg-white">
              <div className="max-h-[26rem] overflow-auto">
                <table className="w-full table-fixed border-separate border-spacing-0 text-left">
                  <colgroup>
                    <col style={{ width: "2rem" }} />
                    <col style={{ width: "3rem" }} />
                    <col style={{ width: "6.5rem" }} />
                    <col style={{ width: "5.5rem" }} />
                    <col style={{ width: "5.5rem" }} />
                  </colgroup>
                  <thead className="sticky top-0 z-[1] bg-zinc-50">
                    <tr className="text-[9px] uppercase tracking-[0.04em] text-tertiary">
                      <th className="border-b border-border px-1.5 py-1.5 font-semibold" />
                      <th className="border-b border-border px-1.5 py-1.5 font-semibold">Unit</th>
                      <th className="border-b border-border px-1.5 py-1.5 font-semibold">Complete By</th>
                      <th className="border-b border-border px-1.5 py-1.5 font-semibold">Installer</th>
                      <th className="border-b border-border px-1.5 py-1.5 font-semibold">Scheduler</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.map((row, index) => (
                      <tr key={`${row.unitNumber}-${index}`} className="text-[11px]">
                        <td className="border-b border-border px-1.5 py-1 align-middle">
                          <input
                            type="checkbox"
                            checked={selectedRows.has(index)}
                            onChange={() => toggleRow(index)}
                            aria-label={`Select ${row.unitNumber || `row ${index + 1}`}`}
                            className="h-3.5 w-3.5 shrink-0 rounded border-zinc-300 accent-[var(--accent)]"
                          />
                        </td>
                        <td className="truncate border-b border-border px-1.5 py-1 align-middle text-[12px] font-semibold text-zinc-900">
                          {row.unitNumber || "—"}
                        </td>
                        <td className="border-b border-border px-1 py-1 align-middle">
                          <DateInput
                            value={row.completeByDate ?? ""}
                            onChange={(value) => updateRowDate(index, value)}
                            compact
                            placeholder="Required"
                            className="w-full min-w-0"
                            triggerClassName={[
                              "h-7 w-full min-w-0 justify-between rounded-md border px-1.5 py-0.5 text-[11px] hover:bg-surface",
                              row.completeByDate
                                ? "border-border bg-white"
                                : "border-amber-200 bg-amber-50 text-amber-900",
                            ].join(" ")}
                          />
                        </td>
                        <td className="border-b border-border px-1 py-1 align-middle">
                          <CompactSelect
                            value={row.installerId ?? ""}
                            onChange={(value) => updateRowInstaller(index, value)}
                            options={installerOptions}
                            placeholder="None"
                            ariaLabel={`Installer for ${row.unitNumber || `row ${index + 1}`}`}
                          />
                        </td>
                        <td className="border-b border-border px-1 py-1 align-middle">
                          <CompactSelect
                            value={row.schedulerId ?? ""}
                            onChange={(value) => updateRowScheduler(index, value)}
                            options={schedulerOptions}
                            placeholder="None"
                            ariaLabel={`Scheduler for ${row.unitNumber || `row ${index + 1}`}`}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4">
              <Button fullWidth size="lg" disabled={pending || missingCompleteByCount > 0} onClick={handleImport}>
                {pending ? "Importing…" : `Import ${validUnitCount} Units`}
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
