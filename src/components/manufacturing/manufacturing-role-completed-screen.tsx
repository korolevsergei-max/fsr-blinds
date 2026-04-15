"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, FunnelSimple, SignOut, X } from "@phosphor-icons/react";
import { signOut } from "@/app/actions/auth-actions";
import {
  returnWindowToAssembler,
  returnWindowToCutter,
  undoWindowAssembly,
  undoWindowCut,
} from "@/app/actions/manufacturing-actions";
import type {
  ManufacturingCompletedRoleData,
  ManufacturingCompletedWindowItem,
} from "@/lib/manufacturing-scheduler";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import {
  formatStoredDateLongEnglish,
  isStoredDateOnLocalDay,
  parseStoredDate,
} from "@/lib/created-date";
import { MultiDateFilter } from "@/components/ui/multi-date-filter";

type ManufacturingRole = "cutter" | "assembler" | "qc";
type HistoryFilter = "returned" | "issues";

type GroupedUnit = {
  unitId: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  latestCompletedAt: string | null;
  blindTypeGroups: Array<{
    blindType: ManufacturingCompletedWindowItem["blindType"];
    windows: ManufacturingCompletedWindowItem[];
  }>;
};

function formatMeasurement(item: ManufacturingCompletedWindowItem) {
  return `${item.blindWidth ?? item.width ?? "—"} × ${item.blindHeight ?? item.height ?? "—"}${
    item.blindDepth != null ? ` × ${item.blindDepth}` : item.depth != null ? ` × ${item.depth}` : ""
  }`;
}

function formatStageDate(label: string, value: string | null) {
  return `${label}: ${formatStoredDateLongEnglish(value?.slice(0, 10) ?? null) ?? "—"}`;
}

function getCompletedLabel(role: ManufacturingRole) {
  return role === "cutter" ? "Cut" : role === "assembler" ? "Assembled" : "Built";
}

function hasHistoryMatch(item: ManufacturingCompletedWindowItem, filters: HistoryFilter[]) {
  if (filters.length === 0) return true;
  return filters.some((filter) => {
    if (filter === "returned") {
      return item.escalationHistory.some((entry) => entry.escalationType === "pushback");
    }
    return item.escalationHistory.length > 0 || item.issueStatus !== "none";
  });
}

function compareNullableDesc(a: string | null, b: string | null) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return b.localeCompare(a);
}

function groupUnits(items: ManufacturingCompletedWindowItem[]): GroupedUnit[] {
  const byUnit = new Map<string, GroupedUnit>();

  for (const item of items) {
    const existing = byUnit.get(item.unitId);
    if (!existing) {
      byUnit.set(item.unitId, {
        unitId: item.unitId,
        unitNumber: item.unitNumber,
        buildingName: item.buildingName,
        clientName: item.clientName,
        installationDate: item.installationDate,
        latestCompletedAt: item.roleCompletedAt,
        blindTypeGroups: [{ blindType: item.blindType, windows: [item] }],
      });
      continue;
    }

    if (compareNullableDesc(item.roleCompletedAt, existing.latestCompletedAt) < 0) {
      existing.latestCompletedAt = item.roleCompletedAt;
    }
    const group = existing.blindTypeGroups.find((entry) => entry.blindType === item.blindType);
    if (group) {
      group.windows.push(item);
    } else {
      existing.blindTypeGroups.push({ blindType: item.blindType, windows: [item] });
    }
  }

  return [...byUnit.values()]
    .map((unit) => ({
      ...unit,
      blindTypeGroups: unit.blindTypeGroups
        .map((group) => ({
          ...group,
          windows: [...group.windows].sort((a, b) => {
            const dateCompare = compareNullableDesc(a.roleCompletedAt, b.roleCompletedAt);
            if (dateCompare !== 0) return dateCompare;
            if (a.roomName !== b.roomName) return a.roomName.localeCompare(b.roomName, undefined, { numeric: true });
            return a.label.localeCompare(b.label, undefined, { numeric: true });
          }),
        }))
        .sort((a, b) => a.blindType.localeCompare(b.blindType)),
    }))
    .sort((a, b) => {
      const dateCompare = compareNullableDesc(a.latestCompletedAt, b.latestCompletedAt);
      if (dateCompare !== 0) return dateCompare;
      return a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
    });
}

export function ManufacturingRoleCompletedScreen({
  role,
  data,
  userName,
}: {
  role: ManufacturingRole;
  data: ManufacturingCompletedRoleData;
  userName?: string;
}) {
  const router = useRouter();
  const [signingOut, startSignOut] = useTransition();
  const [actionPending, startActionTransition] = useTransition();
  const [clientFilter, setClientFilter] = useState<string[]>([]);
  const [buildingFilter, setBuildingFilter] = useState<string[]>([]);
  const [installDateFilter, setInstallDateFilter] = useState<string[]>([]);
  const [completedDateFilter, setCompletedDateFilter] = useState<string[]>([]);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter[]>([]);

  const title = role === "cutter" ? "Completed cuts" : role === "assembler" ? "Completed assembly" : "Built fully";
  const greeting = userName ? `Hello, ${userName.split(" ")[0]}` : role === "qc" ? "QC" : role === "assembler" ? "Assembler" : "Cutter";

  const clientOptions = [
    { value: "all", label: "All clients" },
    ...[
      ...new Map(
        data.items.map((item) => [item.clientId, { value: item.clientId, label: item.clientName }])
      ).values(),
    ],
  ];
  const buildingOptions = [
    { value: "all", label: "All buildings" },
    ...[
      ...new Map(
        data.items
          .filter((item) => clientFilter.length === 0 || clientFilter.includes(item.clientId))
          .map((item) => [item.buildingId, { value: item.buildingId, label: item.buildingName }])
      ).values(),
    ],
  ];
  const historyOptions = [
    { value: "all", label: "All history" },
    { value: "returned", label: "Returned" },
    { value: "issues", label: "Issues" },
  ];
  const installationDateChoices = useMemo(
    () =>
      [...new Set(data.items.map((item) => item.installationDate).filter((value): value is string => Boolean(value)))]
        .sort((a, b) => a.localeCompare(b)),
    [data.items]
  );
  const completedDateChoices = useMemo(
    () =>
      [...new Set(
        data.items
          .map((item) => {
            const parsed = item.roleCompletedAt ? parseStoredDate(item.roleCompletedAt) : null;
            if (!parsed) return null;
            const year = parsed.getFullYear();
            const month = String(parsed.getMonth() + 1).padStart(2, "0");
            const day = String(parsed.getDate()).padStart(2, "0");
            return `${year}-${month}-${day}`;
          })
          .filter((value): value is string => Boolean(value))
      )].sort((a, b) => a.localeCompare(b)),
    [data.items]
  );

  const filteredItems = useMemo(
    () =>
      data.items.filter((item) => {
        if (clientFilter.length > 0 && !clientFilter.includes(item.clientId)) return false;
        if (buildingFilter.length > 0 && !buildingFilter.includes(item.buildingId)) return false;
        if (
          installDateFilter.length > 0 &&
          !installDateFilter.some((selectedDate) => isStoredDateOnLocalDay(item.installationDate, selectedDate))
        ) {
          return false;
        }
        if (
          completedDateFilter.length > 0 &&
          !completedDateFilter.some((selectedDate) => isStoredDateOnLocalDay(item.roleCompletedAt, selectedDate))
        ) {
          return false;
        }
        if (!hasHistoryMatch(item, historyFilter)) return false;
        return true;
      }),
    [buildingFilter, clientFilter, completedDateFilter, data.items, historyFilter, installDateFilter]
  );

  const groupedUnits = useMemo(() => groupUnits(filteredItems), [filteredItems]);
  const activeFilterCount = [
    clientFilter.length > 0,
    buildingFilter.length > 0,
    installDateFilter.length > 0,
    completedDateFilter.length > 0,
    historyFilter.length > 0,
  ].filter(Boolean).length;

  const handleReturnToCutter = (item: ManufacturingCompletedWindowItem) => {
    const reason = globalThis.window.prompt("Why is this blind being returned to cutter?");
    if (!reason) return;
    startActionTransition(async () => {
      const result = await returnWindowToCutter(item.windowId, reason, "");
      if (!result.ok) {
        globalThis.window.alert(result.error ?? "Failed to return blind to cutter.");
        return;
      }
      router.refresh();
    });
  };

  const handleReturnToAssembler = (item: ManufacturingCompletedWindowItem) => {
    const reason = globalThis.window.prompt("Why is this blind being returned to assembler?");
    if (!reason) return;
    startActionTransition(async () => {
      const result = await returnWindowToAssembler(item.windowId, reason, "");
      if (!result.ok) {
        globalThis.window.alert(result.error ?? "Failed to return blind to assembler.");
        return;
      }
      router.refresh();
    });
  };

  const handleUndoCut = (item: ManufacturingCompletedWindowItem) => {
    startActionTransition(async () => {
      const result = await undoWindowCut(item.windowId);
      if (!result.ok) {
        globalThis.window.alert(result.error ?? "Failed to undo cut.");
        return;
      }
      router.refresh();
    });
  };

  const handleUndoAssembly = (item: ManufacturingCompletedWindowItem) => {
    startActionTransition(async () => {
      const result = await undoWindowAssembly(item.windowId);
      if (!result.ok) {
        globalThis.window.alert(result.error ?? "Failed to undo assembly.");
        return;
      }
      router.refresh();
    });
  };

  return (
    <div className="space-y-5 px-4 pt-5 pb-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="mb-0.5 text-[12px] font-medium text-tertiary">{greeting}</p>
          <h1 className="text-[1.625rem] font-bold leading-none tracking-[-0.03em] text-foreground">
            {title}
          </h1>
        </div>
        <button
          onClick={() => startSignOut(async () => { await signOut(); })}
          disabled={signingOut}
          className="flex items-center gap-1.5 rounded-[var(--radius-md)] px-3 py-1.5 text-[12px] font-medium text-tertiary transition-colors hover:bg-surface hover:text-secondary"
        >
          <SignOut size={14} />
          Sign out
        </button>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
        <div className="flex items-center gap-1.5 flex-shrink-0 text-zinc-400">
          <FunnelSimple size={14} />
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
              {activeFilterCount}
            </span>
          )}
        </div>
        <FilterDropdown
          multiple
          label="Client"
          values={clientFilter}
          options={clientOptions}
          onChange={(values) => {
            setClientFilter(values);
            setBuildingFilter([]);
          }}
        />
        <FilterDropdown
          multiple
          label="Building"
          values={buildingFilter}
          options={buildingOptions}
          onChange={setBuildingFilter}
        />
        <MultiDateFilter
          label="Installation Date"
          values={installDateFilter}
          onChange={setInstallDateFilter}
          availableDates={installationDateChoices}
        />
        <MultiDateFilter
          label="Completed Date"
          values={completedDateFilter}
          onChange={setCompletedDateFilter}
          availableDates={completedDateChoices}
        />
        <FilterDropdown
          multiple
          label="History"
          values={historyFilter}
          options={historyOptions}
          onChange={(values) => setHistoryFilter(values as HistoryFilter[])}
        />
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={() => {
              setClientFilter([]);
              setBuildingFilter([]);
              setInstallDateFilter([]);
              setCompletedDateFilter([]);
              setHistoryFilter([]);
            }}
            className="flex h-8 flex-shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-500"
          >
            <X size={11} weight="bold" />
            Clear
          </button>
        )}
      </div>

      <div>
        <p className="text-[13px] font-semibold text-foreground">
          {filteredItems.length} blind{filteredItems.length === 1 ? "" : "s"} completed for this role
        </p>
        <p className="mt-1 text-[12px] text-tertiary">
          Includes lifecycle dates and manufacturing issue history for audit.
        </p>
      </div>

      {groupedUnits.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-foreground">No completed items in this scope</p>
          <p className="mt-1 text-[12px] text-tertiary">
            Try clearing filters or widening the completed date range.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {groupedUnits.map((unit) => (
            <div key={unit.unitId} className="overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card">
              <button
                onClick={() => router.push(`/${role}/units/${unit.unitId}`)}
                className="w-full border-b border-border/70 px-4 py-4 text-left"
              >
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                  <div>
                    <p className="text-[15px] font-semibold tracking-tight text-foreground">
                      Unit {unit.unitNumber}
                    </p>
                    <p className="mt-1 text-[12px] text-secondary">
                      {unit.buildingName} · {unit.clientName}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] font-medium text-tertiary sm:justify-end">
                    <span>
                      {unit.blindTypeGroups.reduce((sum, group) => sum + group.windows.length, 0)} blinds
                    </span>
                    {unit.installationDate && (
                      <span>Install {formatStoredDateLongEnglish(unit.installationDate) ?? unit.installationDate}</span>
                    )}
                    <span>
                      {getCompletedLabel(role)} {formatStoredDateLongEnglish(unit.latestCompletedAt?.slice(0, 10) ?? null) ?? "—"}
                    </span>
                  </div>
                </div>
              </button>

              <div className="space-y-5 px-4 py-4">
                {unit.blindTypeGroups.map((group) => (
                  <div key={`${unit.unitId}-${group.blindType}`}>
                    <div className="flex items-center gap-3 border-b border-border/70 pb-2">
                      <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-secondary">
                        {group.blindType}
                      </span>
                      <span className="text-[12px] text-tertiary">{group.windows.length} completed</span>
                    </div>

                    <div className="divide-y divide-border/60">
                      {group.windows.map((item) => {
                        const canReturnToCutter =
                          (role === "assembler" && item.productionStatus === "assembled") ||
                          (role === "qc" && item.productionStatus === "qc_approved");
                        const canReturnToAssembler = role === "qc" && item.productionStatus === "qc_approved";
                        const canUndoCut = role === "cutter" && item.productionStatus === "cut";
                        const canUndoAssembly = role === "assembler" && item.productionStatus === "assembled";

                        return (
                          <article
                            key={item.windowId}
                            className="grid gap-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start"
                          >
                            <div>
                              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                                <p className="text-[15px] font-semibold tracking-tight text-foreground">
                                  {item.label}
                                </p>
                                <span className="rounded-full bg-surface px-2 py-1 text-[11px] font-medium text-secondary">
                                  {item.roomName}
                                </span>
                                {role === "qc" ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
                                    <CheckCircle size={13} weight="fill" className="text-emerald-600" />
                                    Built
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-800">
                                    {getCompletedLabel(role)}
                                  </span>
                                )}
                              </div>

                              <div className="mt-2 space-y-1 text-[12px] text-tertiary">
                                <p>{formatStageDate("Cut", item.cutAt)}</p>
                                <p>{formatStageDate("Assembled", item.assembledAt)}</p>
                                <p>{formatStageDate("Built", item.qcApprovedAt)}</p>
                              </div>

                              {item.escalationHistory.length > 0 && (
                                <div className="mt-3 rounded-[var(--radius-md)] border border-border bg-surface/60 px-3 py-3">
                                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary">
                                    Manufacturing history
                                  </p>
                                  <div className="mt-2 space-y-2">
                                    {item.escalationHistory.map((entry) => (
                                      <div key={entry.id} className="rounded-[var(--radius-md)] border border-border/70 bg-card px-3 py-2">
                                        <p className="text-[12px] font-semibold text-foreground">
                                          {entry.sourceRole} → {entry.targetRole} · {entry.status}
                                        </p>
                                        <p className="mt-1 text-[12px] text-secondary">
                                          {entry.reason}
                                        </p>
                                        {entry.notes && (
                                          <p className="mt-1 text-[12px] text-tertiary">{entry.notes}</p>
                                        )}
                                        <p className="mt-1 text-[11px] text-tertiary">
                                          {formatStoredDateLongEnglish(entry.openedAt.slice(0, 10)) ?? entry.openedAt.slice(0, 10)}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {(canReturnToCutter || canReturnToAssembler || canUndoCut || canUndoAssembly) && (
                                <div className="mt-4 flex flex-wrap gap-2.5">
                                  {canUndoCut && (
                                    <button
                                      disabled={actionPending}
                                      onClick={() => handleUndoCut(item)}
                                      className="rounded-full border border-border bg-card px-3 py-2 text-[12px] font-semibold text-secondary transition-all hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Undo cut
                                    </button>
                                  )}
                                  {canUndoAssembly && (
                                    <button
                                      disabled={actionPending}
                                      onClick={() => handleUndoAssembly(item)}
                                      className="rounded-full border border-border bg-card px-3 py-2 text-[12px] font-semibold text-secondary transition-all hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Undo assembly
                                    </button>
                                  )}
                                  {canReturnToCutter && (
                                    <button
                                      disabled={actionPending}
                                      onClick={() => handleReturnToCutter(item)}
                                      className="rounded-full border border-transparent bg-amber-100 px-3 py-2 text-[12px] font-semibold text-amber-800 transition-all hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Return to cutter
                                    </button>
                                  )}
                                  {canReturnToAssembler && (
                                    <button
                                      disabled={actionPending}
                                      onClick={() => handleReturnToAssembler(item)}
                                      className="rounded-full border border-transparent bg-amber-100 px-3 py-2 text-[12px] font-semibold text-amber-800 transition-all hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                      Return to assembler
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            <div className="lg:min-w-[9rem] lg:text-right">
                              <p className="font-mono text-[15px] font-semibold leading-none tracking-tight text-foreground md:text-[16px]">
                                {formatMeasurement(item)}
                              </p>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
