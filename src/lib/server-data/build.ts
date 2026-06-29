import type { AppDataset } from "@/lib/app-dataset";
import type { Installer, Scheduler } from "@/lib/types";
import { mapManufacturingEscalation } from "@/lib/manufacturing-escalations";
import type { ManufacturingEscalationRow } from "./internal-types";
import {
  mapClient,
  mapBuilding,
  mapInstaller,
  mapUnit,
  mapRoom,
  mapWindow,
  mapSchedule,
  mapCutter,
  mapScheduler,
  normalizeScheduleEntries,
  type ClientRow,
  type BuildingRow,
  type InstallerRow,
  type UnitRow,
  type RoomRow,
  type WindowRow,
  type ScheduleRow,
  type CutterRow,
  type SchedulerRow,
} from "@/lib/dataset-mappers";

/**
 * Transforms raw RPC / multi-query results into a typed AppDataset.
 * Shared by both the fast RPC path and the legacy multi-query fallback.
 */
export function buildDatasetFromRaw(raw: {
  clients: ClientRow[];
  buildings: BuildingRow[];
  units: UnitRow[];
  rooms: RoomRow[];
  windows: WindowRow[];
  installers: InstallerRow[];
  schedule_entries: ScheduleRow[];
  cutters: CutterRow[];
  schedulers: SchedulerRow[];
  scheduler_unit_assignments: { unit_id: string; scheduler_id: string; assigned_at: string }[];
  // Phase 11: optional pre-enrichment folded into the owner dataset RPC. When present, callers
  // pass `preEnriched: true` to finalizeDataset so it skips the redundant enrichment round-trips.
  // Absent on the fallback paths (the legacy multi-query / get_full_dataset), which enrich in TS.
  manufacturing_escalations?: ManufacturingEscalationRow[];
  units_with_open_post_install_issue?: string[];
}): AppDataset {
  const schedulersData = raw.schedulers ?? [];
  const schedulerMap = new Map(schedulersData.map((s) => [s.id, s.name]));
  const assignmentMap = new Map(
    (raw.scheduler_unit_assignments ?? []).map((a) => [
      a.unit_id,
      { id: a.scheduler_id, name: schedulerMap.get(a.scheduler_id) || "Unknown", assigned_at: a.assigned_at },
    ])
  );

  // When the RPC folded in the open-PI unit set (Phase 11), stamp every unit's boolean from it
  // (present-but-empty array => all false). When absent (fallback path), leave mapUnit's value
  // for the TS enrichment (withPostInstallIssues) to fill.
  const openPostInstallUnitIds = raw.units_with_open_post_install_issue
    ? new Set(raw.units_with_open_post_install_issue)
    : null;
  const units = (raw.units ?? []).map((r) => {
    const assignment = assignmentMap.get(r.id);
    const unit = mapUnit(
      { ...r, assigned_at: assignment?.assigned_at },
      assignment?.name,
      assignment?.id
    );
    if (openPostInstallUnitIds) {
      unit.hasOpenPostInstallIssue = openPostInstallUnitIds.has(r.id);
    }
    return unit;
  });
  const schedule = normalizeScheduleEntries(units, (raw.schedule_entries ?? []).map(mapSchedule));

  const installers = (raw.installers ?? []).map(mapInstaller);
  const schedulers = schedulersData.map(mapScheduler);
  const combinedInstallers = combineInstallersWithSchedulers(installers, schedulers);

  return {
    clients: (raw.clients ?? []).map(mapClient),
    buildings: (raw.buildings ?? []).map(mapBuilding),
    units,
    rooms: (raw.rooms ?? []).map(mapRoom),
    windows: (raw.windows ?? []).map(mapWindow),
    installers: combinedInstallers,
    schedule,
    cutters: (raw.cutters ?? []).map(mapCutter),
    schedulers,
    manufacturingEscalations: (raw.manufacturing_escalations ?? []).map(mapManufacturingEscalation),
    postInstallIssues: [],
  };
}

/**
 * Builds the assignment pick-list: real installers plus a synthetic `sch-<id>` row per scheduler
 * (so owners can assign a unit to a scheduler acting as an installer). Shared by `buildDatasetFromRaw`
 * and `loadUnitDetail` so the list is byte-identical across the full and scoped loaders.
 */
export function combineInstallersWithSchedulers(
  installers: Installer[],
  schedulers: Scheduler[]
): Installer[] {
  return [
    ...installers,
    ...schedulers.map((sch) => ({
      id: `sch-${sch.id}`,
      name: `SC: ${sch.name}`,
      email: sch.email,
      phone: sch.phone,
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(sch.name)}`,
      authUserId: sch.authUserId,
    })),
  ];
}

export function emptyDataset(): AppDataset {
  return {
    clients: [],
    buildings: [],
    units: [],
    rooms: [],
    windows: [],
    installers: [],
    schedule: [],
    cutters: [],
    schedulers: [],
    manufacturingEscalations: [],
    postInstallIssues: [],
  };
}
