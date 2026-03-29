import type { Unit } from "./types";
import { computeUnitFlags } from "./unit-flags";

export type DashboardIssue =
  | "past_scheduled"
  | "escalations"
  | "missing"
  | "at_risk";

export const ISSUE_ORDER: DashboardIssue[] = [
  "past_scheduled",
  "escalations",
  "missing",
  "at_risk",
];

export const DASHBOARD_ISSUE_LABELS: Record<DashboardIssue, string> = {
  past_scheduled: "Past scheduled date",
  escalations: "Escalations",
  missing: "Missing dates / unassigned",
  at_risk: "Installation soon",
};

export const DASHBOARD_ISSUE_CLASSES: Record<
  DashboardIssue,
  { badge: string; text: string }
> = {
  past_scheduled: { badge: "bg-red-100 text-red-700", text: "text-red-600" },
  escalations: { badge: "bg-orange-100 text-orange-700", text: "text-orange-600" },
  missing: { badge: "bg-zinc-100 text-zinc-600", text: "text-zinc-500" },
  at_risk: { badge: "bg-amber-100 text-amber-700", text: "text-amber-600" },
};

export function getUnitIssues(
  unit: Unit,
  today: string,
  escalationIds: Set<string>
): DashboardIssue[] {
  const flags = computeUnitFlags(unit, today);
  const issues: DashboardIssue[] = [];

  if (flags.includes("past_bracketing_due") || flags.includes("past_install_due")) {
    issues.push("past_scheduled");
  }
  if (escalationIds.has(unit.id)) {
    issues.push("escalations");
  }
  if (
    flags.includes("missing_bracketing_date") ||
    flags.includes("missing_installation_date") ||
    flags.includes("missing_installer")
  ) {
    issues.push("missing");
  }
  if (flags.includes("at_risk")) {
    issues.push("at_risk");
  }

  return issues;
}

export function computeIssueCounts(
  units: Unit[],
  today: string,
  escalationIds: Set<string>
): Map<DashboardIssue, number> {
  const counts = new Map<DashboardIssue, number>();
  for (const unit of units) {
    for (const issue of getUnitIssues(unit, today, escalationIds)) {
      counts.set(issue, (counts.get(issue) ?? 0) + 1);
    }
  }
  return counts;
}
