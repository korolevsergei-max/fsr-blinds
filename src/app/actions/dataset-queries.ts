"use server";

import { loadFullDataset, loadSchedulerDataset, loadInstallerDataset, loadUnitDetail, loadSchedulerUnitDetail, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { getUnitMilestoneCoverage, type UnitMilestoneCoverage } from "@/lib/unit-milestones";
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

/**
 * Scoped refetch for the management unit-detail subtree (DATA_SCOPING_PLAN Phase 1).
 * Owner-gated: the management portal is owner-only. Returns `null` on unauthorized so the
 * scoped realtime bridge skips `setData` instead of wiping the view. The scheduler/installer
 * unit routes (a follow-up) would need their own scope check before reusing this.
 */
export async function refreshUnitDetail(unitId: string): Promise<AppDataset | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return null;
  return loadUnitDetail(unitId);
}

/**
 * Scoped refetch for the scheduler unit-detail subtree (Phase 10). Scheduler-gated; returns `null`
 * on unauthorized so the scoped realtime bridge skips `setData`. `loadSchedulerUnitDetail` applies
 * the per-unit scheduler scope guard, so out-of-scope ids resolve to an empty (not-found) dataset.
 */
export async function refreshSchedulerUnitDetail(unitId: string): Promise<AppDataset | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "scheduler") return null;
  return loadSchedulerUnitDetail(unitId);
}

export type UnitSupplementalData = {
  activityLog: UnitActivityLog[];
  mediaItems: UnitStageMediaItem[];
  milestones: UnitMilestoneCoverage;
};


/**
 * Full supplemental data for unit detail pages (activity log + media + milestones).
 */
export async function fetchUnitSupplementalData(
  unitId: string
): Promise<UnitSupplementalData> {
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
