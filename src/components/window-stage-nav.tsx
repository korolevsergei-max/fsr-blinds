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
  isManufactured = false,
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
  isManufactured?: boolean;
  isInstalled?: boolean;
  routeBasePath?: "/installer/units" | "/management/units" | "/scheduler/units";
  compact?: boolean;
  /** Omit bottom margin when nested in a header or tight layout. */
  flushBottom?: boolean;
}) {
  const items = [
    {
      key: "before" as const,
      label: "Measured",
      done: isMeasured,
      href: `${routeBasePath}/${unitId}/rooms/${roomId}/windows/new?edit=${windowId}`,
    },
    {
      key: "bracketed" as const,
      label: "Bracketed",
      done: isBracketed,
      href: `${routeBasePath}/${unitId}/rooms/${roomId}/windows/${windowId}/bracketing`,
    },
  ];
  const manufacturedClasses = `flex items-center justify-center gap-1 min-w-0 rounded-xl text-center font-bold tracking-tight ${
    compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs"
  } ${
    isManufactured ? "bg-emerald-50 text-emerald-700" : "bg-white text-zinc-500"
  }`;

  const bottomSpacing = flushBottom ? "" : compact ? "" : "mb-2";

  return (
    <div
      className={`grid grid-cols-4 gap-2 rounded-2xl border border-border bg-surface p-1.5 ${bottomSpacing}`}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`flex items-center justify-center gap-1 min-w-0 rounded-xl text-center font-bold tracking-tight transition-all active:scale-[0.98] ${
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
              className={`shrink-0 ${item.key === active ? "text-white" : "text-emerald-600"}`}
            />
          )}
          <span className="truncate">{item.label}</span>
        </Link>
      ))}
      <div className={manufacturedClasses} aria-label="Manufactured progress">
        {isManufactured && (
          <CheckCircle size={12} weight="fill" className="shrink-0 text-emerald-600" />
        )}
        <span className="truncate">Built</span>
      </div>
      <Link
        href={`${routeBasePath}/${unitId}/rooms/${roomId}/windows/${windowId}/installed`}
        className={`flex items-center justify-center gap-1 min-w-0 rounded-xl text-center font-bold tracking-tight transition-all active:scale-[0.98] ${
          compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs"
        } ${
          active === "installed"
            ? isInstalled
              ? "bg-emerald-600 text-white shadow-sm"
              : "bg-accent text-white shadow-sm"
            : isInstalled
              ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              : "bg-white text-zinc-500 hover:bg-zinc-100"
        }`}
      >
        {isInstalled && (
          <CheckCircle
            size={active === "installed" ? 14 : 12}
            weight="fill"
            className={`shrink-0 ${active === "installed" ? "text-white" : "text-emerald-600"}`}
          />
        )}
        <span className="truncate">Installed</span>
      </Link>
    </div>
  );
}
