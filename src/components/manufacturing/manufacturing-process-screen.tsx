"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Factory,
  FunnelSimple,
  SortAscending,
  Trash,
  X,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { DateInput } from "@/components/ui/date-input";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { PageHeader } from "@/components/ui/page-header";
import { formatStoredDateForDisplay } from "@/lib/created-date";
import {
  aggregateManufacturingProcessRows,
  filterManufacturingProcessRows,
  getManufacturingProcessFilterOptions,
  MANUFACTURING_PROCESS_SORT_FIELD_LABELS,
  sortManufacturingProcessRows,
  type ManufacturingProcessFilters,
  type ManufacturingProcessFloorGrouping,
  type ManufacturingProcessFloorRow,
  type ManufacturingProcessInstallStatusFilter,
  type ManufacturingProcessRow,
  type ManufacturingProcessSortField,
  type ManufacturingProcessSortLevel,
} from "@/lib/manufacturing-process";

const INSTALL_STATUS_OPTIONS: { value: ManufacturingProcessInstallStatusFilter; label: string }[] = [
  { value: "all", label: "All units" },
  { value: "installed", label: "Installed" },
  { value: "not_installed", label: "Not installed" },
];

const SHORT_DUE_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
};

const sortFieldOptions = Object.entries(MANUFACTURING_PROCESS_SORT_FIELD_LABELS).map(
  ([value, label]) => ({
    value: value as ManufacturingProcessSortField,
    label,
  })
);

function formatDueDate(value: string | null) {
  return formatStoredDateForDisplay(value, undefined, SHORT_DUE_FORMAT) ?? "—";
}

function formatPercent(completed: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((completed / total) * 100)}%`;
}

function ManufacturingProcessSortModal({
  draftLevels,
  fieldOptions,
  onClose,
  onApply,
  onChange,
}: {
  draftLevels: ManufacturingProcessSortLevel[];
  fieldOptions: { value: ManufacturingProcessSortField; label: string }[];
  onClose: () => void;
  onApply: (levels: ManufacturingProcessSortLevel[]) => void;
  onChange: (levels: ManufacturingProcessSortLevel[]) => void;
}) {
  function addLevel() {
    if (draftLevels.length >= 3) return;
    const usedFields = new Set(draftLevels.map((level) => level.field));
    const nextField = fieldOptions.find((option) => !usedFields.has(option.value))?.value;
    if (!nextField) return;
    onChange([...draftLevels, { field: nextField, direction: "asc" }]);
  }

  function removeLevel(index: number) {
    onChange(draftLevels.filter((_, idx) => idx !== index));
  }

  function updateLevel(index: number, patch: Partial<ManufacturingProcessSortLevel>) {
    onChange(draftLevels.map((level, idx) => (idx === index ? { ...level, ...patch } : level)));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 pb-16 backdrop-blur-sm sm:items-center sm:pb-0"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-sm overflow-y-auto rounded-t-[var(--radius-xl)] border border-border bg-card p-6 pb-10 shadow-xl sm:rounded-[var(--radius-xl)] sm:pb-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-foreground">Sort results</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-tertiary hover:bg-surface"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
        <p className="mb-4 text-[12px] text-tertiary">Add up to 3 sort levels.</p>

        <div className="space-y-2">
          {draftLevels.map((level, index) => {
            const usedFields = new Set(
              draftLevels.filter((_, idx) => idx !== index).map((entry) => entry.field)
            );
            const availableOptions = fieldOptions.filter((option) => !usedFields.has(option.value));
            return (
              <div
                key={index}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface/50 px-3 py-2.5"
              >
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                  {index + 1}
                </span>
                <select
                  value={level.field}
                  onChange={(event) =>
                    updateLevel(index, {
                      field: event.target.value as ManufacturingProcessSortField,
                    })
                  }
                  className="min-w-0 flex-1 rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium text-foreground focus:outline-none"
                >
                  {availableOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    updateLevel(index, {
                      direction: level.direction === "asc" ? "desc" : "asc",
                    })
                  }
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-card text-secondary transition-colors hover:bg-surface"
                  title={level.direction === "asc" ? "Ascending" : "Descending"}
                >
                  {level.direction === "asc" ? (
                    <ArrowUp size={13} weight="bold" />
                  ) : (
                    <ArrowDown size={13} weight="bold" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => removeLevel(index)}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-tertiary transition-colors hover:bg-red-50 hover:text-red-500"
                >
                  <Trash size={13} />
                </button>
              </div>
            );
          })}

          {draftLevels.length < 3 && (
            <button
              type="button"
              onClick={addLevel}
              className="w-full rounded-xl border border-dashed border-border py-2.5 text-xs font-medium text-tertiary transition-colors hover:border-accent hover:text-accent"
            >
              + Add sort level
            </button>
          )}
        </div>

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3 py-2.5 text-[13px] font-semibold text-secondary hover:bg-surface"
          >
            <Trash size={13} />
            Clear
          </button>
          <button
            type="button"
            onClick={() => onApply(draftLevels)}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-accent/90"
          >
            Apply sort
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManufacturingProcessScreen({
  rows,
  title = "Manufacturing Process",
  backHref,
  unitHrefBase,
  hideClient = false,
  floorGrouping = "client_building_floor",
  compactFilterRail = false,
}: {
  rows: ManufacturingProcessRow[];
  title?: string;
  backHref: string;
  unitHrefBase: string;
  hideClient?: boolean;
  floorGrouping?: ManufacturingProcessFloorGrouping;
  compactFilterRail?: boolean;
}) {
  const router = useRouter();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const totalsRowRef = useRef<HTMLTableRowElement | null>(null);
  const [showByUnit, setShowByUnit] = useState(true);
  const [sortLevels, setSortLevels] = useState<ManufacturingProcessSortLevel[]>([]);
  const [draftSortLevels, setDraftSortLevels] = useState<ManufacturingProcessSortLevel[]>([]);
  const [sortModalOpen, setSortModalOpen] = useState(false);
  const [stickyTop, setStickyTop] = useState(132);
  const [totalsRowHeight, setTotalsRowHeight] = useState(38);
  const [filters, setFilters] = useState<ManufacturingProcessFilters>({
    clientId: "all",
    buildingId: "all",
    floor: "all",
    installStatus: "all",
    completeByDate: "",
  });

  const clientScopedOptions = useMemo(
    () => getManufacturingProcessFilterOptions(rows, filters.clientId, "all"),
    [filters.clientId, rows]
  );

  const normalizedBuildingId =
    filters.buildingId !== "all" &&
    !clientScopedOptions.buildings.some((option) => option.value === filters.buildingId)
      ? "all"
      : filters.buildingId;

  const filterOptions = useMemo(
    () => getManufacturingProcessFilterOptions(rows, filters.clientId, normalizedBuildingId),
    [filters.clientId, normalizedBuildingId, rows]
  );

  const normalizedFloor =
    filters.floor !== "all" && !filterOptions.floors.some((floor) => floor === filters.floor)
      ? "all"
      : filters.floor;

  const normalizedFilters = useMemo(
    () => ({
      ...filters,
      buildingId: normalizedBuildingId,
      floor: normalizedFloor,
    }),
    [filters, normalizedBuildingId, normalizedFloor]
  );

  const filteredRows = useMemo(
    () => filterManufacturingProcessRows(rows, normalizedFilters),
    [normalizedFilters, rows]
  );

  const groupedRows = useMemo(
    () => aggregateManufacturingProcessRows(filteredRows, floorGrouping),
    [filteredRows, floorGrouping]
  );

  const visibleSortFieldOptions = useMemo(
    () => {
      let options = hideClient
        ? sortFieldOptions.filter((option) => option.value !== "clientName")
        : sortFieldOptions;
      if (!showByUnit) {
        options = options.filter((option) => option.value !== "unitNumber");
      }
      return options;
    },
    [hideClient, showByUnit]
  );

  const normalizedSortLevels = useMemo(
    () =>
      showByUnit ? sortLevels : sortLevels.filter((level) => level.field !== "unitNumber"),
    [showByUnit, sortLevels]
  );

  const sortedUnitRows = useMemo(
    () => sortManufacturingProcessRows(filteredRows, normalizedSortLevels),
    [filteredRows, normalizedSortLevels]
  );

  const sortedGroupedRows = useMemo(
    () => sortManufacturingProcessRows(groupedRows, normalizedSortLevels),
    [groupedRows, normalizedSortLevels]
  );

  const displayRows = showByUnit ? sortedUnitRows : sortedGroupedRows;

  const activeFilterCount = [
    !hideClient && normalizedFilters.clientId !== "all",
    normalizedFilters.buildingId !== "all",
    normalizedFilters.floor !== "all",
    normalizedFilters.installStatus !== "all",
    normalizedFilters.completeByDate !== "",
  ].filter(Boolean).length;

  const activeSortCount = normalizedSortLevels.length;

  const clientOptions = [{ value: "all", label: "All clients" }, ...filterOptions.clients];
  const buildingOptions = [{ value: "all", label: "All buildings" }, ...filterOptions.buildings];
  const floorOptions = [
    { value: "all", label: "All floors" },
    ...filterOptions.floors.map((floor) => ({ value: floor, label: `Floor ${floor}` })),
  ];

  function resetFilters() {
    setFilters({
      clientId: "all",
      buildingId: "all",
      floor: "all",
      installStatus: "all",
      completeByDate: "",
    });
  }

  const totals = useMemo(
    () => ({
      totalBlinds: displayRows.reduce((sum, row) => sum + row.totalBlinds, 0),
      cutCount: displayRows.reduce((sum, row) => sum + row.cutCount, 0),
      assembledCount: displayRows.reduce((sum, row) => sum + row.assembledCount, 0),
      qcCount: displayRows.reduce((sum, row) => sum + row.qcCount, 0),
      installedCount: displayRows.reduce((sum, row) => sum + row.installedCount, 0),
    }),
    [displayRows]
  );

  const subtitle =
    rows.length === 0
      ? "No units available"
      : filteredRows.length === rows.length
        ? `${rows.length} units`
        : `${filteredRows.length} of ${rows.length} units`;

  const countLabel = showByUnit ? `${displayRows.length} units` : `${displayRows.length} floors`;
  const floorStickyClass =
    "sticky left-0 z-20 min-w-[3.25rem] bg-inherit shadow-[1px_0_0_0_theme(colors.border)]";
  const unitStickyClass =
    "sticky left-[3.25rem] z-20 min-w-[4.25rem] bg-inherit shadow-[1px_0_0_0_theme(colors.border)]";
  const filterRailClass = compactFilterRail
    ? "flex items-center gap-1.5 overflow-x-auto no-scrollbar"
    : "flex items-center gap-2 overflow-x-auto no-scrollbar";
  const compactFilterTriggerClass = compactFilterRail
    ? "max-w-[10.5rem] pr-2.5"
    : "";
  const compactFloorTriggerClass = compactFilterRail ? "w-[5.5rem] pr-2.5" : "";
  const compactInstallTriggerClass = compactFilterRail ? "max-w-[9.5rem] pr-2.5" : "";
  const compactDateTriggerClass = compactFilterRail
    ? "h-8 w-[9.5rem] min-w-[9.5rem] justify-between rounded-full border border-border bg-card px-3 text-xs font-medium text-secondary hover:border-zinc-300"
    : "h-8 rounded-full border border-border bg-card px-3 text-xs font-medium text-secondary hover:border-zinc-300";
  const compactDateClass = compactFilterRail ? "w-[9.5rem] min-w-[9.5rem] flex-shrink-0" : "min-w-[12rem] flex-shrink-0";
  const stickyTotalsCellClass =
    "sticky top-[var(--process-sticky-top)] z-20 bg-card";
  const stickyTotalsPinnedCellClass =
    `${stickyTotalsCellClass} z-30`;
  const stickyColumnHeaderCellClass =
    "sticky top-[calc(var(--process-sticky-top)+var(--process-totals-row-height))] z-10 bg-surface";
  const stickyColumnHeaderPinnedCellClass =
    `${stickyColumnHeaderCellClass} z-20`;

  useEffect(() => {
    const headerNode = headerRef.current;
    const totalsNode = totalsRowRef.current;

    if (!headerNode || !totalsNode) return;

    const updateMeasurements = () => {
      const nextHeaderHeight = Math.ceil(headerNode.getBoundingClientRect().height);
      if (nextHeaderHeight > 0) {
        setStickyTop(nextHeaderHeight);
      }

      const nextTotalsHeight = Math.ceil(totalsNode.getBoundingClientRect().height);
      if (nextTotalsHeight > 0) {
        setTotalsRowHeight(nextTotalsHeight);
      }
    };

    updateMeasurements();

    const observer = new ResizeObserver(() => updateMeasurements());
    observer.observe(headerNode);
    observer.observe(totalsNode);
    window.addEventListener("resize", updateMeasurements);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateMeasurements);
    };
  }, [showByUnit]);

  return (
    <div
      className="flex min-h-[100dvh] flex-col"
      style={{
        ["--process-sticky-top" as string]: `${stickyTop}px`,
        ["--process-totals-row-height" as string]: `${totalsRowHeight}px`,
      }}
    >
      <div ref={headerRef}>
        <PageHeader
          title={title}
          subtitle={subtitle}
          backHref={backHref}
          actions={
            <label className="ml-auto flex items-center gap-3 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-secondary shadow-[var(--shadow-xs)]">
              <span>Show by unit</span>
              <button
                type="button"
                role="switch"
                aria-checked={showByUnit}
                onClick={() => {
                  setShowByUnit((current) => {
                    const next = !current;
                    if (!next) {
                      setDraftSortLevels((levels) =>
                        levels.filter((level) => level.field !== "unitNumber")
                      );
                      setSortLevels((levels) =>
                        levels.filter((level) => level.field !== "unitNumber")
                      );
                    }
                    return next;
                  });
                }}
                className={[
                  "inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border px-0.5 transition-all",
                  showByUnit
                    ? "justify-end border-accent bg-accent"
                    : "justify-start border-zinc-400 bg-zinc-200",
                ].join(" ")}
              >
                <span
                  className="h-5 w-5 rounded-full border border-zinc-300 bg-white shadow-sm transition-transform"
                />
              </button>
            </label>
          }
          belowTitle={
            <div className={filterRailClass}>
              <div className="flex flex-shrink-0 items-center gap-1.5 pr-1 text-tertiary">
                <FunnelSimple size={14} />
                {activeFilterCount > 0 && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setDraftSortLevels(normalizedSortLevels);
                  setSortModalOpen(true);
                }}
                className={[
                  "flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-all",
                  activeSortCount > 0
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-card text-secondary hover:border-zinc-300",
                  compactFilterRail ? "pr-2.5" : "",
                ].join(" ")}
              >
                <SortAscending size={12} weight="bold" />
                {activeSortCount > 0 ? `Sort (${activeSortCount})` : "Sort"}
              </button>
              {!hideClient && (
                <FilterDropdown
                  label="Client"
                  value={normalizedFilters.clientId}
                  options={clientOptions}
                  onChange={(value) =>
                    setFilters((current) => ({
                      ...current,
                      clientId: value,
                      buildingId: "all",
                      floor: "all",
                    }))
                  }
                />
              )}
              <FilterDropdown
                label="Building"
                value={normalizedFilters.buildingId}
                options={buildingOptions}
                triggerClassName={compactFilterTriggerClass}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    buildingId: value,
                    floor: "all",
                  }))
                }
              />
              <FilterDropdown
                label="Floor"
                value={normalizedFilters.floor}
                options={floorOptions}
                triggerClassName={compactFloorTriggerClass}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    floor: value,
                  }))
                }
              />
              <FilterDropdown
                label="Install status"
                value={normalizedFilters.installStatus}
                options={INSTALL_STATUS_OPTIONS}
                triggerClassName={compactInstallTriggerClass}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    installStatus: value as ManufacturingProcessInstallStatusFilter,
                  }))
                }
              />
              <DateInput
                value={normalizedFilters.completeByDate}
                onChange={(value) =>
                  setFilters((current) => ({
                    ...current,
                    completeByDate: value,
                  }))
                }
                placeholder="Complete by"
                compact
                className={compactDateClass}
                triggerClassName={compactDateTriggerClass}
              />
              {(activeFilterCount > 0 || activeSortCount > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    resetFilters();
                    setSortLevels([]);
                    setDraftSortLevels([]);
                  }}
                  className="flex h-8 flex-shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 text-xs font-medium text-secondary transition-colors hover:border-zinc-300 hover:text-foreground"
                >
                  <X size={11} weight="bold" />
                  Clear
                </button>
              )}
            </div>
          }
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Factory}
          title="No manufacturing units yet"
          description="Units with blinds will appear here once they are in scope for this account."
        />
      ) : displayRows.length === 0 ? (
        <EmptyState
          icon={FunnelSimple}
          title="No units match these filters"
          description="Try clearing one or more filters to see more manufacturing progress rows."
          action={
            <button
              type="button"
              onClick={() => {
                resetFilters();
                setSortLevels([]);
                setDraftSortLevels([]);
              }}
              className="rounded-[var(--radius-md)] border border-border bg-card px-4 py-2 text-sm font-medium text-secondary transition-colors hover:text-foreground"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="flex-1 px-4 py-4">
          <div className="overflow-x-auto overflow-y-visible rounded-[var(--radius-xl)] border border-border bg-card shadow-[var(--shadow-sm)]">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-center">
              <thead>
                <tr ref={totalsRowRef} className="bg-card text-[11px] text-secondary">
                  <th className={`${floorStickyClass} ${stickyTotalsPinnedCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>
                    Totals
                  </th>
                  {showByUnit ? (
                    <>
                      <th className={`${unitStickyClass} ${stickyTotalsPinnedCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>
                        {countLabel}
                      </th>
                      <th className={`${stickyTotalsCellClass} border-b border-border px-2.5 py-2.5 text-center text-tertiary`}>—</th>
                    </>
                  ) : (
                    <th className={`${stickyTotalsCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>
                      {countLabel}
                    </th>
                  )}
                  <th className={`${stickyTotalsCellClass} border-b border-border px-2.5 py-2.5 text-center font-mono font-semibold text-foreground`}>
                    {totals.totalBlinds}
                  </th>
                  <th className={`${stickyTotalsCellClass} border-b border-border px-2.5 py-2.5 text-center font-mono font-semibold text-foreground`}>
                    {formatPercent(totals.cutCount, totals.totalBlinds)}
                  </th>
                  <th className={`${stickyTotalsCellClass} border-b border-border px-2.5 py-2.5 text-center font-mono font-semibold text-foreground`}>
                    {formatPercent(totals.assembledCount, totals.totalBlinds)}
                  </th>
                  <th className={`${stickyTotalsCellClass} border-b border-border px-2.5 py-2.5 text-center font-mono font-semibold text-foreground`}>
                    {formatPercent(totals.qcCount, totals.totalBlinds)}
                  </th>
                  <th className={`${stickyTotalsCellClass} border-b border-border px-2.5 py-2.5 text-center font-mono font-semibold text-foreground`}>
                    {formatPercent(totals.installedCount, totals.totalBlinds)}
                  </th>
                </tr>
                <tr className="bg-surface text-[11px] uppercase tracking-[0.08em] text-tertiary">
                  <th className={`${floorStickyClass} ${stickyColumnHeaderPinnedCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>
                    FL
                  </th>
                  {showByUnit && (
                    <th className={`${unitStickyClass} ${stickyColumnHeaderPinnedCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>
                      U
                    </th>
                  )}
                  <th className={`${stickyColumnHeaderCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>DUE</th>
                  <th className={`${stickyColumnHeaderCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>Blinds</th>
                  <th className={`${stickyColumnHeaderCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>CUT</th>
                  <th className={`${stickyColumnHeaderCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>ASSE</th>
                  <th className={`${stickyColumnHeaderCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>QC</th>
                  <th className={`${stickyColumnHeaderCellClass} border-b border-border px-2.5 py-2.5 text-center font-semibold`}>INST</th>
                </tr>
              </thead>
              <tbody>
                {showByUnit
                  ? (displayRows as ManufacturingProcessRow[]).map((row) => (
                      <tr
                        key={row.unitId}
                        tabIndex={0}
                        role="link"
                        onClick={() => router.push(`${unitHrefBase}/${row.unitId}`)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            router.push(`${unitHrefBase}/${row.unitId}`);
                          }
                        }}
                        className={[
                          "cursor-pointer text-[13px] text-foreground transition-colors",
                          row.isInstalled
                            ? "bg-emerald-50/60 hover:bg-emerald-50"
                            : "hover:bg-surface/70",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent",
                        ].join(" ")}
                      >
                        <td
                          className={`${floorStickyClass} border-b border-border px-2.5 py-2.5 text-center text-secondary`}
                        >
                          {row.floor}
                        </td>
                        <td
                          className={`${unitStickyClass} border-b border-border px-2.5 py-2.5 text-center font-semibold tracking-tight text-foreground`}
                        >
                          {row.unitNumber}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center text-secondary">
                          {formatDueDate(row.completeByDate)}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {row.totalBlinds}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {formatPercent(row.cutCount, row.totalBlinds)}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {formatPercent(row.assembledCount, row.totalBlinds)}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {formatPercent(row.qcCount, row.totalBlinds)}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {formatPercent(row.installedCount, row.totalBlinds)}
                        </td>
                      </tr>
                    ))
                  : (displayRows as ManufacturingProcessFloorRow[]).map((row) => (
                      <tr
                        key={row.groupKey}
                        className={[
                          "text-[13px] text-foreground",
                          row.isInstalled ? "bg-emerald-50/60" : "",
                        ].join(" ")}
                      >
                        <td
                          className={`${floorStickyClass} border-b border-border px-2.5 py-2.5 text-center text-secondary`}
                        >
                          {row.floor}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center text-secondary">
                          {formatDueDate(row.completeByDate)}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {row.totalBlinds}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {formatPercent(row.cutCount, row.totalBlinds)}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {formatPercent(row.assembledCount, row.totalBlinds)}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {formatPercent(row.qcCount, row.totalBlinds)}
                        </td>
                        <td className="border-b border-border px-2.5 py-2.5 text-center font-mono text-secondary">
                          {formatPercent(row.installedCount, row.totalBlinds)}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sortModalOpen && (
        <ManufacturingProcessSortModal
          draftLevels={draftSortLevels}
          fieldOptions={visibleSortFieldOptions}
          onClose={() => setSortModalOpen(false)}
          onApply={(levels) => {
            const nextLevels = showByUnit
              ? levels
              : levels.filter((level) => level.field !== "unitNumber");
            setSortLevels(nextLevels);
            setDraftSortLevels(nextLevels);
            setSortModalOpen(false);
          }}
          onChange={setDraftSortLevels}
        />
      )}
    </div>
  );
}
