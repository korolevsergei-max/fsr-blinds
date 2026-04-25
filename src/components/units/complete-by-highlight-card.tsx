"use client";

import { CalendarBlank } from "@phosphor-icons/react";
import { formatStoredDateForDisplay } from "@/lib/created-date";

type CompleteByHighlightCardProps = {
  completeByDate: string | null | undefined;
  className?: string;
  compact?: boolean;
};

export function CompleteByHighlightCard({
  completeByDate,
  className,
  compact = false,
}: CompleteByHighlightCardProps) {
  const displayDate = formatStoredDateForDisplay(completeByDate);
  return (
    <div
      className={[
        "rounded-[var(--radius-lg)] border border-amber-300/80 bg-amber-50",
        compact ? "px-3 py-2.5" : "px-4 py-3",
        "shadow-[0_1px_0_rgba(245,158,11,0.18)]",
        className ?? "",
      ].join(" ")}
    >
      <div className="flex items-start gap-2.5">
        {!compact && (
          <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full bg-amber-100 text-amber-700">
            <CalendarBlank size={14} weight="bold" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-amber-700">
            {compact ? "Client Deadline" : "Client Deadline (Complete by)"}
          </p>
          <p
            className={[
              "mt-0.5 font-semibold leading-tight text-amber-900",
              compact ? "text-[14px]" : "text-[16px]",
            ].join(" ")}
          >
            {displayDate ?? "Not set"}
          </p>
        </div>
      </div>
    </div>
  );
}
