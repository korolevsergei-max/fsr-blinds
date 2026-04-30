import { createClient } from "./supabase/server";
import { getCurrentUser, getLinkedInstallerId, getLinkedSchedulerId } from "./auth";
import { getSchedulerScopedUnitIds } from "./scheduler-scope";
import type { ProductionStatus } from "./types";
import {
  buildManufacturingProcessRows,
  scopeManufacturingProcessUnits,
  type ManufacturingProcessRow,
  type ManufacturingProcessScope,
  type ManufacturingProcessUnitInput,
} from "./manufacturing-process-core";
import { selectInChunks } from "./supabase-chunking";

type UnitRow = {
  id: string;
  client_id: string;
  client_name: string;
  building_id: string;
  building_name: string;
  unit_number: string;
  complete_by_date: string | null;
  window_count: number | null;
  assigned_installer_id: string | null;
};

type RoomRow = {
  id: string;
  unit_id: string;
};

type InstalledWindowRow = {
  room_id: string;
};

type ProductionRow = {
  unit_id: string;
  status: ProductionStatus;
};

function mapUnits(rows: UnitRow[]): ManufacturingProcessUnitInput[] {
  return rows
    .filter((row) => (row.window_count ?? 0) > 0)
    .map((row) => ({
      id: row.id,
      clientId: row.client_id,
      clientName: row.client_name,
      buildingId: row.building_id,
      buildingName: row.building_name,
      unitNumber: row.unit_number,
      completeByDate: row.complete_by_date,
      totalBlinds: row.window_count ?? 0,
      assignedInstallerId: row.assigned_installer_id,
    }));
}

async function loadManufacturingProcessRowsForUnits(
  units: ManufacturingProcessUnitInput[],
  scope: ManufacturingProcessScope
): Promise<ManufacturingProcessRow[]> {
  const scopedUnits = scopeManufacturingProcessUnits(units, scope);
  if (scopedUnits.length === 0) return [];

  const unitIds = scopedUnits.map((unit) => unit.id);
  const supabase = await createClient();

  const [roomRows, productionRows] = await Promise.all([
    selectInChunks<RoomRow>(unitIds, (chunk) =>
      supabase
        .from("rooms")
        .select("id, unit_id")
        .in("unit_id", chunk)
        .then((res) => ({ data: res.data as RoomRow[] | null, error: res.error })),
    ),
    selectInChunks<ProductionRow>(unitIds, (chunk) =>
      supabase
        .from("window_production_status")
        .select("unit_id, status")
        .in("unit_id", chunk)
        .then((res) => ({ data: res.data as ProductionRow[] | null, error: res.error })),
    ),
  ]);

  const roomToUnitId = new Map<string, string>(
    roomRows.map((room) => [room.id, room.unit_id])
  );
  const roomIds = [...roomToUnitId.keys()];

  const installedWindowRows = await selectInChunks<InstalledWindowRow>(roomIds, (chunk) =>
    supabase
      .from("windows")
      .select("room_id")
      .in("room_id", chunk)
      .eq("installed", true)
      .then((res) => ({ data: res.data as InstalledWindowRow[] | null, error: res.error })),
  );

  const installedWindowUnitIds = installedWindowRows
    .map((row) => roomToUnitId.get(row.room_id) ?? null)
    .filter((unitId): unitId is string => Boolean(unitId));

  return buildManufacturingProcessRows(
    scopedUnits,
    productionRows.map((row) => ({
      unitId: row.unit_id,
      status: row.status,
    })),
    installedWindowUnitIds
  );
}

async function loadUnitsForManufacturingProcess(scope: ManufacturingProcessScope) {
  const supabase = await createClient();
  let unitRows: UnitRow[] = [];

  if (scope.role === "owner") {
    const { data } = await supabase
      .from("units")
      .select(
        "id, client_id, client_name, building_id, building_name, unit_number, complete_by_date, window_count, assigned_installer_id"
      )
      .gt("window_count", 0);
    unitRows = (data ?? []) as UnitRow[];
  } else if (scope.role === "scheduler") {
    if (scope.scopedUnitIds.length === 0) return [];
    const { data } = await supabase
      .from("units")
      .select(
        "id, client_id, client_name, building_id, building_name, unit_number, complete_by_date, window_count, assigned_installer_id"
      )
      .in("id", scope.scopedUnitIds)
      .gt("window_count", 0);
    unitRows = (data ?? []) as UnitRow[];
  } else {
    const { data } = await supabase
      .from("units")
      .select(
        "id, client_id, client_name, building_id, building_name, unit_number, complete_by_date, window_count, assigned_installer_id"
      )
      .eq("assigned_installer_id", scope.installerId)
      .gt("window_count", 0);
    unitRows = (data ?? []) as UnitRow[];
  }

  return mapUnits(unitRows);
}

async function loadAllManufacturingProcessRows(): Promise<ManufacturingProcessRow[]> {
  const scope: ManufacturingProcessScope = { role: "owner" };
  const units = await loadUnitsForManufacturingProcess(scope);
  return loadManufacturingProcessRowsForUnits(units, scope);
}

export async function loadOwnerManufacturingProcessRows(): Promise<ManufacturingProcessRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "owner") return [];

  return loadAllManufacturingProcessRows();
}

export async function loadSchedulerManufacturingProcessRows(): Promise<ManufacturingProcessRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "scheduler") return [];

  const schedulerId = await getLinkedSchedulerId(user.id);
  if (!schedulerId) return [];

  const supabase = await createClient();
  const scopedUnitIds = await getSchedulerScopedUnitIds(supabase, schedulerId);
  const scope: ManufacturingProcessScope = { role: "scheduler", scopedUnitIds };
  const units = await loadUnitsForManufacturingProcess(scope);
  return loadManufacturingProcessRowsForUnits(units, scope);
}

export async function loadInstallerManufacturingProcessRows(): Promise<ManufacturingProcessRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "installer") return [];

  const installerId = await getLinkedInstallerId(user.id);
  if (!installerId) return [];

  const scope: ManufacturingProcessScope = { role: "installer", installerId };
  const units = await loadUnitsForManufacturingProcess(scope);
  return loadManufacturingProcessRowsForUnits(units, scope);
}

export async function loadCutterManufacturingProcessRows(): Promise<ManufacturingProcessRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "cutter") return [];

  return loadAllManufacturingProcessRows();
}

export async function loadAssemblerManufacturingProcessRows(): Promise<ManufacturingProcessRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "assembler") return [];

  return loadAllManufacturingProcessRows();
}

export async function loadQcManufacturingProcessRows(): Promise<ManufacturingProcessRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "qc") return [];

  return loadAllManufacturingProcessRows();
}
