"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import type { Unit, Client, Building } from "@/lib/types";
import {
  CalendarBlank,
  FunnelSimple,
  Printer,
  X,
  Buildings,
  User,
  MapPin,
  CheckCircle,
} from "@phosphor-icons/react";
import { getFloor } from "@/lib/app-dataset";

// ─── Helpers ───────────────────────────────────────────────────────────────

function isoToday(): string {
  return new Date().toISOString().split("T")[0];
}

/** First day of the current month, as YYYY-MM-DD — a sensible default "From". */
function firstOfMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

/** A floor's completed units plus its bracket totals. */
type FloorGroup = {
  floor: string;
  units: Unit[];
  unitCount: number;
  windowTotal: number;
};

/**
 * Completed units (status === "installed") whose installation date falls within
 * [from, to] (inclusive), grouped and sorted by floor. String YYYY-MM-DD
 * comparisons are lexicographically correct, matching the Status Grid report.
 */
function buildFloorGroups(
  units: Unit[],
  buildingId: string,
  from: string,
  to: string
): FloorGroup[] {
  if (!buildingId) return [];

  const map = new Map<string, Unit[]>();
  for (const u of units) {
    if (u.buildingId !== buildingId) continue;
    if (u.status !== "installed") continue;
    if (!u.installationDate || u.installationDate < from || u.installationDate > to) continue;

    const floor = getFloor(u.unitNumber);
    if (!map.has(floor)) map.set(floor, []);
    map.get(floor)!.push(u);
  }

  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
    .map(([floor, list]) => {
      list.sort((a, b) =>
        a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true })
      );
      return {
        floor,
        units: list,
        unitCount: list.length,
        windowTotal: list.reduce((acc, u) => acc + (u.windowCount ?? 0), 0),
      };
    });
}

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
  buildingAddress: string;
  from: string;
  to: string;
  groups: FloorGroup[];
  totalUnits: number;
  totalWindows: number;
  onClose: () => void;
}

function ReportPreviewModal({
  clientName,
  buildingName,
  buildingAddress,
  from,
  to,
  groups,
  totalUnits,
  totalWindows,
  onClose,
}: ReportPreviewProps) {
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-stretch bg-zinc-900/70 backdrop-blur-sm print-report-root"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="relative flex flex-col w-full h-full bg-[#F8F7F4] overflow-hidden print-report-scroll-area">
        {/* Toolbar */}
        <div className="flex items-center justify-between px-6 py-3 bg-white border-b border-zinc-200 print:hidden shrink-0">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-zinc-400">
            Report Preview
          </span>
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
            style={{ maxWidth: 900, minWidth: 600 }}
          >
            {/* Report Header */}
            <div className="px-10 pt-10 pb-6 border-b border-zinc-100">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 mb-1">
                    Progress Report — Completed Units
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
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400">
                    Completed in period
                  </p>
                  <p className="text-[26px] font-bold text-zinc-900 leading-tight">
                    {totalUnits}
                    <span className="text-[14px] font-semibold text-zinc-400"> units</span>
                  </p>
                  <p className="text-[13px] font-semibold text-zinc-500">
                    {totalWindows} windows
                  </p>
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
                  label="From"
                  value={formatDate(from)}
                  accent
                />
                <MetaCell
                  icon={<CalendarBlank size={13} className="text-zinc-400" />}
                  label="To"
                  value={formatDate(to)}
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

            {/* Floor sections */}
            <div className="px-10 py-6 space-y-5">
              {groups.length === 0 ? (
                <p className="text-[13px] text-zinc-500 py-8 text-center">
                  No units were completed in this period.
                </p>
              ) : (
                groups.map((g) => (
                  <div
                    key={g.floor}
                    className="rounded-xl border border-zinc-200 overflow-hidden break-inside-avoid"
                  >
                    <div className="flex items-baseline justify-between px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
                      <p className="text-[14px] font-bold text-zinc-900">
                        Floor {g.floor}
                      </p>
                      <p className="text-[12px] font-semibold text-zinc-500">
                        {g.unitCount} {g.unitCount === 1 ? "unit" : "units"} ·{" "}
                        {g.windowTotal} {g.windowTotal === 1 ? "window" : "windows"}
                      </p>
                    </div>
                    <div className="divide-y divide-zinc-100">
                      {g.units.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center justify-between px-4 py-2"
                        >
                          <span className="text-[13px] font-semibold text-zinc-800">
                            Unit {u.unitNumber}
                          </span>
                          <span className="text-[12px] text-zinc-500">
                            {u.windowCount}{" "}
                            {u.windowCount === 1 ? "window" : "windows"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="px-10 py-5 border-t border-zinc-100 flex items-center justify-between">
              <p className="text-[10px] text-zinc-400">
                Generated {new Date().toLocaleString()} — FSR Blinds
              </p>
              <p className="text-[10px] text-zinc-400">
                {formatDate(from)} – {formatDate(to)} · {groups.length} floors ·{" "}
                {totalUnits} units · {totalWindows} windows
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Print styles injected inline */}
      <style>{`
        @media print {
          body *:not(.print-report-root):not(:has(.print-report-root)):not(.print-report-root *) {
            display: none !important;
          }
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
          .print-report-root, .print-report-scroll-area {
            position: relative !important;
            height: auto !important;
            overflow: visible !important;
            background: white !important;
          }
          .break-inside-avoid { break-inside: avoid; }
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
  valueClassName?: string;
}) {
  return (
    <div
      className={`flex flex-col gap-1 px-3 py-2.5 rounded-xl border ${
        accent ? "bg-emerald-50 border-emerald-200" : "bg-zinc-50 border-zinc-200"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {icon}
        <span className="text-[9px] font-bold uppercase tracking-widest text-zinc-400">
          {label}
        </span>
      </div>
      <p
        className={`text-[13px] font-semibold ${valueClassName ?? "truncate"} ${
          accent ? "text-emerald-800" : "text-zinc-800"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────

export function ProgressReport({ units, clients, buildings }: Props) {
  const [selectedClientId, setSelectedClientId] = useState<string>("");
  const [selectedBuildingId, setSelectedBuildingId] = useState<string>("");
  const [from, setFrom] = useState<string>(firstOfMonth());
  const [to, setTo] = useState<string>(isoToday());
  const [showReport, setShowReport] = useState(false);

  const availableBuildings = useMemo(
    () =>
      selectedClientId
        ? buildings.filter((b) => b.clientId === selectedClientId)
        : buildings,
    [selectedClientId, buildings]
  );

  const groups = useMemo(
    () => buildFloorGroups(units, selectedBuildingId, from, to),
    [units, selectedBuildingId, from, to]
  );

  const totalUnits = useMemo(
    () => groups.reduce((acc, g) => acc + g.unitCount, 0),
    [groups]
  );
  const totalWindows = useMemo(
    () => groups.reduce((acc, g) => acc + g.windowTotal, 0),
    [groups]
  );

  const selectedClient = clients.find((c) => c.id === selectedClientId);
  const selectedBuilding = buildings.find((b) => b.id === selectedBuildingId);
  const rangeInvalid = Boolean(from && to && from > to);

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
              Progress Report
            </h1>
          </div>
          <button
            onClick={() => setShowReport(true)}
            disabled={!selectedBuildingId}
            className="flex items-center gap-1.5 bg-zinc-800 text-white text-[12px] font-semibold px-3 py-1.5 rounded-[8px] hover:bg-zinc-700 active:scale-95 transition-all mb-0.5 disabled:opacity-40 disabled:pointer-events-none"
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

          {/* Date range */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted block mb-1.5">
                From
              </label>
              <div className="relative">
                <CalendarBlank
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <input
                  type="date"
                  className="w-full surface-card border border-border rounded-[10px] pl-8 pr-3 py-2.5 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent bg-card"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-widest text-muted block mb-1.5">
                To
              </label>
              <div className="relative">
                <CalendarBlank
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                />
                <input
                  type="date"
                  className="w-full surface-card border border-border rounded-[10px] pl-8 pr-3 py-2.5 text-[13px] font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-accent bg-card"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted">
            Shows units fully installed with an installation date in this range
            (inclusive).
          </p>
          {rangeInvalid ? (
            <p className="text-[11px] font-semibold text-red-500">
              The “From” date is after the “To” date.
            </p>
          ) : null}
        </div>

        {/* Summary */}
        {selectedBuildingId && groups.length > 0 && (
          <div className="px-4 pt-4">
            <div className="flex items-center gap-2 surface-card border border-border rounded-[12px] px-4 py-3">
              <CheckCircle size={20} weight="fill" className="text-emerald-500" />
              <div>
                <p className="text-[13px] font-semibold text-foreground">
                  {totalUnits} {totalUnits === 1 ? "unit" : "units"} completed ·{" "}
                  {totalWindows} {totalWindows === 1 ? "window" : "windows"} installed
                </p>
                <p className="text-[11px] text-muted">
                  Across {groups.length} {groups.length === 1 ? "floor" : "floors"} ·{" "}
                  {formatDate(from)} – {formatDate(to)}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Empty states */}
        {!selectedBuildingId && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-14 h-14 rounded-full bg-surface flex items-center justify-center mb-3">
              <FunnelSimple size={24} className="text-muted" />
            </div>
            <p className="text-[14px] font-semibold text-foreground mb-1">
              Select a client and building
            </p>
            <p className="text-[12px] text-muted">
              Completed units, grouped by floor, will appear here once you pick a
              building.
            </p>
          </div>
        )}

        {selectedBuildingId && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <p className="text-[14px] font-semibold text-foreground mb-1">
              No completed units in this period
            </p>
            <p className="text-[12px] text-muted">
              No units in this building were fully installed between{" "}
              {formatDate(from)} and {formatDate(to)}.
            </p>
          </div>
        )}

        {/* Floor list */}
        {selectedBuildingId && groups.length > 0 && (
          <div className="px-4 py-4 space-y-4">
            {groups.map((g) => (
              <div
                key={g.floor}
                className="surface-card border border-border rounded-[12px] overflow-hidden"
              >
                <div className="flex items-baseline justify-between px-4 py-2.5 bg-surface border-b border-border-subtle">
                  <p className="text-[14px] font-bold text-foreground">
                    Floor {g.floor}
                  </p>
                  <p className="text-[12px] font-semibold text-muted">
                    {g.unitCount} {g.unitCount === 1 ? "unit" : "units"} ·{" "}
                    {g.windowTotal} {g.windowTotal === 1 ? "window" : "windows"}
                  </p>
                </div>
                <div className="divide-y divide-border-subtle">
                  {g.units.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center justify-between px-4 py-2.5"
                    >
                      <span className="text-[13px] font-semibold text-foreground">
                        Unit {u.unitNumber}
                      </span>
                      <span className="text-[12px] text-muted">
                        {u.windowCount} {u.windowCount === 1 ? "window" : "windows"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report Preview Modal */}
      {showReport && selectedBuilding && selectedClient && (
        <ReportPreviewModal
          clientName={selectedClient.name}
          buildingName={selectedBuilding.name}
          buildingAddress={selectedBuilding.address ?? ""}
          from={from}
          to={to}
          groups={groups}
          totalUnits={totalUnits}
          totalWindows={totalWindows}
          onClose={() => setShowReport(false)}
        />
      )}
    </>
  );
}
