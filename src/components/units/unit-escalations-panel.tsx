"use client";

import Link from "next/link";
import { WarningCircle } from "@phosphor-icons/react";
import { RiskBadge } from "@/components/ui/risk-badge";
import {
  formatManufacturingRoleLabel,
  type UnitEscalationSummary,
} from "@/lib/window-issues";

export function UnitEscalationsPanel({
  escalations,
  getEscalationHref,
}: {
  escalations: UnitEscalationSummary[];
  getEscalationHref?: (item: UnitEscalationSummary) => string | undefined;
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
        {escalations.map((item) => {
          const href = getEscalationHref?.(item);
          const inner = (
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {item.roomName} · {item.windowLabel}
                </p>
                {item.issueType === "manufacturing_pushback" ? (
                  <>
                    <p className="mt-1 text-[11px] font-semibold text-amber-900">
                      {(item.sourceRole ? formatManufacturingRoleLabel(item.sourceRole) : "Manufacturing")} to{" "}
                      {(item.targetRole ? formatManufacturingRoleLabel(item.targetRole) : "Manufacturing")}
                      {item.reason ? ` · ${item.reason}` : ""}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-zinc-600">{item.note}</p>
                  </>
                ) : (
                  <p className="mt-1 text-xs leading-relaxed text-zinc-600">{item.note}</p>
                )}
              </div>
              <RiskBadge
                flag={item.riskFlag}
                kind={item.issueType === "client_approval" ? "client_approval" : "manufacturing"}
              />
            </div>
          );

          return href ? (
            <Link
              key={item.windowId}
              href={href}
              className="block px-4 py-3 hover:bg-amber-100/60 active:bg-amber-100 transition-colors"
            >
              {inner}
            </Link>
          ) : (
            <div key={item.windowId} className="px-4 py-3">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
