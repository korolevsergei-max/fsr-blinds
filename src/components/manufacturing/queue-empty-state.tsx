"use client";

import { CheckCircle, CircleNotch, FunnelSimple } from "@phosphor-icons/react";

function plural(count: number, noun: string) {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * The one place a factory screen says "nothing left". An empty list is only
 * reported as empty once no save is pending, a fresh server read has come
 * back, and no filter is hiding work — otherwise the operator is told which of
 * those is the reason, so a refresh is never needed to find remaining blinds.
 */
export function QueueEmptyState({
  noun,
  savingCount,
  checking,
  hiddenCount,
  onShowAll,
  emptyTitle,
  emptyBody,
}: {
  noun: string;
  savingCount: number;
  checking: boolean;
  hiddenCount: number;
  onShowAll: () => void;
  emptyTitle: string;
  emptyBody: string;
}) {
  if (hiddenCount > 0) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-amber-300 bg-amber-50/70 px-4 py-8 text-center">
        <FunnelSimple size={20} className="mx-auto text-amber-600" />
        <p className="mt-2 text-sm font-semibold text-foreground">
          Nothing left in this filter
        </p>
        <p className="mt-1 text-[12px] text-secondary">
          {plural(hiddenCount, noun)} still waiting outside your current filters.
        </p>
        <button
          type="button"
          onClick={onShowAll}
          className="mt-3 inline-flex items-center rounded-full bg-accent px-4 py-2 text-[12px] font-semibold text-white transition-opacity active:opacity-80"
        >
          Show all {plural(hiddenCount, noun)}
        </button>
      </div>
    );
  }

  if (savingCount > 0 || checking) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-8 text-center">
        <CircleNotch size={20} weight="bold" className="mx-auto animate-spin text-tertiary" />
        <p className="mt-2 text-sm font-semibold text-foreground">
          {savingCount > 0 ? `Saving ${plural(savingCount, noun)}…` : "Checking for more work…"}
        </p>
        <p className="mt-1 text-[12px] text-tertiary">
          Any remaining {noun}s will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-surface/70 px-4 py-8 text-center">
      <CheckCircle size={20} weight="fill" className="mx-auto text-emerald-600" />
      <p className="mt-2 text-sm font-semibold text-foreground">{emptyTitle}</p>
      <p className="mt-1 text-[12px] text-tertiary max-w-[40ch] mx-auto">{emptyBody}</p>
    </div>
  );
}
