"use client";

import { WarningCircle } from "@phosphor-icons/react";
import { RiskBadge } from "@/components/ui/risk-badge";
import type { UnitEscalationSummary } from "@/lib/window-issues";

export function UnitEscalationsPanel({
  escalations,
}: {
  escalations: UnitEscalationSummary[];
}) {
  if (escalations.length === 0) return null;

  return (
    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-amber-50/60">
      <div className="flex items-start gap-3 border-b border-amber-200/70 px-4 py-3.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-amber-600">
          <WarningCircle size={18} weight="fill" />
        </div>
        <div>
          <p className="text-sm font-bold text-foreground">Escalations</p>
          <p className="mt-0.5 text-xs text-zinc-600">
            {escalations.length} flagged window{escalations.length !== 1 ? "s" : ""} need attention.
          </p>
        </div>
      </div>

      <div className="flex flex-col divide-y divide-amber-200/70">
        {escalations.map((item) => (
          <div key={item.windowId} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {item.roomName} · {item.windowLabel}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-zinc-600">{item.note}</p>
              </div>
              <RiskBadge flag={item.riskFlag} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
