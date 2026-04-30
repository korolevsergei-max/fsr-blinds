"use client";

import Link from "next/link";
import { CheckCircle, Circle, GitBranch, WarningCircle } from "@phosphor-icons/react";
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

type OpenPostInstallIssueTargetLink = {
  issueId: string;
  roomName: string;
  windowLabel: string;
  href: string;
};

function Row({
  title,
  subtitle,
  met,
  scheduled,
  completed,
  density,
  variant = "default",
}: {
  title: string;
  subtitle?: string;
  met: boolean;
  scheduled?: string | null;
  completed?: string | null;
  density: Density;
  variant?: "default" | "warning";
}) {
  const iconSize = density === "comfortable" ? 22 : 18;
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 pt-0.5">
        {variant === "warning" ? (
          <WarningCircle
            size={iconSize}
            weight="fill"
            className="text-red-500"
          />
        ) : met ? (
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
            variant === "warning"
              ? `text-sm font-semibold text-red-600`
              : density === "comfortable"
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
  openPostInstallIssueTargets = [],
  className = "",
}: {
  unit: Unit;
  milestones: UnitMilestoneCoverage;
  layout: "detail" | "simple";
  density?: Density;
  title?: string;
  mediaViewerSlot?: React.ReactNode;
  openPostInstallIssueTargets?: OpenPostInstallIssueTargetLink[];
  className?: string;
}) {
  const {
    allMeasured,
    allBracketed,
    allCut,
    allAssembled,
    allQcApproved,
    allInstalled,
    hasOpenPostInstallIssue,
    totalWindows,
    measuredCount,
    bracketedCount,
    cutCount,
    assembledCount,
    qcApprovedCount,
    installedCount,
    postInstallIssueOpenCount,
  } = milestones;

  const schedM = formatWhen(unit.measurementDate);
  const schedB = formatWhen(unit.bracketingDate);
  const schedI = formatWhen(unit.installationDate);
  const doneM = formatWhen(milestones.measuredCompletedAt);
  const doneB = formatWhen(milestones.bracketedCompletedAt);
  const doneCut = formatWhen(milestones.cutCompletedAt);
  const doneAsm = formatWhen(milestones.assembledCompletedAt);
  const doneQc = formatWhen(milestones.qcApprovedCompletedAt);
  const doneI = formatWhen(milestones.installedCompletedAt);

  const showDates = layout === "detail";
  const hasWindows = totalWindows > 0;
  const fmtCount = (n: number) =>
    hasWindows ? `${n}/${totalWindows} windows` : "No windows yet";
  const postInstallFallbackSubtitle =
    postInstallIssueOpenCount > 0
      ? `${postInstallIssueOpenCount} open issue${postInstallIssueOpenCount === 1 ? "" : "s"}`
      : "Open issue flagged";

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
            Measurement and bracketing run in parallel — either can complete first.
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
            Prerequisites (parallel — either order)
          </p>
          <div className={density === "comfortable" ? "space-y-4" : "space-y-3"}>
            <Row
              density={density}
              title="Measured"
              subtitle={hasWindows ? `${measuredCount}/${totalWindows} windows measured` : "No windows yet"}
              met={allMeasured}
              scheduled={showDates ? schedM : undefined}
              completed={showDates ? doneM : undefined}
            />
            <Row
              density={density}
              title="Bracketed"
              subtitle={hasWindows ? `${bracketedCount}/${totalWindows} windows bracketed` : "No windows yet"}
              met={allBracketed}
              scheduled={showDates ? schedB : undefined}
              completed={showDates ? doneB : undefined}
            />
          </div>
        </div>

        <div className="h-px bg-border-subtle" />

        <div>
          <p className="text-[9px] font-bold uppercase tracking-wider text-muted mb-2">
            Production (sequential per window)
          </p>
          <div className={density === "comfortable" ? "space-y-4" : "space-y-3"}>
            <Row
              density={density}
              title="Cut"
              subtitle={fmtCount(cutCount)}
              met={allCut}
              completed={showDates ? doneCut : undefined}
            />
            <Row
              density={density}
              title="Assembled"
              subtitle={fmtCount(assembledCount)}
              met={allAssembled}
              completed={showDates ? doneAsm : undefined}
            />
            <Row
              density={density}
              title="Quality Checked"
              subtitle={
                hasWindows
                  ? milestones.manufacturedByLegacyInstalledFallback
                    ? "Marked complete based on existing installation records"
                    : `${qcApprovedCount}/${totalWindows} windows QC approved`
                  : "No windows yet"
              }
              met={allQcApproved || milestones.allManufactured}
              completed={showDates ? doneQc : undefined}
            />
          </div>
        </div>

        <div className="h-px bg-border-subtle" />

        <div className={density === "comfortable" ? "space-y-4" : "space-y-3"}>
          <Row
            density={density}
            title="Installed"
            subtitle={hasWindows ? `${installedCount}/${totalWindows} windows installed` : undefined}
            met={allInstalled}
            scheduled={showDates ? schedI : undefined}
            completed={showDates ? doneI : undefined}
          />
          {hasOpenPostInstallIssue && (
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 pt-0.5">
                <WarningCircle
                  size={density === "comfortable" ? 22 : 18}
                  weight="fill"
                  className="text-red-500"
                />
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p
                  className={
                    density === "comfortable"
                      ? "text-sm font-semibold text-red-600"
                      : "text-[12px] font-semibold text-red-600"
                  }
                >
                  Post-Install Issue
                </p>
                {openPostInstallIssueTargets.length > 0 ? (
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {openPostInstallIssueTargets.map((target) => (
                      <Link
                        key={target.issueId}
                        href={target.href}
                        className="inline-flex w-fit max-w-full items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700 transition-colors hover:bg-red-100 active:scale-[0.98]"
                      >
                        <span className="truncate">
                          {target.roomName} - {target.windowLabel}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-tertiary mt-0.5 leading-snug">
                    {postInstallFallbackSubtitle}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
