"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import type { Unit, Client, Building } from "@/lib/types";
import {
  CalendarBlank,
  FunnelSimple,
  Printer,
  X,
  Buildings,
  User,
  MapPin,
} from "@phosphor-icons/react";
import { getFloor } from "@/lib/app-dataset";

// ─── Types ─────────────────────────────────────────────────────────────────

type ReportUnit = Unit & {
  todayBadge: "M" | "B" | "MF" | "I" | "";
  projectedColor:
    | "measured"
    | "bracketed"
    | "manufactured"
    | "installed"
    | "none";
};

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Corner badge from persisted unit status. */
function getTodayBadge(status: string): "M" | "B" | "MF" | "I" | "" {
  if (status === "installed") return "I";
  if (status === "manufactured") return "MF";
  if (status === "bracketed") return "B";
  if (status === "measured") return "M";
  return "";
}

function getProjectedColor(
  unit: Unit,
  asOfDate: string
): ReportUnit["projectedColor"] {
  const d = asOfDate;
  const m = Boolean(unit.measurementDate && unit.measurementDate <= d);
  const b = Boolean(unit.bracketingDate && unit.bracketingDate <= d);
  const i = Boolean(unit.installationDate && unit.installationDate <= d);
  if (unit.status === "manufactured") return "manufactured";
  if (i) return "installed";
  if (b) return "bracketed";
  if (m) return "measured";
  return "none";
}

function isoToday(): string {
  return new Date().toISOString().split("T")[0];
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// ─── Color Config ──────────────────────────────────────────────────────────

const COLOR_MAP = {
  measured: {
    bg: "bg-[#FFF9C4]",
    border: "border-[#F5C518]",
    label: "Measured",
    dot: "#F5C518",
    printBg: "#FFF9C4",
    printBorder: "#F5C518",
  },
  bracketed: {
    bg: "bg-[#FFE5D9]",
    border: "border-[#F4845F]",
    label: "Bracketed",
    dot: "#F4845F",
    printBg: "#FFE5D9",
    printBorder: "#F4845F",
  },
  manufactured: {
    bg: "bg-[#EEF2FF]",
    border: "border-[#6366F1]",
    label: "Manufactured",
    dot: "#6366F1",
    printBg: "#EEF2FF",
    printBorder: "#6366F1",
  },
  installed: {
    bg: "bg-[#D4F5E2]",
    border: "border-[#27AE60]",
    label: "Installed",
    dot: "#27AE60",
    printBg: "#D4F5E2",
    printBorder: "#27AE60",
  },
  none: {
    bg: "bg-white",
    border: "border-border",
    label: "None",
    dot: "#D1D5DB",
    printBg: "#FFFFFF",
    printBorder: "#E5E7EB",
  },
} as const;

/** Letter badge background colors — M=yellow, B=salmon, MF=indigo, I=green */
const BADGE_COLOR: Record<"M" | "B" | "MF" | "I", string> = {
  M: "#F5C518",
  B: "#F4845F",
  MF: "#6366F1",
  I: "#27AE60",
};

// ─── Props ─────────────────────────────────────────────────────────────────

interface Props {
  units: Unit[];
  clients: Client[];
  buildings: Building[];
}

// ─── Report Preview Modal ──────────────────────────────────────────────────

interface ReportPreviewProps {
  clientName: string;
  buildingName: string;
  /** Street / mailing address for the selected building (owner report). */
  buildingAddress: string;
  asOfDate: string;
  floorMap: Map<string, ReportUnit[]>;
  floors: string[];
  onClose: () => void;
}

/** How many floor columns to show per horizontal chunk before wrapping to next row. */
const FLOORS_PER_ROW = 10;

function ReportPreviewModal({
  clientName,
  buildingName,
  buildingAddress,
  asOfDate,
  floorMap,
  floors,
  onClose,
}: ReportPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const reportDate = isoToday();

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-zinc-900/70 backdrop-blur-sm print-report-root"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Modal panel */}
      <div className="relative flex flex-col w-full h-full bg-[#F8F7F4] overflow-hidden print-report-scroll-area">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-zinc-200 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
              Report Preview
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-zinc-900 text-white text-[12px] font-semibold px-3.5 py-1.5 rounded-[8px] hover:bg-zinc-700 active:scale-95 transition-all"
            >
              <Printer size={14} />
              Print / Save PDF
            </button>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-[8px] text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Scrollable report area */}
        <div className="flex-1 overflow-auto p-6 print:p-0 print:overflow-visible">
          <div
            ref={printRef}
            className="mx-auto bg-white shadow-[0_4px_32px_-8px_rgba(0,0,0,0.12)] rounded-2xl print:shadow-none print:rounded-none print:mx-0"
            style={{ maxWidth: 1100, minWidth: 700 }}
          >
            {/* Report Header */}
            <div className="px-10 pt-10 pb-6 border-b border-zinc-100">
              {/* Top row: title + logo area */}
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-1">
                    Status Grid Report
                  </p>
                  <h1 className="text-[28px] font-bold tracking-tight text-zinc-900 leading-tight">
                    {buildingName}
                  </h1>
                  <p className="text-[14px] text-zinc-500 mt-0.5">{clientName}</p>
                  {buildingAddress.trim() ? (
                    <p className="text-[13px] text-zinc-600 mt-2 max-w-xl leading-snug">
                      {buildingAddress.trim()}
                    </p>
                  ) : null}
                </div>

                {/* Badge legend in header */}
                <div className="flex flex-col gap-1.5 items-end">
                  {(
                    [
                      "measured",
                      "bracketed",
                      "manufactured",
                      "installed",
                    ] as const
                  ).map(
                    (key) => (
                      <div key={key} className="flex items-center gap-2">
                        <span className="text-[11px] text-zinc-500 font-medium capitalize">
                          {COLOR_MAP[key].label}
                        </span>
                        <span
                          className="w-3.5 h-3.5 rounded-sm border"
                          style={{
                            backgroundColor: COLOR_MAP[key].printBg,
                            borderColor: COLOR_MAP[key].printBorder,
                          }}
                        />
                      </div>
                    )
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-zinc-500 font-medium">
                      Unscheduled
                    </span>
                    <span
                      className="w-3.5 h-3.5 rounded-sm border"
                      style={{
                        backgroundColor: "#FFFFFF",
                        borderColor: "#D1D5DB",
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Metadata row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetaCell
                  icon={<User size={13} className="text-zinc-400" />}
                  label="Client"
                  value={clientName}
                />
                <MetaCell
                  icon={<Buildings size={13} className="text-zinc-400" />}
                  label="Building"
                  value={buildingName}
                />
                <MetaCell
                  icon={<CalendarBlank size={13} className="text-zinc-400" />}
                  label="Report Date"
                  value={formatDate(reportDate)}
                />
                <MetaCell
                  icon={<CalendarBlank size={13} className="text-zinc-400" />}
                  label="As of Date"
                  value={formatDate(asOfDate)}
                  accent
                />
              </div>
              {buildingAddress.trim() ? (
                <div className="mt-3">
                  <MetaCell
                    icon={<MapPin size={13} className="text-zinc-400" />}
                    label="Address"
                    value={buildingAddress.trim()}
                    valueClassName="whitespace-normal break-words"
                  />
                </div>
              ) : null}
            </div>

            {/* Badge key */}
            <div className="px-10 pt-4 pb-2 flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-zinc-100">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-400">
                Today&apos;s Status Badge:
              </p>
              {(["M", "B", "MF", "I"] as const).map((letter) => (
                <div key={letter} className="flex items-center gap-1.5">
                  <span className="min-w-5 h-5 px-1 rounded-full bg-zinc-100 border border-zinc-200 text-[8px] font-bold text-zinc-700 flex items-center justify-center leading-none">
                    {letter}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {letter === "M"
                      ? "Measured"
                      : letter === "B"
                        ? "Bracketed"
                        : letter === "MF"
                          ? "Manufactured"
                          : "Installed"}
                  </span>
                </div>
              ))}
            </div>

            {/* Grid — chunked into rows of FLOORS_PER_ROW so the report never scrolls horizontally */}
            <div className="px-10 py-6 space-y-6">
              {Array.from(
                { length: Math.ceil(floors.length / FLOORS_PER_ROW) },
                (_, chunkIdx) => {
                  const chunkFloors = floors.slice(
                    chunkIdx * FLOORS_PER_ROW,
                    (chunkIdx + 1) * FLOORS_PER_ROW
                  );
                  const chunkMaxRows = Math.max(
                    ...chunkFloors.map((f) => floorMap.get(f)!.length),
                    0
                  );

                  return (
                    <div key={chunkIdx}>
                      {chunkIdx > 0 && (
                        <div className="h-px bg-zinc-100 mb-6" />
                      )}
                      <div
                        className="grid gap-[6px]"
                        style={{
                          gridTemplateColumns: `repeat(${chunkFloors.length}, minmax(0, 1fr))`,
                        }}
                      >
                        {/* Floor headers */}
                        {chunkFloors.map((floor) => (
                          <div
                            key={floor}
                            className="text-center text-[10px] font-bold uppercase tracking-widest text-zinc-400 pb-2 border-b border-zinc-200"
                          >
                            Floor {floor}
                          </div>
                        ))}

                        {/* Unit cells */}
                        {Array.from({ length: chunkMaxRows }, (_, rowIdx) =>
                          chunkFloors.map((floor) => {
                            const unitList = floorMap.get(floor)!;
                            const u = unitList[rowIdx];
                            if (!u) {
                              return (
                                <div
                                  key={`${floor}-${rowIdx}-empty`}
                                  className="h-9"
                                />
                              );
                            }

                            const colors = COLOR_MAP[u.projectedColor];

                            return (
                              <div
                                key={u.id}
                                className="relative flex items-center justify-center h-9 rounded-[7px] border text-[11px] font-semibold text-zinc-800 select-none"
                                style={{
                                  backgroundColor: colors.printBg,
                                  borderColor: colors.printBorder,
                                }}
                                title={`Unit ${u.unitNumber} — ${u.status}`}
                              >
                                {u.unitNumber}
                                {u.todayBadge && (
                                  <span
                                    className="absolute -top-1.5 -right-1.5 min-h-4 min-w-4 px-0.5 rounded-full text-[7px] font-bold text-white flex items-center justify-center shadow-sm leading-none"
                                    style={{ backgroundColor: BADGE_COLOR[u.todayBadge] }}
                                  >
                                    {u.todayBadge}
                                  </span>
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    </div>
                  );
                }
              )}
            </div>

            {/* Footer */}
            <div className="px-10 py-5 border-t border-zinc-100 flex items-center justify-between">
              <p className="text-[10px] text-zinc-400">
                Generated {new Date().toLocaleString()} — FSR Blinds
              </p>
              <p className="text-[10px] text-zinc-400">
                As of {formatDate(asOfDate)} · {floors.length} floors ·{" "}
                {Array.from(floorMap.values()).reduce(
                  (acc, arr) => acc + arr.length,
                  0
                )}{" "}
                units
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles injected inline */}
      <style>{`
        @media print {
          /* Hide everything that is NOT the report, an ancestor of the report, or a descendant of the report */
          body *:not(.print-report-root):not(:has(.print-report-root)):not(.print-report-root *) {
            display: none !important;
          }

          /* Un-constrain all ancestors so the report can flow naturally over multiple pages */
          body, html, *:has(.print-report-root) {
            overflow: visible !important;
            height: auto !important;
            position: static !important;
            transform: none !important;
            max-width: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
          }

          /* Ensure the root of the report and scroll area behave as blocks */
          .print-report-root, .print-report-scroll-area {
            position: relative !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }

          /* Specific hiding within the report */
          .print\\:hidden { display: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:rounded-none { border-radius: 0 !important; }
          .print\\:mx-0 { margin-left: 0 !important; margin-right: 0 !important; }
        }
      `}</style>
    </div>
  );
}

function MetaCell({
  icon,
  label,
  value,
  accent,
  valueClassName,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
  /** Override default `truncate` for long values (e.g. street address). */
  valueClassName?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-1 px-3 py-2.5 rounded-xl border ${
        accent
          ? "bg-emerald-50 border-emerald-200"
          : "bg-zinc-50 border-zinc-200"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
          {label}
        </span>
      </div>
      <p
        className={`text-[13px] font-semibold ${
          valueClassName ?? "truncate"
        } ${accent ? "text-emerald-800" : "text-zinc-800"}`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function StatusGridReport({ units, clients, buildings }: Props) {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [asOfDate, setAsOfDate] = useState<string>(isoToday());
  const [showReport, setShowReport] = useState(false);

  // Filtered buildings per client
  const availableBuildings = useMemo(
    () =>
      selectedClientId
        ? buildings.filter((b) => b.clientId === selectedClientId)
        : buildings,
    [selectedClientId, buildings]
  );

  // Units for this building
  const filteredUnits = useMemo(() => {
    if (!selectedBuildingId) return [];
    return units.filter((u) => u.buildingId === selectedBuildingId);
  }, [selectedBuildingId, units]);

  // Enrich units with badge + color
  const reportUnits: ReportUnit[] = useMemo(
    () =>
      filteredUnits.map((u) => ({
        ...u,
        todayBadge: getTodayBadge(u.status),
        projectedColor: getProjectedColor(u, asOfDate),
      })),
    [filteredUnits, asOfDate]
  );

  // Group by floor → sorted unit list
  const floorMap = useMemo(() => {
    const map = new Map<string, ReportUnit[]>();
    for (const u of reportUnits) {
      const floor = getFloor(u.unitNumber);
      if (!map.has(floor)) map.set(floor, []);
      map.get(floor)!.push(u);
    }
    for (const [, arr] of map) {
      arr.sort((a, b) =>
        a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
      );
    }
    return new Map(
      [...map.entries()].sort((a, b) =>
        a[0].localeCompare(b[0], undefined, { numeric: true })
      )
    );
  }, [reportUnits]);

  const floors = [...floorMap.keys()];
  const maxRows = Math.max(...floors.map((f) => floorMap.get(f)!.length), 0);

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);



  return (
    <>
      <div className="min-h-[100dvh]">
        {/* Page Header */}
        <div className="sticky top-0 z-20 bg-card border-b border-border-subtle px-4 pt-12 pb-3 shadow-[0_1px_0_var(--border-subtle)] flex items-end justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted mb-0.5">
              Owner Reports
            </p>
            <h1 className="text-[22px] font-semibold tracking-tight text-foreground">
              Status Grid
            </h1>
          </div>
          <button
            id="report-produce-btn"
            onClick={() => setShowReport(true)}
            className="flex items-center gap-1.5 bg-zinc-800 text-white text-[12px] font-semibold px-3 py-1.5 rounded-[8px] hover:bg-zinc-700 active:scale-95 transition-all mb-0.5"
          >
            <Printer size={14} />
            Produce Report
          </button>
        </div>

        {/* Filters */}
        <div className="px-4 py-4 space-y-3 border-b border-border-subtle bg-card/60">
          {/* Client */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted block mb-1.5">
              Client
            </label>
            <div className="relative">
              <FunnelSimple
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <select
                id="report-client-select"
                className="w-full appearance-none surface-card border border-border rounded-[10px] pl-8 pr-4 py-2.5 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent bg-card"
                value={selectedClientId}
                onChange={(e) => {
                  setSelectedClientId(e.target.value);
                  setSelectedBuildingId("");
                }}
              >
                <option value="">Select client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Building */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted block mb-1.5">
              Building
            </label>
            <div className="relative">
              <FunnelSimple
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <select
                id="report-building-select"
                className="w-full appearance-none surface-card border border-border rounded-[10px] pl-8 pr-4 py-2.5 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent bg-card disabled:opacity-50"
                value={selectedBuildingId}
                onChange={(e) => setSelectedBuildingId(e.target.value)}
                disabled={!selectedClientId}
              >
                <option value="">Select building…</option>
                {availableBuildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* As-of Date */}
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-muted block mb-1.5">
              As of Date
            </label>
            <div className="relative">
              <CalendarBlank
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              />
              <input
                id="report-asof-date"
                type="date"
                className="w-full surface-card border border-border rounded-[10px] pl-8 pr-4 py-2.5 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent bg-card"
                value={asOfDate}
                onChange={(e) => setAsOfDate(e.target.value)}
              />
            </div>
          </div>
        </div>

        {/* Empty state */}
        {!selectedBuildingId && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mb-3">
              <FunnelSimple size={24} className="text-muted" />
            </div>
            <p className="text-[14px] font-semibold text-foreground mb-1">
              Select a client and building
            </p>
            <p className="text-[12px] text-muted">
              The status grid will appear here once you filter down to a
              specific building.
            </p>
          </div>
        )}

        {/* Grid */}
        {selectedBuildingId && floors.length > 0 && (
          <>
            {/* Legend + Actions */}
            <div className="px-4 pt-4 pb-2 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {(
                  [
                    "measured",
                    "bracketed",
                    "manufactured",
                    "installed",
                  ] as const
                ).map((key) => (
                  <span
                    key={key}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-md border"
                    style={{
                      backgroundColor: COLOR_MAP[key].dot + "22",
                      borderColor: COLOR_MAP[key].dot,
                      color: COLOR_MAP[key].dot,
                    }}
                  >
                    {COLOR_MAP[key].label}
                  </span>
                ))}
                <span className="text-[11px] font-semibold px-2.5 py-1 rounded-md border border-border text-muted bg-surface">
                  Unscheduled
                </span>
              </div>

            </div>

            {/* Badge legend */}
            <div className="px-4 pb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <p className="text-[11px] text-muted">Today&apos;s badge:</p>
              {(["M", "B", "MF", "I"] as const).map((letter) => (
                <div key={letter} className="flex items-center gap-1">
                  <span className="min-w-5 h-5 px-0.5 rounded-full bg-foreground/10 border border-border text-[8px] font-bold text-foreground flex items-center justify-center leading-none">
                    {letter}
                  </span>
                  <span className="text-[11px] text-muted">
                    {letter === "M"
                      ? "Measured"
                      : letter === "B"
                        ? "Bracketed"
                        : letter === "MF"
                          ? "Manufactured"
                          : "Installed"}
                  </span>
                </div>
              ))}
            </div>

            {/* Scrollable grid */}
            <div className="overflow-x-auto px-4 pb-8">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${floors.length}, minmax(80px, 1fr))`,
                }}
              >
                {/* Floor headers */}
                {floors.map((floor) => (
                  <div
                    key={floor}
                    className="text-center text-[11px] font-bold uppercase tracking-widest text-muted pb-1 border-b border-border-subtle"
                  >
                    Floor {floor}
                  </div>
                ))}

                {/* Unit cells */}
                {Array.from({ length: maxRows }, (_, rowIdx) =>
                  floors.map((floor) => {
                    const unitList = floorMap.get(floor)!;
                    const u = unitList[rowIdx];
                    if (!u) {
                      return (
                        <div
                          key={`${floor}-${rowIdx}-empty`}
                          className="h-10"
                        />
                      );
                    }

                    const { bg, border } = COLOR_MAP[u.projectedColor];

                    return (
                      <Link
                        key={u.id}
                        href={`/management/units/${u.id}`}
                        className={`relative flex items-center justify-center h-10 rounded-[8px] border text-[12px] font-semibold text-foreground select-none cursor-pointer transition-all hover:ring-2 hover:ring-accent/50 hover:scale-[1.04] active:scale-100 ${bg} ${border}`}
                        title={`Unit ${u.unitNumber} — ${u.status}${u.bracketingDate ? ` | Bracket: ${u.bracketingDate}` : ""}${u.installationDate ? ` | Install: ${u.installationDate}` : ""}`}
                      >
                        {u.unitNumber}
                        {u.todayBadge && (
                          <span
                            className="absolute -top-1.5 -right-1.5 min-h-4 min-w-4 px-0.5 rounded-full text-[7px] font-bold text-white flex items-center justify-center shadow-sm leading-none"
                            style={{ backgroundColor: BADGE_COLOR[u.todayBadge] }}
                          >
                            {u.todayBadge}
                          </span>
                        )}
                      </Link>
                    );
                  })
                )}
              </div>
            </div>
          </>
        )}

        {/* No units in building */}
        {selectedBuildingId && floors.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <p className="text-[14px] font-semibold text-foreground mb-1">
              No units found
            </p>
            <p className="text-[12px] text-muted">
              There are no units in this building yet.
            </p>
          </div>
        )}
      </div>

      {/* Report Preview Modal */}
      {showReport && selectedBuilding && selectedClient && (
        <ReportPreviewModal
          clientName={selectedClient.name}
          buildingName={selectedBuilding.name}
          buildingAddress={selectedBuilding.address ?? ""}
          asOfDate={asOfDate}
          floorMap={floorMap}
          floors={floors}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}
