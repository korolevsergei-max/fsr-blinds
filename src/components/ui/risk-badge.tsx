"use client";

import type { RiskFlag } from "@/lib/types";
import { Warning, CheckCircle, WarningCircle } from "@phosphor-icons/react";

const config: Record<RiskFlag, { bg: string; text: string; label: string; Icon: typeof Warning }> = {
  green: { bg: "bg-emerald-50", text: "text-emerald-600", label: "Clear", Icon: CheckCircle },
  yellow: { bg: "bg-amber-50", text: "text-amber-600", label: "Escalation", Icon: Warning },
  red: { bg: "bg-red-50", text: "text-red-600", label: "At Risk", Icon: WarningCircle },
};

export function RiskBadge({ flag, showLabel = true }: { flag: RiskFlag; showLabel?: boolean }) {
  const { bg, text, label, Icon } = config[flag];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
      <Icon size={14} weight="fill" />
      {showLabel && label}
    </span>
  );
}

export function RiskDot({ flag }: { flag: RiskFlag }) {
  const colors: Record<RiskFlag, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    red: "bg-red-500",
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[flag]}`} />
  );
}
