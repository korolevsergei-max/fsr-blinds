"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
} from "@phosphor-icons/react";
import { formatAddedDateLabel, parseStoredDate } from "@/lib/created-date";

type MultiDateFilterProps = {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  availableDates?: string[];
};

function formatValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function addDays(date: Date, amount: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function startOfWeek(date: Date): Date {
  return addDays(date, -date.getDay());
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

function formatTriggerLabel(label: string, values: string[]) {
  if (values.length === 0) return label;
  if (values.length === 1) return formatAddedDateLabel(values[0]);
  return `${label} (${values.length})`;
}

export function MultiDateFilter({
  label,
  values,
  onChange,
  availableDates = [],
}: MultiDateFilterProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [visibleMonth, setVisibleMonth] = useState<Date>(() => {
    const firstSelected = values[0] ? parseStoredDate(values[0]) : null;
    return startOfMonth(firstSelected ?? new Date());
  });

  const active = values.length > 0;
  const selectedSet = useMemo(() => new Set(values), [values]);
  const availableSet = useMemo(() => new Set(availableDates), [availableDates]);
  const today = new Date();
  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(visibleMonth));
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [visibleMonth]);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      if (!buttonRef.current) return;
      if (
        !buttonRef.current.contains(event.target as Node) &&
        menuRef.current &&
        !menuRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (values.length === 0) return;
    const nextDate = parseStoredDate(values[0]);
    if (nextDate) {
      setVisibleMonth(startOfMonth(nextDate));
    }
  }, [values]);

  function handleToggle() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const padding = 12;
      if (rect.left > viewportWidth / 2) {
        setPosition({ top: rect.bottom + 6, right: Math.max(padding, viewportWidth - rect.right) });
      } else {
        setPosition({ top: rect.bottom + 6, left: Math.max(padding, rect.left) });
      }
    }
    setOpen((current) => !current);
  }

  function toggleDate(ymd: string) {
    if (selectedSet.has(ymd)) {
      onChange(values.filter((value) => value !== ymd));
      return;
    }
    onChange([...values, ymd].sort((a, b) => a.localeCompare(b)));
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={[
          "flex h-8 max-w-[min(100vw-2rem,220px)] flex-shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-all",
          active
            ? "border-accent bg-accent text-white"
            : "border-border bg-card text-secondary hover:border-zinc-300",
        ].join(" ")}
      >
        <span className="truncate">{formatTriggerLabel(label, values)}</span>
        <CaretDown
          size={11}
          weight="bold"
          className={`flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {open && (
            <div className="relative z-[9999]">
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <motion.div
                ref={menuRef}
                initial={{ opacity: 0, y: -4, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.97 }}
                transition={{ duration: 0.15 }}
                style={{ top: position.top, left: position.left, right: position.right }}
                className="fixed z-50 w-[min(calc(100vw-2rem),22rem)] overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card p-4 shadow-[var(--shadow-md)]"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-surface text-tertiary">
                      <CalendarBlank size={15} />
                    </span>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-tertiary">
                        {label}
                      </p>
                      <p className="text-[12px] text-secondary">
                        {values.length === 0
                          ? "No dates selected"
                          : `${values.length} date${values.length === 1 ? "" : "s"} selected`}
                      </p>
                    </div>
                  </div>
                  {values.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange([])}
                      className="text-[12px] font-medium text-accent hover:opacity-80"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="mb-3 flex items-center justify-between gap-3">
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-surface"
                    onClick={() => setVisibleMonth((prev) => addMonths(prev, -1))}
                    aria-label="Previous month"
                  >
                    <CaretLeft size={18} />
                  </button>
                  <div className="text-sm font-semibold text-foreground">
                    {new Intl.DateTimeFormat("en-US", {
                      month: "long",
                      year: "numeric",
                    }).format(visibleMonth)}
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground hover:bg-surface"
                    onClick={() => setVisibleMonth((prev) => addMonths(prev, 1))}
                    aria-label="Next month"
                  >
                    <CaretRight size={18} />
                  </button>
                </div>

                <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-tertiary">
                  {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                    <span key={day}>{day}</span>
                  ))}
                </div>

                <div className="grid grid-cols-7 gap-1">
                  {calendarDays.map((day) => {
                    const ymd = formatValue(day);
                    const inMonth = isSameMonth(day, visibleMonth);
                    const selected = selectedSet.has(ymd);
                    const isToday = isSameDay(day, today);
                    const isAvailable = availableSet.size > 0 && availableSet.has(ymd);

                    return (
                      <button
                        key={ymd}
                        type="button"
                        onClick={() => toggleDate(ymd)}
                        className={[
                          "relative flex h-10 items-center justify-center rounded-xl text-sm transition-colors",
                          selected
                            ? "bg-accent text-white"
                            : inMonth
                              ? "text-foreground hover:bg-surface"
                              : "text-tertiary hover:bg-surface",
                          isToday && !selected ? "border border-accent/30" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span>{day.getDate()}</span>
                        {selected ? (
                          <Check size={11} weight="bold" className="absolute right-1.5 bottom-1.5" />
                        ) : isAvailable ? (
                          <span className="absolute right-1.5 bottom-1.5 h-1.5 w-1.5 rounded-full bg-accent/40" />
                        ) : null}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t border-border/70 pt-3">
                  <p className="text-[11px] text-tertiary">
                    Tap one or more calendar dates to filter exactly.
                  </p>
                  <button
                    type="button"
                    className="text-sm font-medium text-accent hover:opacity-80"
                    onClick={() => {
                      const next = new Date();
                      setVisibleMonth(startOfMonth(next));
                      toggleDate(formatValue(next));
                    }}
                  >
                    Today
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
