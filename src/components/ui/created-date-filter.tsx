"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CaretDown } from "@phosphor-icons/react";
import type { AddedDateFilter } from "@/lib/created-date";
import { formatAddedDateLabel } from "@/lib/created-date";

type CreatedDateFilterProps = {
  value: AddedDateFilter;
  onChange: (value: AddedDateFilter) => void;
  label?: string;
  /** When set, show these `YYYY-MM-DD` values as choices instead of a free calendar. */
  distinctDates?: string[];
  /** When true, show a "Not set" option to filter for units with no date. */
  showNotSet?: boolean;
};

export function CreatedDateFilter({
  value,
  onChange,
  label = "Date Added",
  distinctDates,
  showNotSet,
}: CreatedDateFilterProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const active = value !== "all";

  function handleToggle() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const midpoint = viewportWidth / 2;
      const padding = 16;

      if (rect.left > midpoint) {
        // Right side: align menu's right edge with button's right edge
        const right = viewportWidth - rect.right;
        setPosition({ top: rect.bottom + 6, right: Math.max(padding, right) });
      } else {
        // Left side: align menu's left edge with button's left edge
        setPosition({ top: rect.bottom + 6, left: Math.max(padding, rect.left) });
      }
    }
    setOpen((current) => !current);
  }

  // Scroll listener removed as it causes immediate close on subtle layout shifts
  // or user scrolling inside the dropdown. The backdrop handles outside clicks.

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={[
          "flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-all max-w-[min(100vw-2rem,220px)]",
          active
            ? "border-accent bg-accent text-white"
            : "border-border bg-card text-secondary hover:border-zinc-300",
        ].join(" ")}
      >
        <span className="truncate">
          {active
            ? value === "not_set"
              ? `${label}: Not set`
              : formatAddedDateLabel(value)
            : label}
        </span>
        <CaretDown
          size={11}
          weight="bold"
          className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <div key="date-filter-container" className="relative z-[9999]">
              <div
                key="date-filter-backdrop"
                className="fixed inset-0 z-40"
                onClick={() => setOpen(false)}
              />
              <motion.div
                key="date-filter-menu"
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{ top: position.top, left: position.left, right: position.right }}
                className="fixed z-50 w-[min(calc(100vw-2rem),260px)] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card p-3 shadow-[var(--shadow-md)]"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">
                  {label}
                </p>
                {distinctDates && distinctDates.length > 0 ? (
                  <div className="flex max-h-64 flex-col gap-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar">
                    {distinctDates.map((ymd) => (
                      <button
                        key={ymd}
                        type="button"
                        onClick={() => {
                          onChange(ymd);
                          setOpen(false);
                        }}
                        className={`group flex items-center justify-between rounded-lg px-3 py-2.5 text-left transition-all ${
                          value === ymd
                            ? "bg-accent text-white shadow-sm"
                            : "bg-surface text-foreground hover:bg-zinc-100 hover:pl-4"
                        }`}
                      >
                        <span className="text-[13px] font-semibold">{formatAddedDateLabel(ymd)}</span>
                        {value === ymd && (
                          <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                        )}
                      </button>
                    ))}
                  </div>
                ) : distinctDates && distinctDates.length === 0 ? (
                  <div className="bg-zinc-50 rounded-xl p-4 text-center border border-dashed border-zinc-200">
                    <p className="text-[11px] text-zinc-500 font-medium leading-relaxed">
                      No activity found in the current list.<br/>
                      <span className="opacity-60 italic">Adjust filters to see dates.</span>
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="date"
                      value={value === "all" ? "" : value}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next) onChange(next);
                        else onChange("all");
                      }}
                      className="w-full h-10 rounded-xl border border-border bg-white px-3 text-[13px] font-medium text-foreground focus:border-accent focus:outline-none focus:ring-4 focus:ring-accent/10 transition-all font-mono"
                    />
                    <p className="text-[9px] text-center text-zinc-400 font-medium uppercase tracking-tight">Manual Selection</p>
                  </div>
                )}
                
                {showNotSet && (
                  <button
                    type="button"
                    onClick={() => { onChange("not_set"); setOpen(false); }}
                    className={`mt-2 group flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left transition-all ${
                      value === "not_set"
                        ? "bg-accent text-white shadow-sm"
                        : "bg-surface text-foreground hover:bg-zinc-100 hover:pl-4"
                    }`}
                  >
                    <span className="text-[13px] font-semibold">Not set</span>
                    {value === "not_set" && (
                      <div className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                    )}
                  </button>
                )}

                <div className="mt-3 pt-3 border-t border-border/50">
                  <button
                    type="button"
                    onClick={() => {
                      onChange("all");
                      setOpen(false);
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${
                      value === "all"
                        ? "bg-zinc-100 text-zinc-400 cursor-default"
                        : "bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm active:scale-[0.98]"
                    }`}
                  >
                    {value === "all" ? "Currently showing all" : "Clear Filter"}
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
