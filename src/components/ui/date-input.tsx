"use client";

import { CalendarBlank, CaretLeft, CaretRight } from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DateInputProps = {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  helper?: string;
  error?: string;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
  compact?: boolean;
  className?: string;
  triggerClassName?: string;
};

function parseDate(value: string): Date | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function formatValue(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDisplay(value: string): string {
  const date = parseDate(value);
  if (!date) return "Select date";
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
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

export function DateInput({
  value,
  onChange,
  label,
  helper,
  error,
  id,
  disabled = false,
  placeholder = "Select date",
  compact = false,
  className = "",
  triggerClassName = "",
}: DateInputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-") || undefined;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const selectedDate = useMemo(() => parseDate(value), [value]);
  const [open, setOpen] = useState(false);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  function openWithPosition() {
    if (!triggerRef.current) { setOpen(true); return; }
    const rect = triggerRef.current.getBoundingClientRect();
    const calendarHeight = 380;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openAbove = spaceBelow < calendarHeight && rect.top > calendarHeight;
    setPopupStyle(
      openAbove
        ? { position: "fixed", bottom: window.innerHeight - rect.top + 8, left: rect.left, width: 320, zIndex: 9999 }
        : { position: "fixed", top: rect.bottom + 8, left: rect.left, width: 320, zIndex: 9999 }
    );
    setOpen(true);
  }
  const [visibleMonth, setVisibleMonth] = useState<Date>(
    startOfMonth(selectedDate ?? new Date())
  );

  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    if (selectedDate) {
      setVisibleMonth(startOfMonth(selectedDate));
    }
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !rootRef.current?.contains(target) &&
        !(popupRef.current?.contains(target))
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

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(visibleMonth));
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [visibleMonth]);

  const today = new Date();

  const baseTriggerClass = compact
    ? "inline-flex min-w-[12rem] items-center gap-2 rounded-md px-1 py-0.5 text-left text-[13px] font-medium focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-50"
    : "flex h-[3.25rem] w-full items-center justify-between rounded-[var(--radius-lg)] border bg-card px-4 text-left text-[15px] transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] focus:outline-none focus:ring-[3px] disabled:opacity-50";

  const triggerTone = compact
    ? "bg-transparent text-foreground"
    : error
      ? "border-danger focus:border-danger focus:ring-[rgba(200,57,43,0.14)]"
      : "border-border focus:border-accent focus:ring-[rgba(15,118,110,0.14)]";

  const displayValue = value ? formatDisplay(value) : placeholder;

  return (
    <div ref={rootRef} className={`relative flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="text-[13px] font-medium text-secondary">
          {label}
        </label>
      )}

      <button
        ref={triggerRef}
        id={inputId}
        type="button"
        disabled={disabled}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => (open ? setOpen(false) : openWithPosition())}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openWithPosition();
            setVisibleMonth((prev) => addMonths(prev, 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            openWithPosition();
            setVisibleMonth((prev) => addMonths(prev, -1));
          }
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            open ? setOpen(false) : openWithPosition();
          }
        }}
        className={[baseTriggerClass, triggerTone, triggerClassName].filter(Boolean).join(" ")}
      >
        <span className={value ? "text-foreground" : "text-tertiary"}>
          {displayValue}
        </span>
        <CalendarBlank size={compact ? 16 : 18} className="shrink-0 text-tertiary" />
      </button>

      {error && <p className="text-[13px] leading-snug text-danger">{error}</p>}
      {helper && !error && <p className="text-[13px] leading-snug text-tertiary">{helper}</p>}

      {open && createPortal(
        <div
          ref={popupRef}
          role="dialog"
          aria-label={label ?? "Date picker"}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setVisibleMonth((prev) => addMonths(prev, 1));
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setVisibleMonth((prev) => addMonths(prev, -1));
            }
          }}
          style={popupStyle}
          className="rounded-2xl border border-border bg-white p-4 shadow-2xl"
        >
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
              const inMonth = isSameMonth(day, visibleMonth);
              const selected = selectedDate ? isSameDay(day, selectedDate) : false;
              const isToday = isSameDay(day, today);

              return (
                <button
                  key={formatValue(day)}
                  type="button"
                  onClick={() => {
                    onChange(formatValue(day));
                    setOpen(false);
                  }}
                  className={[
                    "flex h-10 items-center justify-center rounded-xl text-sm transition-colors",
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
                  {day.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <button
              type="button"
              className="text-sm font-medium text-accent hover:opacity-80"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
            >
              Clear
            </button>
            <button
              type="button"
              className="text-sm font-medium text-accent hover:opacity-80"
              onClick={() => {
                const next = new Date();
                onChange(formatValue(next));
                setVisibleMonth(startOfMonth(next));
              }}
            >
              Today
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
