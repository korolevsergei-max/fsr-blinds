"use client";

import { CalendarBlank } from "@phosphor-icons/react";
import { formatStoredDateForDisplay } from "@/lib/created-date";

type CompleteByHighlightCardProps = {
  completeByDate: string | null | undefined;
  className?: string;
};

export function CompleteByHighlightCard({
  completeByDate,
  className,
}: CompleteByHighlightCardProps) {
  const displayDate = formatStoredDateForDisplay(completeByDate);
  return (
    <div
      className={[
        "rounded-[var(--radius-lg)] border border-amber-300/80 bg-amber-50 px-4 py-3",
        "shadow-[0_1px_0_rgba(245,158,11,0.18)]",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <CalendarBlank size={14} weight="bold" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
            Client Deadline (Complete by)
          </p>
          <p className="mt-0.5 text-[16px] font-semibold leading-tight text-amber-900">
            {displayDate ?? "Not set"}
          </p>
        </div>
      </div>
    </div>
  );
}
