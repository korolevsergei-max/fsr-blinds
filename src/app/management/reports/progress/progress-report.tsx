"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { ArrowLeft, CalendarBlank, ChartLineUp, Printer, Table as TableIcon } from "@phosphor-icons/react";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { PageHeader } from "@/components/ui/page-header";
import { RefreshButton } from "@/components/ui/refresh-button";
import type { ProgressReportPdfFilter } from "@/lib/progress-report-pdf";
import type { ProgressStage } from "@/lib/types";

export type ProgressReportOption = {
  value: string;
  label: string;
};

export type ProgressReportBuildingOption = ProgressReportOption & {
  clientId: string;
};

export type ProgressReportRow = {
  id: string;
  snapshotDate: string;
  stage: ProgressStage;
  unitId: string;
  buildingId: string;
  clientId: string;
  clientName: string;
  buildingName: string;
  unitNumber: string;
  floor: number | null;
  expectedBlinds: number;
  doneBlinds: number;
  assignedUserIds: string[];
  assignedDisplay: string | null;
};

type ProgressReportFilters = {
  stage: ProgressStage;
  from: string;
  to: string;
  clients: string[];
  buildings: string[];
  installers: string[];
  schedulers: string[];
  cutters: string[];
  assemblers: string[];
  qcs: string[];
};

type ProgressReportOptions = {
  stages: ProgressReportOption[];
  clients: ProgressReportOption[];
  buildings: ProgressReportBuildingOption[];
  installers: ProgressReportOption[];
  schedulers: ProgressReportOption[];
  cutters: ProgressReportOption[];
  assemblers: ProgressReportOption[];
  qcs: ProgressReportOption[];
};

type ProgressReportProps = {
  rows: ProgressReportRow[];
  initialFilters: ProgressReportFilters;
  options: ProgressReportOptions;
};

const FILTER_KEYS = [
  "stage",
  "from",
  "to",
  "clients",
  "buildings",
  "installers",
  "schedulers",
  "cutters",
  "assemblers",
  "qcs",
] as const;

function addUtcDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function percent(done: number, expected: number): number {
  if (expected <= 0) return 0;
  return Math.round((done / expected) * 100);
}

function withAll(label: string, options: ProgressReportOption[]) {
  return [{ value: "all", label }, ...options];
}

function joinValues(values: string[]) {
  return values.length > 0 ? values.join(",") : null;
}

function normalizeRange(from: string, to: string) {
  let nextFrom = from;
  let nextTo = to;

  if (nextFrom > nextTo) {
    [nextFrom, nextTo] = [nextTo, nextFrom];
  }

  const earliestAllowed = addUtcDays(nextTo, -89);
  if (nextFrom < earliestAllowed) nextFrom = earliestAllowed;

  return { from: nextFrom, to: nextTo };
}

function clearIncompatibleBuildingFilters(buildingIds: string[], clientIds: string[], buildings: ProgressReportBuildingOption[]) {
  if (clientIds.length === 0) return buildingIds;
  const allowed = new Set(
    buildings.filter((building) => clientIds.includes(building.clientId)).map((building) => building.value)
  );
  return buildingIds.filter((buildingId) => allowed.has(buildingId));
}

function selectedOptionLabels(values: string[], options: ProgressReportOption[], allLabel: string): string {
  if (values.length === 0) return allLabel;

  const labels = new Map(options.map((option) => [option.value, option.label]));
  return values.map((value) => labels.get(value) ?? "Unknown").join(", ");
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function ProgressReport({ rows, initialFilters, options }: ProgressReportProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [pdfStatus, setPdfStatus] = useState<"idle" | "generating" | "error">("idle");

  const visibleBuildings = useMemo(() => {
    if (initialFilters.clients.length === 0) return options.buildings;
    return options.buildings.filter((building) => initialFilters.clients.includes(building.clientId));
  }, [initialFilters.clients, options.buildings]);

  const totals = useMemo(
    () =>
      rows.reduce(
        (acc, row) => {
          acc.done += row.doneBlinds;
          acc.expected += row.expectedBlinds;
          return acc;
        },
        { done: 0, expected: 0 }
      ),
    [rows]
  );

  const selectedStageLabel =
    options.stages.find((stage) => stage.value === initialFilters.stage)?.label ?? initialFilters.stage;

  const pdfFilters: ProgressReportPdfFilter[] = useMemo(
    () => [
      {
        label: "Client",
        value: selectedOptionLabels(initialFilters.clients, options.clients, "All clients"),
      },
      {
        label: "Building",
        value: selectedOptionLabels(initialFilters.buildings, options.buildings, "All buildings"),
      },
      {
        label: "Installer",
        value: selectedOptionLabels(initialFilters.installers, options.installers, "All installers"),
      },
      {
        label: "Scheduler",
        value: selectedOptionLabels(initialFilters.schedulers, options.schedulers, "All schedulers"),
      },
      {
        label: "Cutter",
        value: selectedOptionLabels(initialFilters.cutters, options.cutters, "All cutters"),
      },
      {
        label: "Assembler",
        value: selectedOptionLabels(initialFilters.assemblers, options.assemblers, "All assemblers"),
      },
      {
        label: "QC",
        value: selectedOptionLabels(initialFilters.qcs, options.qcs, "All QC"),
      },
    ],
    [
      initialFilters.assemblers,
      initialFilters.buildings,
      initialFilters.clients,
      initialFilters.cutters,
      initialFilters.installers,
      initialFilters.qcs,
      initialFilters.schedulers,
      options.assemblers,
      options.buildings,
      options.clients,
      options.cutters,
      options.installers,
      options.qcs,
      options.schedulers,
    ]
  );

  const activeFilterCount =
    initialFilters.clients.length +
    initialFilters.buildings.length +
    initialFilters.installers.length +
    initialFilters.schedulers.length +
    initialFilters.cutters.length +
    initialFilters.assemblers.length +
    initialFilters.qcs.length;

  function updateFilters(patch: Partial<ProgressReportFilters>) {
    const next = {
      ...initialFilters,
      ...patch,
    };
    const range = normalizeRange(next.from, next.to);
    next.from = range.from;
    next.to = range.to;

    if (patch.clients) {
      next.buildings = clearIncompatibleBuildingFilters(next.buildings, patch.clients, options.buildings);
    }

    const params = new URLSearchParams();
    for (const key of FILTER_KEYS) {
      const value = next[key];
      if (Array.isArray(value)) {
        const joined = joinValues(value);
        if (joined) params.set(key, joined);
      } else {
        params.set(key, value);
      }
    }

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  async function downloadPdf() {
    setPdfStatus("generating");

    try {
      const { buildProgressReportPdf } = await import("@/lib/progress-report-pdf");
      const blob = await buildProgressReportPdf({
        rows,
        stageLabel: selectedStageLabel,
        from: initialFilters.from,
        to: initialFilters.to,
        filters: pdfFilters,
        totals: {
          rows: rows.length,
          done: totals.done,
          expected: totals.expected,
          completePercent: percent(totals.done, totals.expected),
        },
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStamp = new Date().toISOString().slice(0, 10);
      const stageSlug = slugify(selectedStageLabel) || "progress";
      link.href = url;
      link.download = `progress-report-${stageSlug}-${dateStamp}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setPdfStatus("idle");
    } catch (error) {
      console.error("Progress report PDF generation failed", error);
      setPdfStatus("error");
    }
  }

  return (
    <div className="min-h-[100dvh] bg-[#f8f8f6]">
      <PageHeader
        title="Progress Report"
        subtitle="Historical daily snapshots by process"
        backHref="/management/reports"
        actions={
          <>
            <RefreshButton />
            <button
              type="button"
              onClick={downloadPdf}
              disabled={pdfStatus === "generating"}
              className={[
                "inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border px-4 text-[13px] font-semibold shadow-[0_1px_2px_rgba(26,26,26,0.04)] transition-all active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60",
                pdfStatus === "error"
                  ? "border-red-200 bg-red-50 text-red-700 hover:bg-red-50"
                  : "border-zinc-900 bg-zinc-900 text-white hover:bg-zinc-800",
              ].join(" ")}
              title={pdfStatus === "error" ? "PDF generation failed. Try again." : "Generate progress report PDF"}
            >
              <Printer size={14} weight="bold" />
              {pdfStatus === "generating" ? "Generating" : pdfStatus === "error" ? "PDF failed" : "Print / Save PDF"}
            </button>
            <Link
              href="/management/reports"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-card px-4 text-[13px] font-semibold text-foreground shadow-[0_1px_2px_rgba(26,26,26,0.04)] transition-all hover:bg-surface active:scale-[0.97]"
            >
              <ArrowLeft size={14} weight="bold" />
              Status Grid
            </Link>
          </>
        }
      />

      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-4 px-4 py-4 sm:py-5">
        <section className="border-b border-zinc-200 bg-white/70 px-0 pb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Process</p>
              <h2 className="text-[18px] font-semibold tracking-tight text-zinc-950">
                {options.stages.find((stage) => stage.value === initialFilters.stage)?.label}
              </h2>
            </div>
            {pending ? (
              <span className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-[11px] font-semibold text-zinc-500">
                Updating
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-4 lg:grid-cols-7">
            {options.stages.map((stage) => {
              const active = stage.value === initialFilters.stage;
              return (
                <label
                  key={stage.value}
                  className={[
                    "flex min-h-11 cursor-pointer items-center gap-2 rounded-[8px] border px-3 py-2 text-[13px] font-semibold transition-all active:scale-[0.98]",
                    active
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300",
                  ].join(" ")}
                >
                  <input
                    type="radio"
                    name="progress-stage"
                    value={stage.value}
                    checked={active}
                    onChange={() => updateFilters({ stage: stage.value as ProgressStage })}
                    className="h-3.5 w-3.5 accent-emerald-700"
                  />
                  <span className="min-w-0 truncate">{stage.label}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 border-b border-zinc-200 bg-white/70 pb-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">Date Range</p>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <DateField
                label="From"
                value={initialFilters.from}
                min={addUtcDays(initialFilters.to, -89)}
                max={initialFilters.to}
                onChange={(value) => updateFilters({ from: value })}
              />
              <span className="pb-2.5 text-[12px] font-semibold text-zinc-400">to</span>
              <DateField
                label="To"
                value={initialFilters.to}
                min={initialFilters.from}
                max={addUtcDays(initialFilters.from, 89)}
                onChange={(value) => updateFilters({ to: value })}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-500">Ranges are limited to 90 days.</p>
          </div>

          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              Filters
            </p>
            <div className="flex flex-wrap gap-2">
              <FilterDropdown
                label="Client"
                multiple
                values={initialFilters.clients}
                onChange={(clients) => updateFilters({ clients })}
                options={withAll("All clients", options.clients)}
              />
              <FilterDropdown
                label="Building"
                multiple
                values={initialFilters.buildings}
                onChange={(buildings) => updateFilters({ buildings })}
                options={withAll("All buildings", visibleBuildings)}
              />
              <FilterDropdown
                label="Installer"
                multiple
                values={initialFilters.installers}
                onChange={(installers) => updateFilters({ installers })}
                options={withAll("All installers", options.installers)}
              />
              <FilterDropdown
                label="Scheduler"
                multiple
                values={initialFilters.schedulers}
                onChange={(schedulers) => updateFilters({ schedulers })}
                options={withAll("All schedulers", options.schedulers)}
              />
              <FilterDropdown
                label="Cutter"
                multiple
                values={initialFilters.cutters}
                onChange={(cutters) => updateFilters({ cutters })}
                options={withAll("All cutters", options.cutters)}
              />
              <FilterDropdown
                label="Assembler"
                multiple
                values={initialFilters.assemblers}
                onChange={(assemblers) => updateFilters({ assemblers })}
                options={withAll("All assemblers", options.assemblers)}
              />
              <FilterDropdown
                label="QC"
                multiple
                values={initialFilters.qcs}
                onChange={(qcs) => updateFilters({ qcs })}
                options={withAll("All QC", options.qcs)}
              />
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Metric label="Rows" value={rows.length.toLocaleString()} />
          <Metric label="Blinds" value={`${totals.done.toLocaleString()} / ${totals.expected.toLocaleString()}`} />
          <Metric label="Complete" value={`${percent(totals.done, totals.expected)}%`} />
        </section>

        <section className="overflow-hidden rounded-[8px] border border-zinc-200 bg-white shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-200 px-3 py-3 sm:px-4">
            <div className="flex items-center gap-2">
              <TableIcon size={16} weight="bold" className="text-zinc-500" />
              <div>
                <h2 className="text-[14px] font-semibold text-zinc-950">Snapshot Rows</h2>
                <p className="text-[12px] text-zinc-500">
                  {formatDate(initialFilters.from)} to {formatDate(initialFilters.to)}
                  {activeFilterCount > 0 ? ` · ${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}` : ""}
                </p>
              </div>
            </div>
          </div>

          {rows.length > 0 ? (
            <div className="overflow-hidden">
              <table className="w-full table-fixed border-collapse text-left text-[12px] sm:text-[13px]">
                <colgroup>
                  <col className="w-[24%]" />
                  <col className="w-[11%]" />
                  <col className="w-[27%]" />
                  <col className="w-[21%]" />
                  <col className="w-[17%]" />
                </colgroup>
                <thead className="bg-zinc-50 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-1.5 py-2.5 sm:px-3">Date</th>
                    <th className="px-1.5 py-2.5 sm:px-3">Floor</th>
                    <th className="px-1.5 py-2.5 sm:px-3">Unit</th>
                    <th className="px-1.5 py-2.5 sm:px-3">Assigned</th>
                    <th className="px-1.5 py-2.5 text-right sm:px-3">Blinds</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {rows.map((row) => (
                    <tr key={row.id} className="transition-colors hover:bg-zinc-50/80">
                      <td className="truncate px-1.5 py-3 font-medium text-zinc-800 sm:px-3">
                        {formatDate(row.snapshotDate)}
                      </td>
                      <td className="truncate px-1.5 py-3 font-mono text-zinc-600 sm:px-3">
                        {row.floor ?? "—"}
                      </td>
                      <td className="px-1.5 py-3 sm:px-3">
                        <div className="truncate font-semibold text-zinc-950">{row.unitNumber}</div>
                        <div className="truncate text-[11px] text-zinc-500">{row.buildingName}</div>
                      </td>
                      <td className="truncate px-1.5 py-3 text-zinc-700 sm:px-3">
                        {row.assignedDisplay?.trim() || "—"}
                      </td>
                      <td className="truncate px-1.5 py-3 text-right font-mono text-zinc-800 sm:px-3">
                        {row.doneBlinds} / {row.expectedBlinds}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-500">
                <ChartLineUp size={22} weight="bold" />
              </div>
              <p className="text-[14px] font-semibold text-zinc-950">No snapshot rows found</p>
              <p className="mt-1 max-w-md text-[12px] leading-5 text-zinc-500">
                Try another process, date range, or filter set. Historical rows appear here once the daily snapshot has captured them.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-zinc-500">{label}</span>
      <span className="relative block">
        <CalendarBlank
          size={14}
          weight="bold"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
        />
        <input
          type="date"
          value={value}
          min={min}
          max={max}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 w-full rounded-[8px] border border-zinc-200 bg-white pl-8 pr-3 text-[13px] font-semibold text-zinc-900 outline-none transition-all focus:border-emerald-700 focus:ring-2 focus:ring-emerald-700/10"
        />
      </span>
    </label>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-zinc-200 bg-white px-4 py-3 shadow-[0_1px_2px_rgba(24,24,27,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-1 font-mono text-[20px] font-semibold text-zinc-950">{value}</p>
    </div>
  );
}
