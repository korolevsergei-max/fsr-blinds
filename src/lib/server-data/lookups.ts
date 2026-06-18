import { createClient } from "@/lib/supabase/server";
import type { AppDataset } from "@/lib/app-dataset";
import {
  mapBuilding,
  mapClient,
  mapInstaller,
  mapRoom,
  mapScheduler,
  mapUnit,
  mapWindow,
  type BuildingRow,
  type ClientRow,
  type InstallerRow,
  type RoomRow,
  type SchedulerRow,
  type UnitRow,
  type WindowRow,
} from "@/lib/dataset-mappers";
import { combineInstallersWithSchedulers, emptyDataset } from "./build";
import { finalizeDataset } from "./enrichment";

/** unit_id → scheduler_id for rows in `scheduler_unit_assignments` (at most one per unit). */
export async function loadUnitSchedulerAssignmentMap(): Promise<Record<string, string>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduler_unit_assignments")
    .select("unit_id, scheduler_id");
  if (error) return {};
  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[(row as { unit_id: string }).unit_id] = (row as { scheduler_id: string }).scheduler_id;
  }
  return map;
}

/** Loads a map of schedulerId → allowed buildingIds (for the owner Accounts UI). */
export async function loadAllSchedulerBuildingAccess(): Promise<Record<string, string[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("scheduler_building_access")
    .select("scheduler_id, building_id");
  if (error) return {};

  const map: Record<string, string[]> = {};
  for (const row of data ?? []) {
    if (!map[row.scheduler_id]) map[row.scheduler_id] = [];
    map[row.scheduler_id].push(row.building_id);
  }
  return map;
}

/**
 * Scoped loader for the management unit-detail subtree (DATA_SCOPING_PLAN Phase 1).
 * Fetches a single unit's rooms/windows plus the small reference lists the detail/edit/assign
 * screens read from context — so a nested `AppDatasetProvider` can shadow the global one with
 * ~1 unit instead of the whole DB. Mirrors `loadFullDataset`'s unit denormalization and
 * installer pick-list so the scoped dataset is parity-identical for the in-scope unit.
 */
export async function loadUnitDetail(unitId: string): Promise<AppDataset> {
  const supabase = await createClient();

  // First round: everything that depends only on unitId. The full installers/schedulers lists
  // feed the assign pick-list (any installer/scheduler can be assigned), and the scheduler row
  // also resolves the assigned scheduler's name without an extra query.
  const [unitRes, roomsRes, assignmentRes, installersRes, schedulersRes] = await Promise.all([
    supabase.from("units").select("*").eq("id", unitId).single(),
    supabase.from("rooms").select("*").eq("unit_id", unitId).order("name"),
    supabase
      .from("scheduler_unit_assignments")
      .select("scheduler_id, assigned_at")
      .eq("unit_id", unitId)
      .maybeSingle(),
    supabase.from("installers").select("*").order("name"),
    supabase.from("schedulers").select("*").order("name"),
  ]);

  if (unitRes.error || !unitRes.data) return emptyDataset();

  const rooms = ((roomsRes.data as RoomRow[]) ?? []).map(mapRoom);
  const roomIds = rooms.map((r) => r.id);
  const unitRow = unitRes.data as UnitRow;

  // Second round: windows (depend on roomIds) plus this unit's building/client rows
  // (depend on the fetched unit). Keeps the scoped dataset full-shaped.
  const [windowsRes, buildingRes, clientRes] = await Promise.all([
    roomIds.length > 0
      ? supabase.from("windows").select("*").in("room_id", roomIds).order("label")
      : Promise.resolve({ data: [] as WindowRow[] }),
    supabase.from("buildings").select("*").eq("id", unitRow.building_id).maybeSingle(),
    supabase.from("clients").select("*").eq("id", unitRow.client_id).maybeSingle(),
  ]);

  const installers = ((installersRes.data as InstallerRow[]) ?? []).map(mapInstaller);
  const schedulers = ((schedulersRes.data as SchedulerRow[]) ?? []).map(mapScheduler);

  const assignment = assignmentRes.data as { scheduler_id: string; assigned_at: string } | null;
  const schedulerId = assignment?.scheduler_id ?? null;
  const schedulerName = schedulerId
    ? schedulers.find((s) => s.id === schedulerId)?.name ?? null
    : null;

  const unit = mapUnit(
    { ...unitRow, assigned_at: assignment?.assigned_at },
    schedulerName,
    schedulerId
  );

  const building = buildingRes.data ? mapBuilding(buildingRes.data as BuildingRow) : null;
  const client = clientRes.data ? mapClient(clientRes.data as ClientRow) : null;

  return finalizeDataset({
    ...emptyDataset(),
    clients: client ? [client] : [],
    buildings: building ? [building] : [],
    units: [unit],
    rooms,
    windows: ((windowsRes.data as WindowRow[]) ?? []).map(mapWindow),
    installers: combineInstallersWithSchedulers(installers, schedulers),
    schedulers,
  });
}
