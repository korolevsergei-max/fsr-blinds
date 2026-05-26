"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckSquare,
  FunnelSimple,
  MagnifyingGlass,
  Scissors,
  Square,
  X,
  ArrowUUpLeft,
} from "@phosphor-icons/react";
import { markWindowCut } from "@/app/actions/production-actions";
import { undoWindowCut } from "@/app/actions/manufacturing-actions";
import { moveUnitBackToQueue } from "@/app/actions/cutter-production-actions";
import { useSessionStorage } from "@/hooks/use-session-storage";
import { matchesQueueSearch } from "@/lib/queue-search";
import type {
  ManufacturingRoleSchedule,
  ManufacturingWindowItem,
} from "@/lib/manufacturing-scheduler";
import { formatStoredDateLongEnglish } from "@/lib/created-date";
import { FilterDropdown } from "@/components/ui/filter-dropdown";
import { getFloor } from "@/lib/app-dataset";
import type { ManufacturingHighlightSection } from "@/components/windows/manufacturing-summary-card";
import {
  UnitCard,
  isReturnedToCutter,
  type CutterUnitGroup,
} from "@/components/manufacturing/cutter-unit-card";
import { CutterBulkActionBar } from "@/components/manufacturing/cutter-bulk-action-bar";

type ComponentFilter = "all" | ManufacturingHighlightSection;
type DisplayLimit = "all" | "25" | "50" | "75" | "100";

function WindowCutActions({
  item,
  onChange,
}: {
  item: ManufacturingWindowItem;
  onChange: (windowId: string, nextStatus: "pending" | "cut") => void;
}) {
  const [pending, startTransition] = useTransition();
  const status = item.productionStatus;
  const isPending = status === "pending";

  function handleMarkCut() {
    onChange(item.windowId, "cut");
    startTransition(async () => {
      const res = await markWindowCut(item.windowId);
      if (!res.ok) {
        onChange(item.windowId, "pending");
        globalThis.window.alert(res.error ?? "Failed to mark as cut.");
      }
    });
  }

  function handleUndoCut() {
    onChange(item.windowId, "pending");
    startTransition(async () => {
      const res = await undoWindowCut(item.windowId);
      if (!res.ok) {
        onChange(item.windowId, "cut");
        globalThis.window.alert(res.error ?? "Failed to undo cut.");
      }
    });
  }

  if (isPending) {
    return (
      <button
        type="button"
        onClick={handleMarkCut}
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-[var(--radius-md)] bg-accent px-3 py-2 text-[12px] font-semibold text-white transition-opacity active:opacity-80 disabled:opacity-50"
      >
        <Scissors size={14} weight="fill" />
        {pending ? "Saving…" : "Mark cut"}
      </button>
    );
  }

  if (status === "cut") {
    return (
      <button
        type="button"
        onClick={handleUndoCut}
        disabled={pending}
        className="inline-flex items-center justify-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-card px-3 py-2 text-[12px] font-medium text-secondary transition-colors hover:bg-surface disabled:opacity-50"
      >
        <ArrowUUpLeft size={13} weight="bold" />
        {pending ? "Saving…" : "Undo cut"}
      </button>
    );
  }

  return null;
}

function MoveBackToQueueButton({ unitId }: { unitId: string }) {
  const [pending, startTransition] = useTransition();

  function handleClick() {
    if (!globalThis.window.confirm("Move this unit back to the queue? This will clear its production entry date.")) return;
    startTransition(async () => {
      const res = await moveUnitBackToQueue(unitId);
      if (!res.ok) {
        globalThis.window.alert(res.error ?? "Failed to move unit back to queue.");
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-card px-2.5 py-1 text-[11px] font-medium text-secondary transition-colors hover:bg-surface disabled:opacity-50"
    >
      {pending ? "Moving…" : "Move back to Queue"}
    </button>
  );
}

export function CutterProduction({
  schedule,
  userName,
}: {
  schedule: ManufacturingRoleSchedule;
  userName?: string;
}) {
  const router = useRouter();
  const headerRef = useRef<HTMLDivElement | null>(null);
  const [stickyTop, setStickyTop] = useState(188);

  // Filter state — mirrors CutterQueue
  const [search, setSearch] = useSessionStorage<string>("cutter-production-search", "");
  const [buildingFilter, setBuildingFilter] = useState<string[]>([]);
  const [floorFilter, setFloorFilter] = useState<string[]>([]);
  const [fabricTypeFilter, setFabricTypeFilter] = useState<string[]>([]);
  const [componentFilter, setComponentFilter] = useState<ComponentFilter>("all");
  const [displayLimit, setDisplayLimit] = useState<DisplayLimit>("all");

  // Optimistic per-window status overrides keyed by windowId.
  const [statusOverrides, setStatusOverrides] = useState<
    Map<string, "pending" | "cut">
  >(new Map());

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());

  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }
    const id = setTimeout(() => router.refresh(), 400);
    return () => clearTimeout(id);
  }, [
    router,
    search,
    buildingFilter,
    floorFilter,
    fabricTypeFilter,
    componentFilter,
  ]);

  useEffect(() => {
    const node = headerRef.current;
    if (!node) return;
    const updateHeight = () => {
      const next = Math.ceil(node.getBoundingClientRect().height);
      if (next > 0) setStickyTop(next);
    };
    updateHeight();
    const observer = new ResizeObserver(() => updateHeight());
    observer.observe(node);
    window.addEventListener("resize", updateHeight);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeight);
    };
  }, []);

  const items = useMemo(() => {
    if (statusOverrides.size === 0) return schedule.allItems;
    return schedule.allItems.map((item) => {
      const override = statusOverrides.get(item.windowId);
      if (!override) return item;
      return {
        ...item,
        productionStatus: override,
        cutAt: override === "cut" ? (item.cutAt ?? new Date().toISOString()) : null,
      };
    });
  }, [schedule.allItems, statusOverrides]);

  // A unit stays in cutter's production only while at least one window is still
  // pending. Once every window is cut (or further), the unit has moved on to
  // the assembler's queue and disappears from the cutter's view.
  const unitsStillCutting = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.productionEnteredAt == null) continue;
      if (item.productionStatus === "pending") ids.add(item.unitId);
    }
    return ids;
  }, [items]);

  const productionItems = useMemo(
    () =>
      items.filter(
        (item) =>
          item.productionEnteredAt != null && unitsStillCutting.has(item.unitId)
      ),
    [items, unitsStillCutting]
  );

  const buildingOptions = useMemo(() => [
    { value: "all", label: "All buildings" },
    ...[
      ...new Map(
        productionItems.map((item) => [
          item.buildingId,
          { value: item.buildingId, label: item.buildingName },
        ])
      ).values(),
    ],
  ], [productionItems]);

  const floorOptions = useMemo(() => [
    { value: "all", label: "All floors" },
    ...[
      ...new Map(
        productionItems.map((item) => {
          const f = getFloor(item.unitNumber);
          return [f, { value: f, label: `Floor ${f}` }];
        })
      ).values(),
    ].sort((a, b) => a.value.localeCompare(b.value, undefined, { numeric: true })),
  ], [productionItems]);

  const fabricTypeOptions = [
    { value: "all", label: "All types" },
    { value: "screen", label: "Screen" },
    { value: "blackout", label: "Blackout" },
  ];

  const componentOptions: { value: ComponentFilter; label: string }[] = [
    { value: "all", label: "All components" },
    { value: "fabric", label: "Fabric" },
    { value: "valance", label: "Valance" },
    { value: "tube_rail", label: "Tube / Bottom rail" },
  ];

  const displayLimitOptions: { value: DisplayLimit; label: string }[] = [
    { value: "all", label: "No limit" },
    { value: "25", label: "25 units" },
    { value: "50", label: "50 units" },
    { value: "75", label: "75 units" },
    { value: "100", label: "100 units" },
  ];

  const highlightSection: ManufacturingHighlightSection | null =
    componentFilter === "all" ? null : componentFilter;

  const activeFilterCount = [
    search.trim().length > 0,
    buildingFilter.length > 0,
    floorFilter.length > 0,
    fabricTypeFilter.length > 0,
    componentFilter !== "all",
    displayLimit !== "all",
  ].filter(Boolean).length;

  const unitGroups: CutterUnitGroup[] = useMemo(() => {
    const groups = new Map<string, CutterUnitGroup>();
    for (const item of productionItems) {
      if (buildingFilter.length > 0 && !buildingFilter.includes(item.buildingId)) continue;
      if (floorFilter.length > 0 && !floorFilter.includes(getFloor(item.unitNumber))) continue;
      if (fabricTypeFilter.length > 0 && !fabricTypeFilter.includes(item.blindType)) continue;
      if (!matchesQueueSearch(item, search)) continue;

      let group = groups.get(item.unitId);
      if (!group) {
        group = {
          unitId: item.unitId,
          unitNumber: item.unitNumber,
          buildingId: item.buildingId,
          buildingName: item.buildingName,
          clientName: item.clientName,
          installationDate: item.installationDate,
          completeByDate: item.completeByDate,
          allMeasuredAt: item.allMeasuredAt,
          productionEnteredAt: item.productionEnteredAt,
          windows: [],
          hasIssue: false,
        };
        groups.set(item.unitId, group);
      }
      group.windows.push(item);
      if (item.issueStatus === "open" || isReturnedToCutter(item)) {
        group.hasIssue = true;
      }
    }

    const sortedGroups = [...groups.values()];
    sortedGroups.sort((a, b) => {
      // Issues first (mirrors queue), then production_entered_at ASC (oldest first → cut first).
      if (a.hasIssue !== b.hasIssue) return a.hasIssue ? -1 : 1;
      const aEntered = a.productionEnteredAt ?? "";
      const bEntered = b.productionEnteredAt ?? "";
      if (aEntered === bEntered) {
        return a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
      }
      return aEntered.localeCompare(bEntered);
    });

    // Sort windows within each unit: pending first, then by label.
    for (const group of sortedGroups) {
      group.windows.sort((a, b) => {
        const aPending = a.productionStatus === "pending" ? 0 : 1;
        const bPending = b.productionStatus === "pending" ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return (a.label ?? "").localeCompare(b.label ?? "", undefined, {
          numeric: true,
        });
      });
    }

    return sortedGroups;
  }, [productionItems, buildingFilter, floorFilter, fabricTypeFilter, search]);

  const maxVisibleUnits = displayLimit === "all" ? Infinity : Number(displayLimit);
  const visibleGroups = unitGroups.slice(0, maxVisibleUnits);

  // Drop any selected ids that are no longer visible (e.g. after a filter change).
  const visibleIds = useMemo(() => new Set(visibleGroups.map((g) => g.unitId)), [visibleGroups]);
  const hasStale = [...selectedUnitIds].some((id) => !visibleIds.has(id));
  if (hasStale) {
    const next = new Set([...selectedUnitIds].filter((id) => visibleIds.has(id)));
    setSelectedUnitIds(next);
  }

  const selectedWindowIds = useMemo(() => {
    if (selectedUnitIds.size === 0) return [] as string[];
    const ids: string[] = [];
    for (const group of visibleGroups) {
      if (!selectedUnitIds.has(group.unitId)) continue;
      for (const w of group.windows) ids.push(w.windowId);
    }
    return ids;
  }, [visibleGroups, selectedUnitIds]);

  function toggleUnit(unitId: string) {
    setSelectedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  function clearSelection() {
    setSelectedUnitIds(new Set());
  }

  const [bulkPickerOpen, setBulkPickerOpen] = useState(false);
  const [bulkPickerValue, setBulkPickerValue] = useState("");

  function applyBulkPick() {
    const n = Number.parseInt(bulkPickerValue, 10);
    if (!Number.isFinite(n) || n <= 0) {
      setBulkPickerOpen(false);
      setBulkPickerValue("");
      return;
    }
    const take = Math.min(n, visibleGroups.length);
    const next = new Set<string>();
    for (let i = 0; i < take; i++) next.add(visibleGroups[i].unitId);
    setSelectedUnitIds(next);
    setBulkPickerOpen(false);
    setBulkPickerValue("");
  }

  function handleStatusChange(windowId: string, next: "pending" | "cut") {
    setStatusOverrides((prev) => {
      const m = new Map(prev);
      m.set(windowId, next);
      return m;
    });
    router.refresh();
  }

  return (
    <div
      className="pb-[160px]"
      style={{ ["--schedule-sticky-top" as string]: `${stickyTop}px` }}
    >
      <div
        ref={headerRef}
        className="sticky top-0 z-30 border-b border-border bg-card/95 px-4 pt-4 pb-4 backdrop-blur-md"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-secondary transition-colors hover:bg-surface"
            >
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight text-foreground sm:text-[18px]">
                Production
              </h1>
              <p className="mt-0.5 text-[12px] text-tertiary sm:text-[13px]">
                {userName ? `Hi, ${userName.split(" ")[0]}` : "Cutter"} ·{" "}
                {unitGroups.length} unit{unitGroups.length === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectMode && (
              bulkPickerOpen ? (
                <div className="inline-flex items-center gap-1 rounded-full border border-accent bg-card px-1.5 py-1">
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    autoFocus
                    value={bulkPickerValue}
                    onChange={(e) => setBulkPickerValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") applyBulkPick();
                      if (e.key === "Escape") {
                        setBulkPickerOpen(false);
                        setBulkPickerValue("");
                      }
                    }}
                    placeholder="N"
                    className="w-12 bg-transparent px-1 text-[12px] font-semibold text-foreground outline-none placeholder:text-tertiary"
                  />
                  <button
                    type="button"
                    onClick={applyBulkPick}
                    className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-white"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setBulkPickerOpen(true)}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-[12px] font-semibold text-secondary transition-colors hover:bg-surface"
                  title={`Select first # of ${visibleGroups.length} visible units`}
                >
                  Select #
                </button>
              )
            )}
            <button
              type="button"
              onClick={() => {
                setSelectMode((s) => {
                  if (s) {
                    clearSelection();
                    setBulkPickerOpen(false);
                    setBulkPickerValue("");
                  }
                  return !s;
                });
              }}
              className={[
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors",
                selectMode
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-card text-secondary hover:bg-surface",
              ].join(" ")}
            >
              {selectMode ? <CheckSquare size={14} weight="fill" /> : <Square size={14} />}
              {selectMode ? "Done" : "Select"}
            </button>
          </div>
        </div>

        <div className="mt-3 relative">
          <MagnifyingGlass
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400"
          />
          <input
            type="text"
            inputMode="search"
            placeholder="Search unit, building, room, window — comma-separate for multi"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 pl-10 pr-9 rounded-xl border border-border bg-white text-[13px] placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent transition-all"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          <div className="flex items-center gap-1.5 flex-shrink-0 text-zinc-400">
            <FunnelSimple size={14} />
            {activeFilterCount > 0 && (
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </div>
          <FilterDropdown
            label="Component"
            value={componentFilter}
            options={componentOptions}
            onChange={(value) => setComponentFilter(value as ComponentFilter)}
          />
          <FilterDropdown
            multiple
            label="Building"
            values={buildingFilter}
            options={buildingOptions}
            onChange={setBuildingFilter}
          />
          <FilterDropdown
            multiple
            label="Floor"
            values={floorFilter}
            options={floorOptions}
            onChange={setFloorFilter}
          />
          <FilterDropdown
            multiple
            label="Fabric Type"
            values={fabricTypeFilter}
            options={fabricTypeOptions}
            onChange={setFabricTypeFilter}
          />
          <FilterDropdown
            label="Units"
            value={displayLimit}
            options={displayLimitOptions}
            onChange={(value) => setDisplayLimit(value as DisplayLimit)}
          />
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setBuildingFilter([]);
                setFloorFilter([]);
                setFabricTypeFilter([]);
                setComponentFilter("all");
                setDisplayLimit("all");
              }}
              className="flex h-8 flex-shrink-0 items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 text-xs font-medium text-red-500"
            >
              <X size={11} weight="bold" />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3 px-4 pt-4">
        {visibleGroups.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">
              {activeFilterCount > 0 ? "No units match your filters" : "Production is empty"}
            </p>
            <p className="mt-1 text-[12px] text-tertiary max-w-[40ch] mx-auto">
              {activeFilterCount > 0
                ? "Try clearing a filter or two."
                : "Units appear here once all their labels (cut list, MFG, PKG) are printed."}
            </p>
          </div>
        ) : (
          visibleGroups.map((unit) => {
            const enteredLabel = formatStoredDateLongEnglish(
              unit.productionEnteredAt?.slice(0, 10) ?? null
            );
            return (
              <UnitCard
                key={unit.unitId}
                unit={unit}
                highlightSection={highlightSection}
                selectable={selectMode}
                selected={selectedUnitIds.has(unit.unitId)}
                onToggleSelect={() => toggleUnit(unit.unitId)}
                unitHrefBase="/cutter/units"
                headerMeta={
                  enteredLabel ? (
                    <span className="font-semibold text-emerald-700">
                      In production since {enteredLabel}
                    </span>
                  ) : null
                }
                headerAction={
                  selectMode ? null : (
                    <MoveBackToQueueButton unitId={unit.unitId} />
                  )
                }
                renderWindowActions={(item) =>
                  selectMode ? null : (
                    <WindowCutActions item={item} onChange={handleStatusChange} />
                  )
                }
              />
            );
          })
        )}
      </div>

      <CutterBulkActionBar
        selectedUnitCount={selectedUnitIds.size}
        windowIds={selectedWindowIds}
        onClear={clearSelection}
      />
    </div>
  );
}
