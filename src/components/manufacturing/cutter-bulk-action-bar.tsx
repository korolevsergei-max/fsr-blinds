"use client";

import { Printer, X } from "@phosphor-icons/react";

interface BulkActionBarProps {
  selectedUnitCount: number;
  windowIds: string[];
  onClear: () => void;
}

export function CutterBulkActionBar({
  selectedUnitCount,
  windowIds,
  onClear,
}: BulkActionBarProps) {
  if (selectedUnitCount === 0) return null;

  const ids = windowIds.join(",");

  function openInTab(href: string) {
    window.open(href, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="fixed left-1/2 z-40 w-full max-w-lg -translate-x-1/2 px-4 pb-2" style={{ bottom: 'calc(88px + env(safe-area-inset-bottom))' }}>
      <div className="rounded-[var(--radius-lg)] border border-border bg-card/98 backdrop-blur-lg shadow-[0_10px_30px_rgba(15,23,42,0.18)]">
        <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border/70">
          <p className="text-[12px] font-semibold text-foreground">
            {selectedUnitCount} unit{selectedUnitCount === 1 ? "" : "s"} ·{" "}
            {windowIds.length} window{windowIds.length === 1 ? "" : "s"}
          </p>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-medium text-tertiary hover:bg-surface hover:text-secondary"
          >
            <X size={12} weight="bold" />
            Clear
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 p-3">
          <button
            type="button"
            onClick={() => openInTab(`/cutter/queue/print-list?ids=${ids}`)}
            disabled={windowIds.length === 0}
            className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] border border-sky-200 bg-sky-50 px-2 py-2 text-[11px] font-semibold text-sky-800 transition-colors hover:bg-sky-100 disabled:opacity-50"
          >
            <Printer size={16} weight="bold" />
            Print cut list
          </button>
          <button
            type="button"
            onClick={() =>
              openInTab(`/cutter/queue/print?ids=${ids}&labelMode=manufacturing`)
            }
            disabled={windowIds.length === 0}
            className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] border border-zinc-200 bg-zinc-50 px-2 py-2 text-[11px] font-semibold text-zinc-800 transition-colors hover:bg-zinc-100 disabled:opacity-50"
          >
            <Printer size={16} weight="bold" />
            Print mfg labels
          </button>
          <button
            type="button"
            onClick={() =>
              openInTab(`/cutter/queue/print?ids=${ids}&labelMode=packaging`)
            }
            disabled={windowIds.length === 0}
            className="flex flex-col items-center gap-1 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-2 py-2 text-[11px] font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
          >
            <Printer size={16} weight="bold" />
            Print pkg labels
          </button>
        </div>
      </div>
    </div>
  );
}
