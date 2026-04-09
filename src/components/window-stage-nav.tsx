"use client";

import { CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";

export function WindowStageNav({
  unitId,
  roomId,
  windowId,
  active,
  isMeasured = false,
  isBracketed = false,
  isInstalled = false,
  routeBasePath = "/installer/units",
  compact = false,
  flushBottom = false,
}: {
  unitId: string;
  roomId: string;
  windowId: string;
  active: "before" | "bracketed" | "installed";
  isMeasured?: boolean;
  isBracketed?: boolean;
  isInstalled?: boolean;
  routeBasePath?: "/installer/units" | "/management/units" | "/scheduler/units";
  compact?: boolean;
  /** Omit bottom margin when nested in a header or tight layout. */
  flushBottom?: boolean;
}) {
  const items = [
    {
      key: "before" as const,
      label: "Measurement",
      done: isMeasured,
      href: `${routeBasePath}/${unitId}/rooms/${roomId}/windows/new?edit=${windowId}`,
    },
    {
      key: "bracketed" as const,
      label: "Bracketed",
      done: isBracketed,
      href: `${routeBasePath}/${unitId}/rooms/${roomId}/windows/${windowId}/bracketing`,
    },
    {
      key: "installed" as const,
      label: "Installed",
      done: isInstalled,
      href: `${routeBasePath}/${unitId}/rooms/${roomId}/windows/${windowId}/installed`,
    },
  ];

  const bottomSpacing = flushBottom ? "" : compact ? "" : "mb-2";

  return (
    <div
      className={`grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface p-1.5 ${bottomSpacing}`}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`flex items-center justify-center gap-1.5 rounded-xl text-center font-bold tracking-tight transition-all active:scale-[0.98] ${
            compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs"
          } ${
            item.key === active
              ? item.done
                ? "bg-emerald-600 text-white shadow-sm"
                : "bg-accent text-white shadow-sm"
              : item.done
                ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "bg-white text-zinc-500 hover:bg-zinc-100"
          }`}
        >
          {item.done && (
            <CheckCircle
              size={item.key === active ? 14 : 12}
              weight="fill"
              className={item.key === active ? "text-white" : "text-emerald-600"}
            />
          )}
          {item.label}
        </Link>
      ))}
    </div>
  );
}
