import type { DashboardIssue } from "@/lib/dashboard-issues";
import type { CurrentStage } from "@/lib/types";

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
