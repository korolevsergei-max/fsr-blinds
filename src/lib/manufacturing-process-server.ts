import { createClient } from "./supabase/server";
import { getCurrentUser, getLinkedInstallerId, getLinkedSchedulerId } from "./auth";
import { getSchedulerScopedUnitIds } from "./scheduler-scope";
import type { ProductionStatus } from "./types";
import {
  buildManufacturingProcessRows,
  buildManufacturingProcessRowsFromCounts,
  scopeManufacturingProcessUnits,
  type ManufacturingProcessRow,
  type ManufacturingProcessScope,
  type ManufacturingProcessUnitInput,
} from "./manufacturing-process-core";
import { selectInChunks } from "./supabase-chunking";
import { INTERNAL_PARTNER_ID } from "./manufacturing-partners";

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

type ProcessCountRow = {
  unit_id: string;
  cut_count: number;
  assembled_count: number;
  qc_approved_count: number;
  installed_count: number;
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

  // M6 fast path: one set-based read instead of the rooms -> installed-windows
  // -> production fan-out below. Falls through to that fan-out on any error, so
  // an unapplied migration or an RPC failure degrades to the old behaviour
  // rather than an empty screen.
  const { data: countRows, error: countsError } = await supabase.rpc(
    "get_manufacturing_process_counts",
    { p_unit_ids: unitIds },
  );

  if (!countsError && Array.isArray(countRows)) {
    return buildManufacturingProcessRowsFromCounts(
      scopedUnits,
      (countRows as ProcessCountRow[]).map((row) => ({
        unitId: row.unit_id,
        cutCount: row.cut_count,
        assembledCount: row.assembled_count,
        qcApprovedCount: row.qc_approved_count,
        installedCount: row.installed_count,
      })),
    );
  }

  console.warn(
    `[perf][process-rows] counts RPC unavailable, using chunked fallback: ${countsError?.message ?? "non-array result"}`,
  );

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

/**
 * `internalOnly` narrows the owner-scoped read to the in-house factory's own
 * work. The cutter/assembler/QC process screens pass it; the owner and scheduler
 * screens deliberately do not, because the office needs the whole picture
 * including subcontracted units.
 *
 * Without it a cutter sees a subcontracted unit sitting at "0 cut", opens it,
 * and physically cuts blinds the partner is already building — the write is
 * refused by `wps_guard_manufacturing_ownership`, but only after the fact.
 */
async function loadUnitsForManufacturingProcess(
  scope: ManufacturingProcessScope,
  opts: { internalOnly?: boolean } = {}
) {
  const supabase = await createClient();
  let unitRows: UnitRow[] = [];

  if (scope.role === "owner") {
    let query = supabase
      .from("units")
      .select(
        "id, client_id, client_name, building_id, building_name, unit_number, complete_by_date, window_count, assigned_installer_id"
      )
      .gt("window_count", 0);
    if (opts.internalOnly) {
      // The routed filter mirrors the reflow source query: the factory's own
      // screens only show units somebody consciously assigned to the in-house
      // queue. Unrouted units live in the dashboard's "No manufacturer
      // assigned" bucket until someone decides.
      query = query
        .eq("manufacturing_partner_id", INTERNAL_PARTNER_ID)
        .not("manufacturing_assigned_at", "is", null);
    }
    const { data } = await query;
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

async function loadAllManufacturingProcessRows(
  opts: { internalOnly?: boolean } = {}
): Promise<ManufacturingProcessRow[]> {
  const startedAt = performance.now();
  const scope: ManufacturingProcessScope = { role: "owner" };
  const units = await loadUnitsForManufacturingProcess(scope, opts);
  const rows = await loadManufacturingProcessRowsForUnits(units, scope);
  console.warn(
    `[perf][process-rows] units=${units.length} rows=${rows.length}${opts.internalOnly ? " internal-only" : ""} ${(performance.now() - startedAt).toFixed(0)}ms`
  );
  return rows;
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

  return loadAllManufacturingProcessRows({ internalOnly: true });
}

export async function loadAssemblerManufacturingProcessRows(): Promise<ManufacturingProcessRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "assembler") return [];

  return loadAllManufacturingProcessRows({ internalOnly: true });
}

export async function loadQcManufacturingProcessRows(): Promise<ManufacturingProcessRow[]> {
  const user = await getCurrentUser();
  if (!user || user.role !== "qc") return [];

  return loadAllManufacturingProcessRows({ internalOnly: true });
}
