import { cache } from "react";
import { loadUnitActivityLog, loadUnitStageMedia, type UnitStageMediaItem } from "@/lib/server-data";
import { getUnitMilestoneCoverage, type UnitMilestoneCoverage } from "@/lib/unit-milestones";
import type { UnitActivityLog } from "@/lib/types";

export type UnitSupplementalRouteData = {
  activityLog: UnitActivityLog[];
  mediaItems: UnitStageMediaItem[];
  milestones: UnitMilestoneCoverage;
};

export const loadCachedUnitSupplementalData = cache(
  async (unitId: string): Promise<UnitSupplementalRouteData> => {
    const [activityLog, mediaItems, milestones] = await Promise.all([
      loadUnitActivityLog(unitId),
      loadUnitStageMedia(unitId),
      getUnitMilestoneCoverage(unitId),
    ]);
    return { activityLog, mediaItems, milestones };
  }
);

export const loadCachedUnitMedia = cache(
  async (unitId: string): Promise<UnitStageMediaItem[]> => loadUnitStageMedia(unitId)
);

export const loadCachedUnitMilestones = cache(
  async (unitId: string): Promise<UnitMilestoneCoverage> =>
    getUnitMilestoneCoverage(unitId)
);

export const loadCachedUnitMediaAndMilestones = cache(
  async (
    unitId: string
  ): Promise<{ mediaItems: UnitStageMediaItem[]; milestones: UnitMilestoneCoverage }> => {
    const [mediaItems, milestones] = await Promise.all([
      loadUnitStageMedia(unitId),
      getUnitMilestoneCoverage(unitId),
    ]);
    return { mediaItems, milestones };
  }
);
