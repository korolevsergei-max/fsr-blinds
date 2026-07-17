"use server";

import { loadFullDataset, loadSchedulerDataset, loadInstallerDataset, loadUnitDetail, loadSchedulerUnitDetail, loadUnitActivityLog, loadUnitStageMedia } from "@/lib/server-data";
import { getCurrentUser, getLinkedInstallerId } from "@/lib/auth";
import { consumeRateLimit, type RateLimitRule } from "@/lib/rate-limit";
import type { UnitStageMediaItem } from "@/lib/server-data";
import { getUnitMilestoneCoverage, type UnitMilestoneCoverage } from "@/lib/unit-milestones";
import type { AppDataset } from "@/lib/app-dataset";
import type { UnitActivityLog } from "@/lib/types";

// Tuned against the client cadence (Phase 7 / M4): the realtime bridge debounces refreshes at
// 120ms but only refetches on low-frequency triggers (reconnect backfill, assignment/issue
// changes), the foreground-refresh path is already throttled to one per 3s client-side, and
// mount/eager refresh is one-shot. Burst 10 absorbs mount + reconnect + a flurry of events;
// one token per 3s sustained matches the client's own foreground throttle. A hammering loop
// exhausts the burst within seconds and gets `null` (callers keep their current data).
const DATASET_REFRESH_LIMIT: RateLimitRule = { capacity: 10, refillPerSecond: 1 / 3 };

// The scoped unit-detail refetch subscribes to `windows` unfiltered (the table has no unit_id),
// so a busy facility legitimately triggers refetches at a higher rate than the global dataset
// path — keep this generous; it only needs to stop tight loops, and the refetch is one unit.
const UNIT_DETAIL_REFRESH_LIMIT: RateLimitRule = { capacity: 30, refillPerSecond: 1 };

const DATASET_ROLE_FOR_KIND = {
  full: "owner",
  scheduler: "scheduler",
  installer: "installer",
} as const;

/**
 * Server action for client-side full dataset refresh.
 * Called when the tab returns to foreground or after bulk mutations.
 *
 * Role-gated to the portal that owns each dataset kind (composes with the Phase 2 RPC caller
 * checks) and per-user rate limited. Returns `null` on unauthorized or throttled so the
 * realtime bridge skips `setData` and keeps the current store instead of wiping it.
 */
export async function refreshDataset(
  kind: "full" | "scheduler" | "installer" = "full"
): Promise<AppDataset | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== DATASET_ROLE_FOR_KIND[kind]) return null;
  if (!consumeRateLimit(`refresh-dataset:${user.id}`, DATASET_REFRESH_LIMIT)) return null;

  if (kind === "scheduler") {
    return loadSchedulerDataset();
  }
  if (kind === "installer") {
    const installerId = await getLinkedInstallerId(user.id);
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
  if (!consumeRateLimit(`refresh-unit-detail:${user.id}`, UNIT_DETAIL_REFRESH_LIMIT)) return null;
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
  if (!consumeRateLimit(`refresh-unit-detail:${user.id}`, UNIT_DETAIL_REFRESH_LIMIT)) return null;
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
