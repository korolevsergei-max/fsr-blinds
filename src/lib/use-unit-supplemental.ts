"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchUnitMediaAndMilestones,
  fetchUnitMilestones,
  fetchUnitSupplementalData,
  type UnitSupplementalData,
} from "@/app/actions/dataset-queries";
import { getUnitCoverageFromDataset } from "@/lib/unit-status-helpers";
import { EMPTY_MILESTONES, type UnitMilestoneCoverage } from "@/lib/unit-milestone-types";
import { useAppDatasetMaybe } from "@/lib/dataset-context";
import type { UnitStageMediaItem } from "@/lib/server-data";
import type { AppDataset } from "@/lib/app-dataset";

const supplementalCache = new Map<string, UnitSupplementalData>();
const mediaAndMilestonesCache = new Map<
  string,
  { mediaItems: UnitStageMediaItem[]; milestones: UnitMilestoneCoverage }
>();
const milestonesCache = new Map<string, UnitMilestoneCoverage>();

function upsertMediaItem(
  items: UnitStageMediaItem[],
  nextItem: UnitStageMediaItem
) {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index >= 0) {
    const next = [...items];
    next[index] = nextItem;
    return next;
  }
  return [nextItem, ...items];
}

function deriveClientMilestones(
  data: AppDataset | undefined,
  unitId: string
): UnitMilestoneCoverage {
  if (!data || !unitId) return EMPTY_MILESTONES;

  const unit = data.units.find((item) => item.id === unitId);
  if (!unit) return EMPTY_MILESTONES;

  const coverage = getUnitCoverageFromDataset(data, unitId);
  const manufacturedComplete =
    coverage.totalWindows > 0 &&
    (unit.status === "manufactured" || unit.status === "installed");

  return {
    ...coverage,
    manufacturedCount: manufacturedComplete ? coverage.totalWindows : 0,
    allManufactured: manufacturedComplete,
    manufacturedByLegacyInstalledFallback: false,
    measuredCompletedAt: null,
    bracketedCompletedAt: null,
    manufacturedCompletedAt: null,
    installedCompletedAt: null,
  };
}

export function useUnitMilestones(unitId: string) {
  const datasetCtx = useAppDatasetMaybe();
  const initialMilestones = useMemo(
    () => deriveClientMilestones(datasetCtx?.data, unitId),
    [datasetCtx?.data, unitId]
  );
  const [serverMilestones, setServerMilestones] =
    useState<UnitMilestoneCoverage | null>(() => milestonesCache.get(unitId) ?? null);

  useEffect(() => {
    if (!unitId) return;

    let active = true;
    const cached = milestonesCache.get(unitId);
    if (cached) {
      setServerMilestones(cached);
    }

    void fetchUnitMilestones(unitId)
      .then((next) => {
        milestonesCache.set(unitId, next);
        if (active) setServerMilestones(next);
      })
      .catch(() => {
        /* best-effort refresh */
      });

    return () => {
      active = false;
    };
  }, [unitId]);

  return serverMilestones ?? initialMilestones;
}

export function useUnitMediaAndMilestones(unitId: string) {
  const datasetCtx = useAppDatasetMaybe();
  const milestones = useMemo(
    () => deriveClientMilestones(datasetCtx?.data, unitId),
    [datasetCtx?.data, unitId]
  );
  const [serverData, setServerData] = useState<{
    mediaItems: UnitStageMediaItem[];
    milestones: UnitMilestoneCoverage;
  } | null>(() => mediaAndMilestonesCache.get(unitId) ?? null);

  useEffect(() => {
    if (!unitId) return;

    let active = true;
    const cached = mediaAndMilestonesCache.get(unitId);
    if (cached) {
      setServerData(cached);
    }

    void fetchUnitMediaAndMilestones(unitId)
      .then((next) => {
        mediaAndMilestonesCache.set(unitId, next);
        milestonesCache.set(unitId, next.milestones);
        if (active) setServerData(next);
      })
      .catch(() => {
        /* best-effort refresh */
      });

    return () => {
      active = false;
    };
  }, [unitId]);

  return {
    mediaItems: serverData?.mediaItems ?? [],
    milestones: serverData?.milestones ?? milestones,
  };
}

export function useUnitSupplementalData(unitId: string) {
  const datasetCtx = useAppDatasetMaybe();
  const milestones = useMemo(
    () => deriveClientMilestones(datasetCtx?.data, unitId),
    [datasetCtx?.data, unitId]
  );
  const [serverData, setServerData] = useState<UnitSupplementalData | null>(
    () => supplementalCache.get(unitId) ?? null
  );

  useEffect(() => {
    if (!unitId) return;

    let active = true;
    const cached = supplementalCache.get(unitId);
    if (cached) {
      setServerData(cached);
    }

    void fetchUnitSupplementalData(unitId)
      .then((next) => {
        supplementalCache.set(unitId, next);
        milestonesCache.set(unitId, next.milestones);
        if (active) setServerData(next);
      })
      .catch(() => {
        /* best-effort refresh */
      });

    return () => {
      active = false;
    };
  }, [unitId]);

  return {
    activityLog: serverData?.activityLog ?? [],
    mediaItems: serverData?.mediaItems ?? [],
    milestones: serverData?.milestones ?? milestones,
  };
}

export function upsertUnitStageMediaItem(
  unitId: string,
  item: UnitStageMediaItem
) {
  const mediaEntry = mediaAndMilestonesCache.get(unitId);
  if (mediaEntry) {
    mediaAndMilestonesCache.set(unitId, {
      ...mediaEntry,
      mediaItems: upsertMediaItem(mediaEntry.mediaItems, item),
    });
  }

  const supplementalEntry = supplementalCache.get(unitId);
  if (supplementalEntry) {
    supplementalCache.set(unitId, {
      ...supplementalEntry,
      mediaItems: upsertMediaItem(supplementalEntry.mediaItems, item),
    });
  }
}

export function removeUnitStageMediaItem(unitId: string, mediaId: string) {
  const mediaEntry = mediaAndMilestonesCache.get(unitId);
  if (mediaEntry) {
    mediaAndMilestonesCache.set(unitId, {
      ...mediaEntry,
      mediaItems: mediaEntry.mediaItems.filter((item) => item.id !== mediaId),
    });
  }

  const supplementalEntry = supplementalCache.get(unitId);
  if (supplementalEntry) {
    supplementalCache.set(unitId, {
      ...supplementalEntry,
      mediaItems: supplementalEntry.mediaItems.filter((item) => item.id !== mediaId),
    });
  }
}
