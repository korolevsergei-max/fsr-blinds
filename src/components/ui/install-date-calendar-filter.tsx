"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { CaretDown, CaretLeft, CaretRight } from "@phosphor-icons/react";

const WEEKDAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getGridDays(year: number, month: number): (Date | null)[] {
  const firstDow = new Date(year, month, 1).getDay(); // 0=Sun
  const offset = firstDow === 0 ? 6 : firstDow - 1; // shift to Mon-start
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(offset).fill(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export const NOT_SET_SENTINEL = "__not_set__";

interface InstallDateCalendarFilterProps {
  selectedDates: string[];
  onChange: (dates: string[]) => void;
  availableDates: Set<string>;
  /** When true, show a "Not set" toggle for items with no date. */
  showNotSet?: boolean;
  label?: string;
}

export function InstallDateCalendarFilter({
  selectedDates,
  onChange,
  availableDates,
  showNotSet,
  label = "Installation Date",
}: InstallDateCalendarFilterProps) {
  const today = new Date();
  const todayKey = formatDateKey(today);

  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number }>({ top: 0 });
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const buttonRef = useRef<HTMLButtonElement>(null);

  const notSetSelected = selectedDates.includes(NOT_SET_SENTINEL);
  const realDates = selectedDates.filter((d) => d !== NOT_SET_SENTINEL);
  const active = selectedDates.length > 0;

  let displayLabel = label;
  if (selectedDates.length === 1 && notSetSelected) {
    displayLabel = `${label}: Not set`;
  } else if (realDates.length === 1 && !notSetSelected) {
    const d = new Date(`${realDates[0]}T00:00:00`);
    displayLabel = d.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
  } else if (selectedDates.length > 1) {
    displayLabel = `${label} (${selectedDates.length})`;
  }

  function handleToggle() {
    if (buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const vw = window.innerWidth;
      const pad = 12;
      if (rect.left > vw / 2) {
        setPosition({ top: rect.bottom + 6, right: Math.max(pad, vw - rect.right) });
      } else {
        setPosition({ top: rect.bottom + 6, left: Math.max(pad, rect.left) });
      }
    }
    setOpen((v) => !v);
  }

  function toggleDate(key: string) {
    if (selectedDates.includes(key)) {
      onChange(selectedDates.filter((d) => d !== key));
    } else {
      onChange([...selectedDates, key].sort());
    }
  }

  function prevMonth() {
    if (viewMonth === 0) { setViewYear((y) => y - 1); setViewMonth(11); }
    else setViewMonth((m) => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear((y) => y + 1); setViewMonth(0); }
    else setViewMonth((m) => m + 1);
  }

  const cells = getGridDays(viewYear, viewMonth);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        className={[
          "flex h-8 flex-shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-xs font-medium transition-all",
          active
            ? "border-accent bg-accent text-white"
            : "border-border bg-card text-secondary hover:border-zinc-300",
        ].join(" ")}
      >
        {displayLabel}
        <CaretDown size={11} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <div key="cal-wrap" className="relative z-[9999]">
                <div
                  key="cal-backdrop"
                  className="fixed inset-0 z-40"
                  onClick={() => setOpen(false)}
                />
                <motion.div
                  key="cal-menu"
                  initial={{ opacity: 0, y: -4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  style={{ top: position.top, left: position.left, right: position.right }}
                  className="fixed z-50 w-[228px] rounded-[var(--radius-lg)] border border-border bg-card p-3 shadow-[var(--shadow-md)]"
                >
                  {/* Month nav */}
                  <div className="mb-2.5 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={prevMonth}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-secondary hover:bg-surface"
                    >
                      <CaretLeft size={11} weight="bold" />
                    </button>
                    <span className="text-[11px] font-semibold text-foreground">
                      {MONTHS[viewMonth]} {viewYear}
                    </span>
                    <button
                      type="button"
                      onClick={nextMonth}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-secondary hover:bg-surface"
                    >
                      <CaretRight size={11} weight="bold" />
                    </button>
                  </div>

                  {/* Weekday headers */}
                  <div className="mb-1 grid grid-cols-7">
                    {WEEKDAYS.map((d) => (
                      <div key={d} className="py-0.5 text-center text-[9px] font-semibold text-tertiary">
                        {d}
                      </div>
                    ))}
                  </div>

                  {/* Day grid */}
                  <div className="grid grid-cols-7 gap-y-0.5">
                    {cells.map((day, i) => {
                      if (!day) return <div key={`e${i}`} className="h-7" />;
                      const key = formatDateKey(day);
                      const isSelected = selectedDates.includes(key);
                      const isToday = key === todayKey;
                      const hasItems = availableDates.has(key);

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => toggleDate(key)}
                          className={[
                            "relative flex h-7 w-full flex-col items-center justify-center rounded-md text-[10px] font-medium transition-colors",
                            isSelected
                              ? "bg-accent text-white"
                              : isToday
                              ? "border border-accent text-accent hover:bg-emerald-50"
                              : hasItems
                              ? "text-foreground hover:bg-surface"
                              : "text-tertiary hover:bg-surface",
                          ].join(" ")}
                        >
                          {day.getDate()}
                          {hasItems && !isSelected && (
                            <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-accent opacity-50" />
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {/* Not set toggle */}
                  {showNotSet && (
                    <button
                      type="button"
                      onClick={() => {
                        if (notSetSelected) {
                          onChange(realDates);
                        } else {
                          onChange([...realDates, NOT_SET_SENTINEL]);
                        }
                      }}
                      className={[
                        "mt-2.5 w-full rounded-lg px-3 py-2 text-left text-[11px] font-semibold transition-colors",
                        notSetSelected
                          ? "bg-accent text-white"
                          : "bg-surface text-foreground hover:bg-zinc-100",
                      ].join(" ")}
                    >
                      Not set
                    </button>
                  )}

                  {/* Clear */}
                  {selectedDates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => onChange([])}
                      className="mt-2.5 w-full text-center text-[10px] font-medium text-tertiary hover:text-accent"
                    >
                      Clear selection
                    </button>
                  )}
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </>
  );
}
