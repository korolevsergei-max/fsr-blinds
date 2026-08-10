"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowCounterClockwise, CheckCircle, DownloadSimple, X } from "@phosphor-icons/react";

import {
  completeWindowsForPartner,
  reopenWindowsForPartner,
} from "@/app/actions/subcontractor-actions";
import { exportColumnsFor, downloadWorklistCsv, downloadWorklistXlsx } from "@/lib/subcontractor-xlsx";
import type { SubcontractorWorkItem } from "@/lib/subcontractor-data";

type View = "production" | "completed";

/**
 * The subcontractor's spec sheet.
 *
 * Columns come from `exportColumnsFor()` — the same definition the Excel and CSV
 * exports use — so what they read on screen and what lands in their production
 * software can never drift apart. Adding a column is one edit, in one file.
 *
 * Deliberately NO sort or filter controls: the partner asked for a fixed
 * oldest-first order so the whole shop reads the same list in the same order.
 * That ordering is applied server-side in loadSubcontractorWorklist.
 */
export function SubcontractorWorkTable({
  items,
  partnerName,
  view,
}: {
  items: SubcontractorWorkItem[];
  partnerName: string;
  view: View;
}) {
  const router = useRouter();
  const columns = useMemo(() => exportColumnsFor(view), [view]);

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchSize, setBatchSize] = useState("20");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const [exporting, setExporting] = useState(false);

  const selectedItems = useMemo(
    () => items.filter((i) => selectedIds.has(i.windowId)),
    [items, selectedIds]
  );

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
    setError("");
  }

  function toggleRow(windowId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(windowId)) next.delete(windowId);
      else next.add(windowId);
      return next;
    });
  }

  /**
   * Add the next N unselected rows, in display order. Pressing it repeatedly
   * walks down the list in batches — the way they pull a day's work off the
   * front of the queue without clicking twenty checkboxes.
   */
  function selectNextBatch() {
    const n = Number.parseInt(batchSize, 10);
    if (!Number.isFinite(n) || n <= 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      let added = 0;
      for (const item of items) {
        if (added >= n) break;
        if (next.has(item.windowId)) continue;
        next.add(item.windowId);
        added += 1;
      }
      return next;
    });
  }

  const allSelected = items.length > 0 && selectedIds.size === items.length;

  function toggleAll() {
    setSelectedIds(allSelected ? new Set() : new Set(items.map((i) => i.windowId)));
  }

  function runAction(action: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    setError("");
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      exitSelectMode();
      router.refresh();
    });
  }

  async function exportRows(format: "csv" | "xlsx") {
    // Export the selection when there is one, otherwise the whole list.
    const rows = selectedItems.length > 0 ? selectedItems : items;
    if (rows.length === 0) return;
    setExporting(true);
    try {
      if (format === "csv") downloadWorklistCsv(rows, partnerName, view);
      else await downloadWorklistXlsx(rows, partnerName, view);
    } catch {
      setError("Could not build the export. Try again.");
    } finally {
      setExporting(false);
    }
  }

  const heading = view === "completed" ? "Completed" : "Production";
  const emptyCopy =
    view === "completed"
      ? "Nothing marked complete yet."
      : "No blinds waiting. New work appears here once FSR assigns and measures a unit.";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[18px] font-semibold tracking-tight text-foreground">{heading}</h1>
          <p className="text-[12px] text-tertiary mt-0.5">
            {items.length} blind{items.length === 1 ? "" : "s"}
            {view === "production" && items.length > 0 && " • oldest first"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={exporting || items.length === 0}
            onClick={() => exportRows("csv")}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-card px-3 py-2 text-[13px] font-medium text-secondary hover:bg-surface transition-colors disabled:opacity-50"
          >
            <DownloadSimple size={15} />
            Export CSV
          </button>
          <button
            type="button"
            disabled={exporting || items.length === 0}
            onClick={() => exportRows("xlsx")}
            className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-card px-3 py-2 text-[13px] font-medium text-secondary hover:bg-surface transition-colors disabled:opacity-50"
          >
            <DownloadSimple size={15} />
            {exporting ? "Building…" : "Export Excel"}
          </button>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
              className={[
                "rounded-[var(--radius-md)] px-3 py-2 text-[13px] font-semibold transition-colors",
                selectMode
                  ? "border border-border bg-surface text-secondary"
                  : "bg-accent text-white hover:opacity-90",
              ].join(" ")}
            >
              {selectMode ? "Cancel" : "Select"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-[var(--radius-md)] border border-[rgba(200,57,43,0.2)] bg-danger-light px-3.5 py-3 text-[13px] font-medium text-danger">
          {error}
        </div>
      )}

      {selectMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-3 py-2.5">
          <button
            type="button"
            onClick={toggleAll}
            className="text-[13px] font-medium text-accent hover:underline"
          >
            {allSelected ? "Deselect all" : `Select all ${items.length}`}
          </button>
          <span className="text-border">|</span>
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-tertiary">Select next</span>
            <input
              type="number"
              min={1}
              max={items.length}
              value={batchSize}
              onChange={(e) => setBatchSize(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  selectNextBatch();
                }
              }}
              className="w-20 rounded-[var(--radius-sm)] border border-border bg-card px-2 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
            <button
              type="button"
              onClick={selectNextBatch}
              className="rounded-[var(--radius-sm)] border border-border bg-card px-2.5 py-1.5 text-[13px] font-medium text-secondary hover:bg-card/60 transition-colors"
            >
              Add
            </button>
          </div>
          <span className="ml-auto text-[13px] font-semibold text-foreground">
            {selectedIds.size} selected
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="py-16 text-center text-[13px] text-muted">{emptyCopy}</p>
      ) : (
        // The pane scrolls in both directions, so `sticky top-0` on the header
        // cells pins them to the top of THIS box as they read down the list.
        // The background must sit on each `th`, not on the `tr`: a sticky cell
        // paints independently of its row, and a transparent one would let the
        // data rows scroll through it.
        <div className="min-h-0 flex-1 overflow-auto rounded-[var(--radius-md)] border border-border bg-card">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="text-white">
                {selectMode && <th className="sticky top-0 z-10 w-10 bg-foreground px-3 py-2.5" />}
                {columns.map((col) => (
                  <th
                    key={col.header}
                    className="sticky top-0 z-10 whitespace-nowrap bg-foreground px-3 py-2.5 text-left text-[12px] font-semibold"
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const isSelected = selectedIds.has(item.windowId);
                return (
                  <tr
                    key={item.windowId}
                    onClick={selectMode ? () => toggleRow(item.windowId) : undefined}
                    className={[
                      "border-b border-border-subtle last:border-0",
                      selectMode ? "cursor-pointer" : "",
                      isSelected
                        ? "bg-accent-light"
                        : index % 2 === 1
                          ? "bg-surface"
                          : "",
                    ].join(" ")}
                  >
                    {selectMode && (
                      <td className="px-3 py-2 align-middle">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleRow(item.windowId)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select ${item.unitNumber} ${item.roomName} ${item.label}`}
                          className="h-4 w-4 accent-[var(--accent)]"
                        />
                      </td>
                    )}
                    {columns.map((col) => (
                      <td
                        key={col.header}
                        className="whitespace-nowrap px-3 py-2 text-foreground"
                      >
                        {col.value(item)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectMode && selectedIds.size > 0 && (
        <div className="animate-slide-up sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-[var(--radius-xl)] bg-foreground px-4 py-3 shadow-2xl">
          <span className="text-[13px] font-semibold text-white">
            {selectedIds.size} blind{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={exporting}
              onClick={() => exportRows("csv")}
              className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-white/20 px-3 py-2 text-[13px] font-medium text-white hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              <DownloadSimple size={15} />
              Export CSV
            </button>
            {view === "production" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  runAction(() => completeWindowsForPartner([...selectedIds]))
                }
                className="flex items-center gap-1.5 rounded-[var(--radius-md)] bg-emerald-500 px-3 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 transition-colors disabled:opacity-60"
              >
                <CheckCircle size={16} weight="fill" />
                {pending ? "Saving…" : `Mark ${selectedIds.size} complete`}
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={() => runAction(() => reopenWindowsForPartner([...selectedIds]))}
                className="flex items-center gap-1.5 rounded-[var(--radius-md)] border border-white/20 px-3 py-2 text-[13px] font-semibold text-white hover:bg-white/10 transition-colors disabled:opacity-60"
              >
                <ArrowCounterClockwise size={15} />
                {pending ? "Saving…" : "Move back to production"}
              </button>
            )}
            <button
              type="button"
              onClick={exitSelectMode}
              aria-label="Clear selection"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white/70 hover:bg-white/10 hover:text-white transition-colors"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
