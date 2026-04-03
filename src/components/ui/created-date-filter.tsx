"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CaretDown } from "@phosphor-icons/react";
import type { AddedDateFilter } from "@/lib/created-date";
import { formatAddedDateLabel } from "@/lib/created-date";

type CreatedDateFilterProps = {
  value: AddedDateFilter;
  onChange: (value: AddedDateFilter) => void;
  label?: string;
  /** When set, show these `YYYY-MM-DD` values as choices (actual dates units were added) instead of a free calendar. */
  distinctDates?: string[];
};

export function CreatedDateFilter({
  value,
  onChange,
  label = "Date Added",
  distinctDates,
}: CreatedDateFilterProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);

  const active = value !== "all";

  function handleToggle() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPosition({ top: rect.bottom + 6, left: rect.left });
    }
    setOpen((current) => !current);
  }

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    return () => window.removeEventListener("scroll", close, true);
  }, [open]);

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
        <span className="truncate">{active ? formatAddedDateLabel(value) : label}</span>
        <CaretDown
          size={11}
          weight="bold"
          className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              style={{ top: position.top, left: position.left }}
              className="fixed z-50 w-[min(calc(100vw-2rem),260px)] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card p-3 shadow-[var(--shadow-md)]"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">
                {label}
              </p>
              {distinctDates && distinctDates.length > 0 ? (
                <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
                  {distinctDates.map((ymd) => (
                    <button
                      key={ymd}
                      type="button"
                      onClick={() => {
                        onChange(ymd);
                        setOpen(false);
                      }}
                      className={`rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors ${
                        value === ymd
                          ? "bg-accent text-white"
                          : "bg-surface text-foreground hover:bg-zinc-100"
                      }`}
                    >
                      {formatAddedDateLabel(ymd)}
                    </button>
                  ))}
                </div>
              ) : distinctDates && distinctDates.length === 0 ? (
                <p className="text-xs text-muted py-2">
                  No units in the current list — adjust client/building filters to see dates.
                </p>
              ) : (
                <input
                  type="date"
                  value={value === "all" ? "" : value}
                  onChange={(e) => {
                    const next = e.target.value;
                    if (next) onChange(next);
                    else onChange("all");
                  }}
                  className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm text-foreground focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              )}
              <button
                type="button"
                onClick={() => {
                  onChange("all");
                  setOpen(false);
                }}
                className="mt-2 w-full rounded-lg border border-border bg-surface py-2 text-xs font-medium text-secondary hover:bg-zinc-50 transition-colors"
              >
                Any time
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
