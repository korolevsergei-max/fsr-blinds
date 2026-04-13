"use client";

import { CheckCircle, Circle, GitBranch } from "@phosphor-icons/react";
import type { Unit } from "@/lib/types";
import type { UnitMilestoneCoverage } from "@/lib/unit-milestones";
import { SectionLabel } from "@/components/ui/section-label";

function formatWhen(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Density = "comfortable" | "compact";

function Row({
  title,
  subtitle,
  met,
  scheduled,
  completed,
  density,
}: {
  title: string;
  subtitle?: string;
  met: boolean;
  scheduled?: string | null;
  completed?: string | null;
  density: Density;
}) {
  const iconSize = density === "comfortable" ? 22 : 18;
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 pt-0.5">
        {met ? (
          <CheckCircle
            size={iconSize}
            weight="fill"
            className={density === "comfortable" ? "text-accent" : "text-emerald-500"}
          />
        ) : (
          <Circle size={iconSize} className="text-zinc-300" />
        )}
      </div>
      <div className="min-w-0 flex-1 pb-1">
        <p
          className={
            density === "comfortable"
              ? `text-sm ${met ? "font-medium text-foreground" : "text-zinc-300"}`
              : `text-[12px] ${met ? "font-semibold text-foreground" : "text-tertiary"}`
          }
        >
          {title}
        </p>
        {subtitle && (
          <p className="text-[11px] text-tertiary mt-0.5 leading-snug">{subtitle}</p>
        )}
        {(scheduled || completed) && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1">
            {scheduled && (
              <p className="text-[10px] text-tertiary">Sched: {scheduled}</p>
            )}
            {completed && (
              <p className="text-[10px] font-medium text-accent">Done: {completed}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function UnitProgressMilestonesPanel({
  unit,
  milestones,
  layout,
  density = "compact",
  title = "Progress milestones",
  mediaViewerSlot,
  className = "",
}: {
  unit: Unit;
  milestones: UnitMilestoneCoverage;
  layout: "detail" | "simple";
  density?: Density;
  title?: string;
  mediaViewerSlot?: React.ReactNode;
  className?: string;
}) {
  const { allMeasured, allBracketed, allManufactured, allInstalled } = milestones;

  const schedM = formatWhen(unit.measurementDate);
  const schedB = formatWhen(unit.bracketingDate);
  const schedI = formatWhen(unit.installationDate);
  const doneM = formatWhen(milestones.measuredCompletedAt);
  const doneB = formatWhen(milestones.bracketedCompletedAt);
  const doneMf = formatWhen(milestones.manufacturedCompletedAt);
  const doneI = formatWhen(milestones.installedCompletedAt);

  const showDates = layout === "detail";

  return (
    <div className={className}>
      <div
        className={
          density === "comfortable"
            ? "mb-4 flex items-center justify-between gap-3"
            : "mb-3 flex items-center justify-between gap-3"
        }
      >
        {density === "comfortable" ? (
          <h3 className="text-[10px] font-bold text-muted uppercase tracking-[0.12em]">
            {title}
          </h3>
        ) : (
          <SectionLabel as="h2" noMargin>
            {title}
          </SectionLabel>
        )}
        {mediaViewerSlot}
      </div>

      {layout === "simple" && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface/80 px-3 py-2 mb-3">
          <GitBranch size={16} className="text-tertiary flex-shrink-0" />
          <p className="text-[11px] text-secondary leading-snug">
            Measurements and bracketing are independent—complete both before installation photos.
          </p>
        </div>
      )}

      <div
        className={
          density === "comfortable"
            ? "flex flex-col gap-4"
            : "flex flex-col gap-3"
        }
      >
        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted mb-2">
            Prerequisites (any order)
          </p>
          <div className={density === "comfortable" ? "space-y-4" : "space-y-3"}>
            <Row
              density={density}
              title="Measurements complete"
              subtitle={
                milestones.totalWindows > 0
                  ? `${milestones.measuredCount}/${milestones.totalWindows} windows measured`
                  : "No windows yet"
              }
              met={allMeasured}
              scheduled={showDates ? schedM : undefined}
              completed={showDates ? doneM : undefined}
            />
            <Row
              density={density}
              title="Bracketing photos complete"
              subtitle={
                milestones.totalWindows > 0
                  ? `${milestones.bracketedCount}/${milestones.totalWindows} windows with bracketing photos`
                  : "No windows yet"
              }
              met={allBracketed}
              scheduled={showDates ? schedB : undefined}
              completed={showDates ? doneB : undefined}
            />
          </div>
        </div>

        <div className="h-px bg-border-subtle" />

        <div className={density === "comfortable" ? "space-y-4" : "space-y-3"}>
          <Row
            density={density}
            title="Manufacturing complete"
            subtitle={
              milestones.totalWindows > 0
                ? milestones.manufacturedByLegacyInstalledFallback
                  ? "Marked complete based on existing installation records"
                  : `${milestones.manufacturedCount}/${milestones.totalWindows} windows QC approved`
                : "No windows yet"
            }
            met={allManufactured}
            completed={showDates ? doneMf : undefined}
          />
          <Row
            density={density}
            title="Installed"
            subtitle={
              milestones.totalWindows > 0
                ? `${milestones.installedCount}/${milestones.totalWindows} windows with installation photos`
                : undefined
            }
            met={allInstalled}
            scheduled={showDates ? schedI : undefined}
            completed={showDates ? doneI : undefined}
          />
        </div>
      </div>
    </div>
  );
}
