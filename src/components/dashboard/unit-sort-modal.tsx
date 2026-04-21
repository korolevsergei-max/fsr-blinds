"use client";

import { ArrowDown, ArrowUp, Trash, X } from "@phosphor-icons/react";
import {
  UNIT_SORT_FIELD_LABELS,
  type UnitSortField,
  type UnitSortLevel,
} from "@/lib/unit-sort";

interface UnitSortModalProps {
  draftLevels: UnitSortLevel[];
  onClose: () => void;
  onApply: (levels: UnitSortLevel[]) => void;
  onChange: (levels: UnitSortLevel[]) => void;
}

const sortFieldOptions = Object.entries(UNIT_SORT_FIELD_LABELS).map(([value, label]) => ({
  value: value as UnitSortField,
  label,
}));

export function UnitSortModal({ draftLevels, onClose, onApply, onChange }: UnitSortModalProps) {
  function addLevel() {
    if (draftLevels.length >= 3) return;
    const usedFields = new Set(draftLevels.map((l) => l.field));
    const nextField = (Object.keys(UNIT_SORT_FIELD_LABELS) as UnitSortField[]).find(
      (f) => !usedFields.has(f)
    );
    if (!nextField) return;
    onChange([...draftLevels, { field: nextField, direction: "asc" }]);
  }

  function removeLevel(idx: number) {
    onChange(draftLevels.filter((_, i) => i !== idx));
  }

  function updateLevel(idx: number, patch: Partial<UnitSortLevel>) {
    onChange(draftLevels.map((level, i) => (i === idx ? { ...level, ...patch } : level)));
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm pb-16 sm:pb-0 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-[var(--radius-xl)] border border-border bg-card p-6 pb-10 shadow-xl sm:rounded-[var(--radius-xl)] sm:pb-6 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
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
          {draftLevels.map((level, idx) => {
            const usedFields = new Set(draftLevels.filter((_, i) => i !== idx).map((l) => l.field));
            const availableOptions = sortFieldOptions.filter((o) => !usedFields.has(o.value));
            return (
              <div
                key={idx}
                className="flex items-center gap-2 rounded-xl border border-border bg-surface/50 px-3 py-2.5"
              >
                <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
                  {idx + 1}
                </span>
                <select
                  value={level.field}
                  onChange={(e) => updateLevel(idx, { field: e.target.value as UnitSortField })}
                  className="flex-1 min-w-0 rounded-lg border border-border bg-card px-2 py-1 text-xs font-medium text-foreground focus:outline-none"
                >
                  {availableOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => updateLevel(idx, { direction: level.direction === "asc" ? "desc" : "asc" })}
                  className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-card text-secondary transition-colors hover:bg-surface"
                  title={level.direction === "asc" ? "Ascending" : "Descending"}
                >
                  {level.direction === "asc" ? <ArrowUp size={13} weight="bold" /> : <ArrowDown size={13} weight="bold" />}
                </button>
                <button
                  type="button"
                  onClick={() => removeLevel(idx)}
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
