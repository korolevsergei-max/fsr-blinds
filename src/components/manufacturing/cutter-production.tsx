"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckSquare,
  Scissors,
  Square,
  ArrowUUpLeft,
} from "@phosphor-icons/react";
import { markWindowCut } from "@/app/actions/production-actions";
import { undoWindowCut } from "@/app/actions/manufacturing-actions";
import type {
  ManufacturingRoleSchedule,
  ManufacturingWindowItem,
} from "@/lib/manufacturing-scheduler";
import { formatStoredDateLongEnglish } from "@/lib/created-date";
import {
  UnitCard,
  isReturnedToCutter,
  type CutterUnitGroup,
} from "@/components/manufacturing/cutter-unit-card";
import { CutterBulkActionBar } from "@/components/manufacturing/cutter-bulk-action-bar";

function buildProductionUnitGroups(items: ManufacturingWindowItem[]): CutterUnitGroup[] {
  const groups = new Map<string, CutterUnitGroup>();
  for (const item of items) {
    if (item.productionEnteredAt == null) continue;
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

  const sorted = [...groups.values()];
  sorted.sort((a, b) => {
    // production_entered_at ASC: oldest first → cut these first
    const aEntered = a.productionEnteredAt ?? "";
    const bEntered = b.productionEnteredAt ?? "";
    if (aEntered === bEntered) {
      return a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
    }
    return aEntered.localeCompare(bEntered);
  });

  // Sort windows: pending first, then by label.
  for (const group of sorted) {
    group.windows.sort((a, b) => {
      const aPending = a.productionStatus === "pending" ? 0 : 1;
      const bPending = b.productionStatus === "pending" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return (a.label ?? "").localeCompare(b.label ?? "", undefined, {
        numeric: true,
      });
    });
  }

  return sorted;
}

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

export function CutterProduction({
  schedule,
  userName,
}: {
  schedule: ManufacturingRoleSchedule;
  userName?: string;
}) {
  const router = useRouter();

  // Optimistic per-window status overrides keyed by windowId.
  const [statusOverrides, setStatusOverrides] = useState<
    Map<string, "pending" | "cut">
  >(new Map());

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

  const unitGroups = useMemo(() => buildProductionUnitGroups(items), [items]);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedUnitIds, setSelectedUnitIds] = useState<Set<string>>(new Set());

  // Clean up stale selections during render
  const visibleIds = useMemo(() => new Set(unitGroups.map((g) => g.unitId)), [unitGroups]);
  const hasStale = [...selectedUnitIds].some((id) => !visibleIds.has(id));
  if (hasStale) {
    const next = new Set([...selectedUnitIds].filter((id) => visibleIds.has(id)));
    setSelectedUnitIds(next);
  }

  const selectedWindowIds = useMemo(() => {
    if (selectedUnitIds.size === 0) return [] as string[];
    const ids: string[] = [];
    for (const group of unitGroups) {
      if (!selectedUnitIds.has(group.unitId)) continue;
      for (const w of group.windows) ids.push(w.windowId);
    }
    return ids;
  }, [unitGroups, selectedUnitIds]);

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

  function handleStatusChange(windowId: string, next: "pending" | "cut") {
    setStatusOverrides((prev) => {
      const m = new Map(prev);
      m.set(windowId, next);
      return m;
    });
    router.refresh();
  }

  return (
    <div className="pb-[160px]">
      <div className="sticky top-0 z-30 border-b border-border bg-card/95 px-4 pt-4 pb-4 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[17px] font-semibold tracking-tight text-foreground sm:text-[18px]">
              Production
            </h1>
            <p className="mt-0.5 text-[12px] text-tertiary sm:text-[13px]">
              {userName ? `Hi, ${userName.split(" ")[0]}` : "Cutter"} ·{" "}
              {unitGroups.length} unit{unitGroups.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectMode((s) => {
                if (s) clearSelection();
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

      <div className="space-y-3 px-4 pt-4">
        {unitGroups.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-10 text-center">
            <p className="text-sm font-semibold text-foreground">Production is empty</p>
            <p className="mt-1 text-[12px] text-tertiary max-w-[40ch] mx-auto">
              Units appear here once all their labels (cut list, MFG, PKG) are printed.
            </p>
          </div>
        ) : (
          unitGroups.map((unit) => {
            const enteredLabel = formatStoredDateLongEnglish(
              unit.productionEnteredAt?.slice(0, 10) ?? null
            );
            return (
              <UnitCard
                key={unit.unitId}
                unit={unit}
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
