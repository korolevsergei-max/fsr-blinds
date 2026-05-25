"use client";

import { useRouter } from "next/navigation";
import { CheckCircle, WarningCircle, Check, Circle } from "@phosphor-icons/react";
import type { ManufacturingWindowItem } from "@/lib/manufacturing-scheduler";
import { formatStoredDateLongEnglish } from "@/lib/created-date";
import {
  ManufacturingSummaryCard,
  type ManufacturingHighlightSection,
} from "@/components/windows/manufacturing-summary-card";

export interface CutterUnitGroup {
  unitId: string;
  unitNumber: string;
  buildingId: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  completeByDate: string | null;
  allMeasuredAt: string | null;
  productionEnteredAt: string | null;
  windows: ManufacturingWindowItem[];
  hasIssue: boolean;
}

export function isReturnedToCutter(item: ManufacturingWindowItem): boolean {
  return item.issueStatus === "open" && item.escalation?.targetRole === "cutter";
}

function getDueDate(
  item: Pick<ManufacturingWindowItem, "installationDate" | "completeByDate">
) {
  return item.installationDate ?? item.completeByDate ?? null;
}

function formatDueDate(
  item: Pick<ManufacturingWindowItem, "installationDate" | "completeByDate">
) {
  const date = getDueDate(item);
  const label = formatStoredDateLongEnglish(date);
  if (!label) return null;
  return item.installationDate ? `Install ${label}` : `Complete by ${label}`;
}

interface UnitCardProps {
  unit: CutterUnitGroup;
  highlightSection?: ManufacturingHighlightSection | null;
  /** When true, header tap toggles selection rather than navigating. */
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  /** Base for header link (e.g. /cutter/units). Used only when not selectable. */
  unitHrefBase?: string;
  /** Per-window slot rendered after the summary card (e.g. Mark cut). */
  renderWindowActions?: (item: ManufacturingWindowItem) => React.ReactNode;
  /** Optional label rendered in the header (e.g. "In production since X"). */
  headerMeta?: React.ReactNode;
}

export function UnitCard({
  unit,
  highlightSection = null,
  selectable = false,
  selected = false,
  onToggleSelect,
  unitHrefBase,
  renderWindowActions,
  headerMeta,
}: UnitCardProps) {
  const router = useRouter();
  const dueDateLabel = formatDueDate(unit);
  const measuredLabel = formatStoredDateLongEnglish(
    unit.allMeasuredAt?.slice(0, 10) ?? null
  );

  function handleHeaderClick() {
    if (selectable) {
      onToggleSelect?.();
      return;
    }
    if (unitHrefBase) {
      router.push(`${unitHrefBase}/${unit.unitId}`);
    }
  }

  const ringClass = selected
    ? "ring-2 ring-accent ring-offset-2 ring-offset-card"
    : "";
  const borderClass = unit.hasIssue
    ? "border-red-200 shadow-[0_1px_3px_rgba(185,28,28,0.08)]"
    : "border-border";

  return (
    <article
      className={[
        "overflow-hidden rounded-[var(--radius-lg)] border bg-card transition-shadow",
        borderClass,
        ringClass,
      ].join(" ")}
    >
      <button
        type="button"
        onClick={handleHeaderClick}
        className={[
          "w-full border-b px-4 py-3 text-left",
          unit.hasIssue
            ? "border-red-100 bg-red-50/60"
            : "border-border/70 bg-surface/40",
        ].join(" ")}
      >
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-2 min-w-0">
            {selectable && (
              <span
                aria-hidden
                className={[
                  "flex h-5 w-5 items-center justify-center rounded-full border transition-colors",
                  selected
                    ? "border-accent bg-accent text-white"
                    : "border-border bg-card text-transparent",
                ].join(" ")}
              >
                {selected ? (
                  <Check size={12} weight="bold" />
                ) : (
                  <Circle size={6} weight="fill" />
                )}
              </span>
            )}
            <p className="text-[13px] font-semibold text-foreground truncate">
              Unit {unit.unitNumber} · {unit.buildingName}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-tertiary">
            {dueDateLabel && <span>{dueDateLabel}</span>}
            {measuredLabel && <span>Measured {measuredLabel}</span>}
            <span>
              {unit.windows.length} window
              {unit.windows.length === 1 ? "" : "s"}
            </span>
            {headerMeta}
          </div>
        </div>
      </button>

      <div className="divide-y divide-border/70">
        {unit.windows.map((item) => {
          const returnedToRole = isReturnedToCutter(item);
          const isCut = item.productionStatus !== "pending";
          return (
            <div key={item.windowId} className="px-4 py-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-[18px] font-semibold tracking-tight text-foreground">
                    {item.label}
                  </h3>
                  <span className="rounded-full bg-surface px-2.5 py-1 text-[11px] font-medium text-secondary">
                    {item.roomName}
                  </span>
                  <span className="rounded-full bg-surface px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-secondary">
                    {item.blindType}
                  </span>
                  {item.cutListPrintedAt && (
                    <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-sky-700 border border-sky-200">
                      LIST ✓
                    </span>
                  )}
                  {item.manufacturingLabelPrintedAt && (
                    <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-zinc-700 border border-zinc-300">
                      MFG ✓
                    </span>
                  )}
                  {item.packagingLabelPrintedAt && (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-amber-700 border border-amber-200">
                      PKG ✓
                    </span>
                  )}
                  {returnedToRole && (
                    <span className="rounded-full bg-red-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-red-700">
                      Returned
                    </span>
                  )}
                  {!returnedToRole && item.wasReworkInCycle && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-amber-800">
                      Rework — priority
                    </span>
                  )}
                  {isCut && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.07em] text-emerald-700">
                      <CheckCircle size={11} weight="fill" />
                      Cut
                    </span>
                  )}
                </div>
                <p className="font-mono text-[18px] font-semibold leading-none tracking-tight text-foreground">
                  {item.width ?? "—"} × {item.height ?? "—"}
                  {item.depth != null ? ` × ${item.depth}` : ""}
                </p>
              </div>

              {item.issueStatus === "open" && (
                <div
                  className={`max-w-[65ch] rounded-[var(--radius-md)] border px-3 py-3 text-[12px] leading-6 ${returnedToRole ? "border-red-200 bg-white/90 text-red-800" : "border-amber-200 bg-amber-50/80 text-amber-800"}`}
                >
                  <p className="flex items-center gap-1.5 font-semibold">
                    <WarningCircle size={13} weight="fill" />
                    {item.issueReason ||
                      (returnedToRole ? "Returned for rework" : "Issue open")}
                  </p>
                  {item.issueNotes && <p className="mt-1">{item.issueNotes}</p>}
                </div>
              )}

              {item.notes && (
                <p className="text-[12px] leading-6 text-secondary max-w-[65ch]">
                  {item.notes}
                </p>
              )}

              <ManufacturingSummaryCard
                width={item.width}
                height={item.height}
                depth={item.depth}
                windowInstallation={item.windowInstallation}
                wandChain={item.wandChain}
                fabricAdjustmentSide={item.fabricAdjustmentSide}
                fabricAdjustmentInches={item.fabricAdjustmentInches}
                blindType={item.blindType}
                chainSide={item.chainSide}
                highlightSection={highlightSection}
              />

              {renderWindowActions?.(item)}
            </div>
          );
        })}
      </div>
    </article>
  );
}
