"use client";

import type { RiskFlag } from "@/lib/types";
import { Wrench, CheckCircle } from "@phosphor-icons/react";

const config: Record<RiskFlag, { bg: string; text: string; Icon: typeof Wrench; label: string }> = {
  green:    { bg: "bg-teal-50 border-teal-200",   text: "text-teal-700",  Icon: Wrench,      label: "MFG"   },
  yellow:   { bg: "bg-amber-50 border-amber-200",  text: "text-amber-700", Icon: Wrench,      label: "MFG"   },
  red:      { bg: "bg-red-50 border-red-200",      text: "text-red-700",   Icon: Wrench,      label: "MFG"   },
  complete: { bg: "bg-green-500 border-green-500", text: "text-white",     Icon: CheckCircle, label: "Ready" },
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
    complete: "bg-green-500",
  };
  return <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[flag]}`} />;
}

/** Small inline MFG badge for unit cards */
export function MfgBadge({ flag }: { flag?: RiskFlag }) {
  if (!flag) return null;
  const cls =
    flag === "red"
      ? "bg-red-50 text-red-600 border-red-200"
      : flag === "yellow"
      ? "bg-amber-50 text-amber-600 border-amber-200"
      : flag === "complete"
      ? "bg-green-500 text-white border-green-500"
      : "bg-teal-50 text-teal-600 border-teal-200";
  const Icon = flag === "complete" ? CheckCircle : Wrench;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${cls}`}>
      <Icon size={8} weight="fill" />
      {flag === "complete" ? "Ready" : "MFG"}
    </span>
  );
}
