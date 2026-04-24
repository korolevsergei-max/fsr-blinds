"use client";

import { useState } from "react";
import { X } from "@phosphor-icons/react";
import {
  PUSHBACK_OTHER_OPTION,
  PUSHBACK_REASON_PRESETS,
  getPushbackDirectionLabel,
  type PushbackDirection,
} from "@/lib/pushback-reasons";

interface ReturnBlindDialogProps {
  open: boolean;
  direction: PushbackDirection;
  windowLabel?: string;
  busy?: boolean;
  onCancel: () => void;
  onSubmit: (args: { reason: string; notes: string }) => void;
}

export function ReturnBlindDialog({
  open,
  direction,
  windowLabel,
  busy,
  onCancel,
  onSubmit,
}: ReturnBlindDialogProps) {
  const presets = PUSHBACK_REASON_PRESETS[direction];
  const [selected, setSelected] = useState<string>("");
  const [customReason, setCustomReason] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [prevKey, setPrevKey] = useState<string>(open ? `${direction}` : "__closed__");
  const nextKey = open ? `${direction}` : "__closed__";
  if (nextKey !== prevKey) {
    setPrevKey(nextKey);
    setSelected("");
    setCustomReason("");
    setNotes("");
  }

  if (!open) return null;

  const isOther = selected === PUSHBACK_OTHER_OPTION;
  const finalReason = isOther ? customReason.trim() : selected;
  const canSubmit = Boolean(finalReason) && !busy;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm pb-16 sm:pb-0 sm:items-center"
      onClick={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-t-[var(--radius-xl)] border border-border bg-card p-6 pb-10 shadow-xl sm:rounded-[var(--radius-xl)] sm:pb-6 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {getPushbackDirectionLabel(direction)}
            </h2>
            {windowLabel && (
              <p className="mt-0.5 text-[12px] text-tertiary">{windowLabel}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-tertiary hover:bg-surface disabled:opacity-40"
          >
            <X size={14} weight="bold" />
          </button>
        </div>

        <div className="space-y-1.5">
          <p className="text-[12px] font-medium text-secondary">Reason</p>
          <div className="flex flex-col gap-1.5">
            {presets.map((preset) => (
              <label
                key={preset}
                className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] transition-colors ${
                  selected === preset
                    ? "border-accent bg-accent/5 text-foreground"
                    : "border-border bg-surface/50 text-secondary hover:bg-surface"
                }`}
              >
                <input
                  type="radio"
                  name="pushback-reason"
                  value={preset}
                  checked={selected === preset}
                  onChange={() => setSelected(preset)}
                  className="h-3.5 w-3.5 accent-accent"
                />
                <span>{preset}</span>
              </label>
            ))}
            <label
              className={`flex cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2.5 text-[13px] transition-colors ${
                isOther
                  ? "border-accent bg-accent/5 text-foreground"
                  : "border-border bg-surface/50 text-secondary hover:bg-surface"
              }`}
            >
              <input
                type="radio"
                name="pushback-reason"
                value={PUSHBACK_OTHER_OPTION}
                checked={isOther}
                onChange={() => setSelected(PUSHBACK_OTHER_OPTION)}
                className="h-3.5 w-3.5 accent-accent"
              />
              <span>{PUSHBACK_OTHER_OPTION}</span>
            </label>
          </div>

          {isOther && (
            <input
              type="text"
              autoFocus
              placeholder="Describe the reason"
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              className="mt-1 w-full rounded-xl border border-border bg-card px-3 py-2.5 text-[13px] text-foreground focus:border-accent focus:outline-none"
            />
          )}
        </div>

        <div className="mt-4 space-y-1.5">
          <p className="text-[12px] font-medium text-secondary">
            Notes for the next person{" "}
            <span className="font-normal text-tertiary">(optional)</span>
          </p>
          <textarea
            rows={3}
            placeholder="Extra detail, measurements, or context…"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full resize-none rounded-xl border border-border bg-card px-3 py-2.5 text-[13px] text-foreground focus:border-accent focus:outline-none"
          />
        </div>

        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-xl border border-border bg-card px-4 py-2.5 text-[13px] font-semibold text-secondary hover:bg-surface disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onSubmit({ reason: finalReason, notes: notes.trim() });
            }}
            className="flex-1 rounded-xl bg-accent px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
          >
            {busy ? "Sending…" : "Send back"}
          </button>
        </div>
      </div>
    </div>
  );
}
