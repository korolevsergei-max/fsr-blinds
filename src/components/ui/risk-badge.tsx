"use client";

import type { RiskFlag } from "@/lib/types";
import { Warning, CheckCircle, WarningCircle } from "@phosphor-icons/react";

const config: Record<RiskFlag, { bg: string; text: string; label: string; Icon: typeof Warning }> = {
  green: { bg: "bg-teal-50 border-teal-200", text: "text-teal-700", label: "No Issues", Icon: CheckCircle },
  yellow: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", label: "Escalation", Icon: Warning },
  red: { bg: "bg-red-50 border-red-200", text: "text-red-700", label: "Timeline", Icon: WarningCircle },
};

export function RiskBadge({ flag, showLabel = true }: { flag: RiskFlag; showLabel?: boolean }) {
  const { bg, text, label, Icon } = config[flag];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${bg} ${text}`}>
      <Icon size={13} weight="fill" />
      {showLabel && label}
    </span>
  );
}

export function RiskDot({ flag }: { flag: RiskFlag }) {
  const colors: Record<RiskFlag, string> = {
    green: "bg-teal-500",
    yellow: "bg-amber-500",
    red: "bg-red-500",
  };
  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[flag]}`} />
  );
}
