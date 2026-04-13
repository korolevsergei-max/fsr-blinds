"use client";

type StickyDayRailProps = {
  dayLabel: string;
  dayNumber: number;
  isToday: boolean;
  isPast: boolean;
  taskCount?: number;
};

export function StickyDayRail({
  dayLabel,
  dayNumber,
  isToday,
  isPast,
  taskCount = 0,
}: StickyDayRailProps) {
  const labelClass = isToday
    ? "text-accent"
    : isPast
      ? "text-zinc-400"
      : "text-tertiary";

  const numberClass = isToday
    ? "text-accent"
    : isPast
      ? "text-zinc-500"
      : "text-foreground";

  const shellClass = isToday
    ? "border-accent/18 bg-card"
    : isPast
      ? "border-border bg-card"
      : "border-border bg-card";

  const countLabel = taskCount === 0 ? "Open day" : taskCount === 1 ? "1 task" : `${taskCount} tasks`;

  return (
    <div
      className="sticky top-[var(--schedule-sticky-top)] z-20 -mx-4 pb-5 before:pointer-events-none before:absolute before:-top-6 before:left-0 before:right-0 before:h-6 before:bg-card before:content-[''] after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-5 after:bg-card after:content-['']"
    >
      <div
        className={`relative border-y px-4 py-3 backdrop-blur-md ${shellClass}`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-end gap-2.5">
            <span className={`pb-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] ${labelClass}`}>
              {dayLabel}
            </span>
            <span
              className={`font-mono text-[2rem] font-bold leading-none tracking-[-0.06em] ${numberClass}`}
            >
              {dayNumber}
            </span>
          </div>

          <div className="h-px flex-1 bg-border" />

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-tertiary sm:inline-flex">
              {countLabel}
            </span>
            {isToday && (
              <span className="inline-flex h-7 items-center rounded-full border border-accent/15 bg-accent-light px-2.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">
                Today
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
