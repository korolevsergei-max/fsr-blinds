import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getUnitIdsWithWindowEscalations } from "@/lib/app-dataset";
import { getUnitCurrentStage } from "@/lib/current-stage";
import { computeIssueCounts } from "@/lib/dashboard-issues";
import {
  EMPTY_OWNER_DASHBOARD_COUNTS,
  type OwnerDashboardCounts,
} from "@/lib/owner-dashboard-counts";
import { loadFullDataset } from "./datasets";

type OwnerDashboardCountsRpc = {
  total_units?: number;
  stage_counts?: Record<string, number | string | null>;
  issue_counts?: Record<string, number | string | null>;
};

function readCount(
  record: Record<string, number | string | null> | undefined,
  key: string
): number {
  const value = record?.[key];
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number.parseInt(value, 10) || 0;
  return 0;
}

function normalizeOwnerDashboardCounts(
  raw: OwnerDashboardCountsRpc | null
): OwnerDashboardCounts {
  if (!raw) return EMPTY_OWNER_DASHBOARD_COUNTS;

  return {
    totalUnits: raw.total_units ?? 0,
    stageCounts: {
      not_started: readCount(raw.stage_counts, "not_started"),
      measurement: readCount(raw.stage_counts, "measurement"),
      bracketing: readCount(raw.stage_counts, "bracketing"),
      cutting: readCount(raw.stage_counts, "cutting"),
      assembling: readCount(raw.stage_counts, "assembling"),
      qc: readCount(raw.stage_counts, "qc"),
      installation: readCount(raw.stage_counts, "installation"),
      post_install_issue: readCount(raw.stage_counts, "post_install_issue"),
    },
    issueCounts: {
      past_scheduled: readCount(raw.issue_counts, "past_scheduled"),
      escalations: readCount(raw.issue_counts, "escalations"),
      missing: readCount(raw.issue_counts, "missing"),
      at_risk: readCount(raw.issue_counts, "at_risk"),
    },
  };
}

async function computeDashboardCountsFallback(): Promise<OwnerDashboardCounts> {
  const data = await loadFullDataset();
  const today = new Date().toISOString().split("T")[0]!;
  const escalationIds = getUnitIdsWithWindowEscalations(data);
  const stageCounts = { ...EMPTY_OWNER_DASHBOARD_COUNTS.stageCounts };

  for (const unit of data.units) {
    const stage = getUnitCurrentStage(unit);
    stageCounts[stage] = (stageCounts[stage] ?? 0) + 1;
  }

  const issueCountMap = computeIssueCounts(data.units, today, escalationIds);
  const issueCounts = { ...EMPTY_OWNER_DASHBOARD_COUNTS.issueCounts };
  for (const [issue, count] of issueCountMap) {
    issueCounts[issue] = count;
  }

  return {
    totalUnits: data.units.length,
    stageCounts,
    issueCounts,
  };
}

export const loadOwnerDashboardCounts = cache(async (): Promise<OwnerDashboardCounts> => {
  const supabase = await createClient();
  const today = new Date().toISOString().split("T")[0]!;
  const { data, error } = await supabase.rpc("get_owner_dashboard_counts", {
    p_today: today,
  });

  if (!error && data) {
    return normalizeOwnerDashboardCounts(data as OwnerDashboardCountsRpc);
  }

  return computeDashboardCountsFallback();
});
