"use client";

export function StickySectionRail({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  return (
    <div className="sticky top-[var(--schedule-sticky-top)] z-20 -mx-4 pb-5 before:pointer-events-none before:absolute before:-top-6 before:left-0 before:right-0 before:h-6 before:bg-card before:content-[''] after:pointer-events-none after:absolute after:bottom-0 after:left-0 after:right-0 after:h-5 after:bg-card after:content-['']">
      <div className="relative border-y border-border bg-card px-4 py-3 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4 px-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-tertiary">
            {label}
          </p>
          <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-medium text-tertiary">
            {count} scheduled
          </span>
        </div>
      </div>
    </div>
  );
}
