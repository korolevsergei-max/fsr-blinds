import { computeIssueCounts, type DashboardIssue } from "./dashboard-issues.ts";
import { getUnitCurrentStage } from "./current-stage.ts";
import type { CurrentStage, Unit } from "./types";

export type OwnerDashboardCounts = {
  totalUnits: number;
  stageCounts: Record<CurrentStage, number>;
  issueCounts: Record<DashboardIssue, number>;
};

export const EMPTY_OWNER_DASHBOARD_COUNTS: OwnerDashboardCounts = {
  totalUnits: 0,
  stageCounts: {
    not_started: 0,
    measurement: 0,
    bracketing: 0,
    cutting: 0,
    assembling: 0,
    qc: 0,
    installation: 0,
    post_install_issue: 0,
  },
  issueCounts: {
    past_scheduled: 0,
    escalations: 0,
    missing: 0,
    at_risk: 0,
  },
};

/**
 * Canonical owner dashboard bucketing. This is the single source of truth the SQL
 * `get_owner_dashboard_counts` RPC must mirror (stage precedence: an open post-install
 * issue beats the status-derived stage). Used by the loader's fallback and the parity
 * test in owner-dashboard-counts.test.mts.
 */
export function computeOwnerDashboardCounts(
  units: Unit[],
  today: string,
  escalationIds: Set<string>
): OwnerDashboardCounts {
  const stageCounts: Record<CurrentStage, number> = {
    ...EMPTY_OWNER_DASHBOARD_COUNTS.stageCounts,
  };
  for (const unit of units) {
    const stage = getUnitCurrentStage(unit);
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
  }

  const issueCounts: Record<DashboardIssue, number> = {
    ...EMPTY_OWNER_DASHBOARD_COUNTS.issueCounts,
  };
  for (const [issue, count] of computeIssueCounts(units, today, escalationIds)) {
    issueCounts[issue] = count;
  }

  return { totalUnits: units.length, stageCounts, issueCounts };
}
