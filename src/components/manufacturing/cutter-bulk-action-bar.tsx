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
  const disabled = windowIds.length === 0;

  // Plain anchors, not window.open(). Safari's pop-up blocker treats
  // window.open(url, "_blank", features) as a pop-up and silently drops it —
  // the tap appears to do nothing, which reads to the operator as "printing is
  // broken". A target="_blank" anchor is a user-initiated navigation and is
  // never pop-up blocked. rel="noopener noreferrer" keeps the old isolation.
  const linkClass = (tone: "sky" | "zinc" | "amber") =>
    [
      "flex flex-col items-center gap-1 rounded-[var(--radius-md)] border px-2 py-2 text-[11px] font-semibold transition-colors",
      tone === "sky" && "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100",
      tone === "zinc" && "border-zinc-200 bg-zinc-50 text-zinc-800 hover:bg-zinc-100",
      tone === "amber" && "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100",
      disabled && "pointer-events-none opacity-50",
    ]
      .filter(Boolean)
      .join(" ");

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
          <a
            href={`/cutter/queue/print-list?ids=${ids}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={disabled}
            className={linkClass("sky")}
          >
            <Printer size={16} weight="bold" />
            Print cut list
          </a>
          <a
            href={`/cutter/queue/print?ids=${ids}&labelMode=manufacturing`}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={disabled}
            className={linkClass("zinc")}
          >
            <Printer size={16} weight="bold" />
            Print mfg labels
          </a>
          <a
            href={`/cutter/queue/print?ids=${ids}&labelMode=packaging`}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={disabled}
            className={linkClass("amber")}
          >
            <Printer size={16} weight="bold" />
            Print pkg labels
          </a>
        </div>
      </div>
    </div>
  );
}
