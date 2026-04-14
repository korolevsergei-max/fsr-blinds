"use client";

import { CheckCircle } from "@phosphor-icons/react";
import Link from "next/link";

type StageKey = "before" | "bracketed" | "installed";

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
  /** When provided, pills become buttons that call this instead of navigating. */
  onStageSelect,
}: {
  unitId: string;
  roomId: string;
  windowId: string;
  active: StageKey;
  isMeasured?: boolean;
  isBracketed?: boolean;
  isManufactured?: boolean;
  isInstalled?: boolean;
  routeBasePath?: "/installer/units" | "/management/units" | "/scheduler/units";
  compact?: boolean;
  /** Omit bottom margin when nested in a header or tight layout. */
  flushBottom?: boolean;
  onStageSelect?: (stage: StageKey) => void;
}) {
  const items: { key: StageKey; label: string; done: boolean; href: string }[] = [
    {
      key: "before",
      label: "Measured",
      done: isMeasured,
      href: `${routeBasePath}/${unitId}/rooms/${roomId}/windows/new?edit=${windowId}`,
    },
    {
      key: "bracketed",
      label: "Bracketed",
      done: isBracketed,
      href: `${routeBasePath}/${unitId}/rooms/${roomId}/windows/${windowId}/bracketing`,
    },
  ];

  const installedHref = `${routeBasePath}/${unitId}/rooms/${roomId}/windows/${windowId}/installed`;

  const manufacturedClasses = `flex items-center justify-center gap-1 min-w-0 rounded-xl text-center font-bold tracking-tight ${
    compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs"
  } ${isManufactured ? "bg-emerald-50 text-emerald-700" : "bg-white text-zinc-500"}`;

  const bottomSpacing = flushBottom ? "" : compact ? "" : "mb-2";

  const pillClasses = (key: StageKey, done: boolean) =>
    `flex items-center justify-center gap-1 min-w-0 rounded-xl text-center font-bold tracking-tight transition-all active:scale-[0.98] ${
      compact ? "px-2 py-1.5 text-[11px]" : "px-3 py-2 text-xs"
    } ${
      key === active
        ? done
          ? "bg-emerald-600 text-white shadow-sm"
          : "bg-accent text-white shadow-sm"
        : done
          ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          : "bg-white text-zinc-500 hover:bg-zinc-100"
    }`;

  return (
    <div
      className={`grid grid-cols-4 gap-2 rounded-2xl border border-border bg-surface p-1.5 ${bottomSpacing}`}
    >
      {items.map((item) =>
        onStageSelect ? (
          <button
            key={item.key}
            type="button"
            onClick={() => onStageSelect(item.key)}
            className={pillClasses(item.key, item.done)}
          >
            {item.done && (
              <CheckCircle
                size={item.key === active ? 14 : 12}
                weight="fill"
                className={`shrink-0 ${item.key === active ? "text-white" : "text-emerald-600"}`}
              />
            )}
            <span className="truncate">{item.label}</span>
          </button>
        ) : (
          <Link key={item.key} href={item.href} className={pillClasses(item.key, item.done)}>
            {item.done && (
              <CheckCircle
                size={item.key === active ? 14 : 12}
                weight="fill"
                className={`shrink-0 ${item.key === active ? "text-white" : "text-emerald-600"}`}
              />
            )}
            <span className="truncate">{item.label}</span>
          </Link>
        )
      )}

      {/* Built — never navigates */}
      <div className={manufacturedClasses} aria-label="Manufactured progress">
        {isManufactured && (
          <CheckCircle size={12} weight="fill" className="shrink-0 text-emerald-600" />
        )}
        <span className="truncate">Built</span>
      </div>

      {/* Installed */}
      {onStageSelect ? (
        <button
          type="button"
          onClick={() => onStageSelect("installed")}
          className={pillClasses("installed", isInstalled)}
        >
          {isInstalled && (
            <CheckCircle
              size={active === "installed" ? 14 : 12}
              weight="fill"
              className={`shrink-0 ${active === "installed" ? "text-white" : "text-emerald-600"}`}
            />
          )}
          <span className="truncate">Installed</span>
        </button>
      ) : (
        <Link href={installedHref} className={pillClasses("installed", isInstalled)}>
          {isInstalled && (
            <CheckCircle
              size={active === "installed" ? 14 : 12}
              weight="fill"
              className={`shrink-0 ${active === "installed" ? "text-white" : "text-emerald-600"}`}
            />
          )}
          <span className="truncate">Installed</span>
        </Link>
      )}
    </div>
  );
}
