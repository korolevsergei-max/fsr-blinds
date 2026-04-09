"use server";

import { loadFullDataset, loadSchedulerDataset, loadInstallerDataset, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { getUnitMilestoneCoverage, type UnitMilestoneCoverage } from "@/lib/unit-milestones";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import { createClient } from "@/lib/supabase/server";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitActivityLog } from "@/lib/types";

/**
 * Server action for client-side full dataset refresh.
 * Called when the tab returns to foreground or after bulk mutations.
 */
export async function refreshDataset(
  kind: "full" | "scheduler" | "installer" = "full"
): Promise<AppDataset> {
  if (kind === "scheduler") {
    return loadSchedulerDataset();
  }
  if (kind === "installer") {
    const user = await getCurrentUser();
    const installerId = user ? await getLinkedInstallerId(user.id) : null;
    return loadInstallerDataset(installerId ?? "");
  }
  return loadFullDataset();
}

export type UnitSupplementalData = {
  activityLog: UnitActivityLog[];
  mediaItems: UnitStageMediaItem[];
  milestones: UnitMilestoneCoverage;
};


/**
 * Full supplemental data for unit detail pages (activity log + media + milestones).
 * Also self-heals stale unit status.
 */
export async function fetchUnitSupplementalData(
  unitId: string
): Promise<UnitSupplementalData> {
  const supabase = await createClient();
  await recomputeUnitStatus(supabase, unitId);

  const [activityLog, mediaItems, milestones] = await Promise.all([
    loadUnitActivityLog(unitId),
    loadUnitStageMedia(unitId),
    getUnitMilestoneCoverage(unitId),
  ]);

  return { activityLog, mediaItems, milestones };
}

/** Media + milestones only (status/room pages, no activity log needed). */
export async function fetchUnitMediaAndMilestones(
  unitId: string
): Promise<{ mediaItems: UnitStageMediaItem[]; milestones: UnitMilestoneCoverage }> {
  const [mediaItems, milestones] = await Promise.all([
    loadUnitStageMedia(unitId),
    getUnitMilestoneCoverage(unitId),
  ]);
  return { mediaItems, milestones };
}

/** Media only (room detail pages). */
export async function fetchUnitMedia(
  unitId: string
): Promise<UnitStageMediaItem[]> {
  return loadUnitStageMedia(unitId);
}

/** Milestones only (installer/scheduler status pages). */
export async function fetchUnitMilestones(
  unitId: string
): Promise<UnitMilestoneCoverage> {
  return getUnitMilestoneCoverage(unitId);
}
