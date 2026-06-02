import { createClient } from "@/lib/supabase/server";
import type { AppDataset } from "@/lib/app-dataset";
import {
  mapRoom,
  mapUnit,
  mapWindow,
  type RoomRow,
  type UnitRow,
  type WindowRow,
} from "@/lib/dataset-mappers";
import { emptyDataset } from "./build";
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
 * Lightweight loader for unit detail pages.
 * Fetches only the single unit, its rooms, and its windows.
 * ~10x faster than loadFullDataset for detail pages.
 * Returns an AppDataset with only units/rooms/windows populated.
 */
export async function loadUnitDetail(unitId: string): Promise<AppDataset> {
  const supabase = await createClient();

  const [unitRes, roomsRes] = await Promise.all([
    supabase.from("units").select("*").eq("id", unitId).single(),
    supabase.from("rooms").select("*").eq("unit_id", unitId).order("name"),
  ]);

  if (unitRes.error || !unitRes.data) return emptyDataset();

  const rooms = ((roomsRes.data as RoomRow[]) ?? []).map(mapRoom);
  const roomIds = rooms.map((r) => r.id);

  const windowsRes =
    roomIds.length > 0
      ? await supabase.from("windows").select("*").in("room_id", roomIds).order("label")
      : { data: [] };

  const unitRow = unitRes.data as UnitRow;
  const unit = mapUnit(unitRow);

  return finalizeDataset({
    ...emptyDataset(),
    units: [unit],
    rooms,
    windows: ((windowsRes.data as WindowRow[]) ?? []).map(mapWindow),
  });
}
