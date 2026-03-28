"use client";

import Link from "next/link";

export function WindowStageNav({
  unitId,
  roomId,
  windowId,
  active,
  compact = false,
}: {
  unitId: string;
  roomId: string;
  windowId: string;
  active: "before" | "bracketed" | "installed";
  compact?: boolean;
}) {
  const items = [
    {
      key: "before" as const,
      label: "Before",
      href: `/installer/units/${unitId}/rooms/${roomId}/windows/new?edit=${windowId}`,
    },
    {
      key: "bracketed" as const,
      label: "Bracketed",
      href: `/installer/units/${unitId}/rooms/${roomId}/windows/${windowId}/bracketing`,
    },
    {
      key: "installed" as const,
      label: "Installed",
      href: `/installer/units/${unitId}/rooms/${roomId}/windows/${windowId}/installed`,
    },
  ];

  return (
    <div
      className={`grid grid-cols-3 gap-2 rounded-2xl border border-border bg-surface p-1.5 ${
        compact ? "" : "mb-2"
      }`}
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={`rounded-xl text-center font-semibold transition-all ${
            compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs"
          } ${
            item.key === active
              ? "bg-accent text-white"
              : "bg-white text-zinc-600 hover:bg-zinc-100"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
