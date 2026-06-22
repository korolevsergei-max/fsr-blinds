import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getLinkedSchedulerId } from "@/lib/auth";
import { getSchedulerScopedUnitIds } from "@/lib/scheduler-scope";
import type { AppDataset } from "@/lib/app-dataset";
import {
  mapClient,
  mapBuilding,
  mapInstaller,
  mapUnit,
  mapRoom,
  mapWindow,
  mapSchedule,
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
import { selectInChunks } from "@/lib/supabase-chunking";
import { buildDatasetFromRaw, emptyDataset } from "./build";
import { finalizeDataset } from "./enrichment";

export const loadFullDataset = cache(async (): Promise<AppDataset> => {
  const supabase = await createClient();

  // Fast path: single RPC call (requires migration 20260408110000)
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_full_dataset");
  if (!rpcError && rpcData) {
    return finalizeDataset(buildDatasetFromRaw(rpcData as {
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
    }));
  }

  // Fallback: multiple parallel queries (works before RPC migration is applied)
  const [
    clientsRes,
    buildingsRes,
    unitsRes,
    roomsRes,
    windowsRes,
    installersRes,
    scheduleRes,
  ] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("buildings").select("*").order("name"),
    supabase.from("units").select("*").order("unit_number"),
    supabase.from("rooms").select("*").order("name"),
    supabase.from("windows").select("*").order("label"),
    supabase.from("installers").select("*").order("name"),
    supabase.from("schedule_entries").select("*").order("task_date"),
  ]);

  const [cuttersRes, schedulersRes, assignmentsRes] = await Promise.all([
    supabase.from("cutters").select("*").order("name"),
    supabase.from("schedulers").select("*").order("name"),
    supabase.from("scheduler_unit_assignments").select("unit_id, scheduler_id, assigned_at"),
  ]);

  const coreResponses = [clientsRes, buildingsRes, unitsRes, roomsRes, windowsRes, installersRes, scheduleRes];
  const firstError = coreResponses.find((r) => r.error)?.error;
  if (firstError) {
    const baseMessage = `Supabase: ${firstError.message}.`;
    if (/invalid api key/i.test(firstError.message)) {
      throw new Error(
        `${baseMessage} Update NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in .env.local and restart dev server.`
      );
    }
    throw new Error(
      `${baseMessage} Apply supabase/migrations in the SQL editor if tables are missing.`
    );
  }

  return finalizeDataset(buildDatasetFromRaw({
    clients: (clientsRes.data as ClientRow[]) ?? [],
    buildings: (buildingsRes.data as BuildingRow[]) ?? [],
    units: (unitsRes.data as UnitRow[]) ?? [],
    rooms: (roomsRes.data as RoomRow[]) ?? [],
    windows: (windowsRes.data as WindowRow[]) ?? [],
    installers: (installersRes.data as InstallerRow[]) ?? [],
    schedule_entries: (scheduleRes.data as ScheduleRow[]) ?? [],
    cutters: cuttersRes.error ? [] : (cuttersRes.data as CutterRow[]) ?? [],
    schedulers: schedulersRes.error ? [] : (schedulersRes.data as SchedulerRow[]) ?? [],
    scheduler_unit_assignments: (assignmentsRes.data as { unit_id: string; scheduler_id: string; assigned_at: string }[]) ?? [],
  }));
});

/**
 * Loads a dataset scoped to the current scheduler: units from
 * `scheduler_unit_assignments` plus units assigned to installers on this scheduler's team
 * (`installers.scheduler_id`). The latter keeps units visible after handoff to a team installer.
 */
export async function loadSchedulerDataset(
  preloadedSchedulerId?: string | null
): Promise<AppDataset> {
  const user = await getCurrentUser();
  if (!user || user.role !== "scheduler") {
    return emptyDataset();
  }

  const schedulerId =
    preloadedSchedulerId === undefined
      ? await getLinkedSchedulerId(user.id)
      : preloadedSchedulerId;
  if (!schedulerId) return emptyDataset();

  const startedAt = performance.now();
  const supabase = await createClient();

  // scopedUnitIds, assignments, and the scheduler row all derive from schedulerId only —
  // run them in parallel so we don't stack three round-trips before the units query.
  const [scopedUnitIds, assignmentsRes, schedulerRowRes] = await Promise.all([
    getSchedulerScopedUnitIds(supabase, schedulerId),
    supabase
      .from("scheduler_unit_assignments")
      .select("unit_id, assigned_at")
      .eq("scheduler_id", schedulerId),
    supabase.from("schedulers").select("name").eq("id", schedulerId).single(),
  ]);

  if (scopedUnitIds.length === 0) return emptyDataset();

  const unitData = await selectInChunks<UnitRow>(scopedUnitIds, (chunk) =>
    supabase
      .from("units")
      .select("*")
      .in("id", chunk)
      .order("unit_number")
      .then((res) => ({ data: res.data as UnitRow[] | null, error: res.error })),
  );
  const assignmentAtMap = new Map(
    ((assignmentsRes.data ?? []) as { unit_id: string; assigned_at: string }[]).map((a) => [
      a.unit_id,
      a.assigned_at,
    ])
  );

  const schedulerName = (schedulerRowRes.data as { name: string } | null)?.name || "Unknown";

  const units = unitData.map((r) =>
    mapUnit({ ...r, assigned_at: assignmentAtMap.get(r.id) }, schedulerName, schedulerId)
  );

  // Derive unique building and client id sets from the loaded units.
  const allowedBuildingIds = [...new Set(units.map((u) => u.buildingId))];
  const allowedClientIds = [...new Set(units.map((u) => u.clientId))];
  const allowedUnitIds = units.map((u) => u.id);

  const [buildingRows, clientRows, schedulerRoomRows, schedulerScheduleRows, installerRows] = await Promise.all([
    selectInChunks<BuildingRow>(allowedBuildingIds, (chunk) =>
      supabase
        .from("buildings")
        .select("*")
        .in("id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as BuildingRow[] | null, error: res.error })),
    ),
    selectInChunks<ClientRow>(allowedClientIds, (chunk) =>
      supabase
        .from("clients")
        .select("*")
        .in("id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as ClientRow[] | null, error: res.error })),
    ),
    selectInChunks<RoomRow>(allowedUnitIds, (chunk) =>
      supabase
        .from("rooms")
        .select("*")
        .in("unit_id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as RoomRow[] | null, error: res.error })),
    ),
    selectInChunks<ScheduleRow>(allowedUnitIds, (chunk) =>
      supabase
        .from("schedule_entries")
        .select("*")
        .in("unit_id", chunk)
        .order("task_date")
        .then((res) => ({ data: res.data as ScheduleRow[] | null, error: res.error })),
    ),
    // Scope installers to this scheduler's team.
    supabase.from("installers").select("*").eq("scheduler_id", schedulerId).order("name"),
  ]);

  const buildings = buildingRows.map(mapBuilding);
  const clients = clientRows.map(mapClient);
  const rooms = schedulerRoomRows.map(mapRoom);

  // Fall back to all installers when the scheduler has no team yet.
  let installers = ((installerRows.data as InstallerRow[]) ?? []).map(mapInstaller);
  if (installers.length === 0) {
    const { data: allInstallers } = await supabase.from("installers").select("*").order("name");
    installers = ((allInstallers as InstallerRow[]) ?? []).map(mapInstaller);
  }

  // Same synthetic pick-list row as `loadFullDataset`: schedulers can assign units to themselves.
  const selfPickId = `sch-${schedulerId}`;
  if (!installers.some((i) => i.id === selfPickId)) {
    const { data: selfRow } = await supabase
      .from("schedulers")
      .select("*")
      .eq("id", schedulerId)
      .single();
    if (selfRow) {
      const sch = mapScheduler(selfRow as SchedulerRow);
      installers = [
        {
          id: selfPickId,
          name: `SC: ${sch.name}`,
          email: sch.email,
          phone: sch.phone,
          avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(sch.name)}`,
          authUserId: sch.authUserId,
        },
        ...installers,
      ];
    }
  }

  const allowedRoomIds = rooms.map((r) => r.id);
  const schedulerWindowRows = await selectInChunks<WindowRow>(allowedRoomIds, (chunk) =>
    supabase
      .from("windows")
      .select("*")
      .in("room_id", chunk)
      .order("label")
      .then((res) => ({ data: res.data as WindowRow[] | null, error: res.error })),
  );

  const windows = schedulerWindowRows.map(mapWindow);
  const schedule = normalizeScheduleEntries(
    units,
    schedulerScheduleRows.map(mapSchedule)
  );

  console.log(
    `[scoped-load] scheduler=${schedulerId} units=${units.length} rooms=${rooms.length} windows=${windows.length} ${(performance.now() - startedAt).toFixed(0)}ms`
  );

  return finalizeDataset({
    clients,
    buildings,
    units,
    rooms,
    windows,
    installers,
    schedule,
    cutters: [],
    schedulers: [],
    manufacturingEscalations: [],
    postInstallIssues: [],
  });
}

/**
 * Loads a dataset scoped to the current installer: only units assigned to them,
 * plus their buildings, clients, rooms, and windows.
 * ~10x smaller payload than loadFullDataset() for active installers.
 */
export async function loadInstallerDataset(installerId: string): Promise<AppDataset> {
  if (!installerId) return emptyDataset();

  const startedAt = performance.now();
  const supabase = await createClient();

  const { data: unitData, error: unitError } = await supabase
    .from("units")
    .select("*")
    .eq("assigned_installer_id", installerId)
    .order("unit_number");

  if (unitError || !unitData?.length) return emptyDataset();

  const units = (unitData as UnitRow[]).map((r) => mapUnit(r));

  const allowedBuildingIds = [...new Set(units.map((u) => u.buildingId))];
  const allowedClientIds = [...new Set(units.map((u) => u.clientId))];
  const allowedUnitIds = units.map((u) => u.id);

  const [buildingRows, clientRows, roomRows, scheduleRows] = await Promise.all([
    selectInChunks<BuildingRow>(allowedBuildingIds, (chunk) =>
      supabase
        .from("buildings")
        .select("*")
        .in("id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as BuildingRow[] | null, error: res.error })),
    ),
    selectInChunks<ClientRow>(allowedClientIds, (chunk) =>
      supabase
        .from("clients")
        .select("*")
        .in("id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as ClientRow[] | null, error: res.error })),
    ),
    selectInChunks<RoomRow>(allowedUnitIds, (chunk) =>
      supabase
        .from("rooms")
        .select("*")
        .in("unit_id", chunk)
        .order("name")
        .then((res) => ({ data: res.data as RoomRow[] | null, error: res.error })),
    ),
    selectInChunks<ScheduleRow>(allowedUnitIds, (chunk) =>
      supabase
        .from("schedule_entries")
        .select("*")
        .in("unit_id", chunk)
        .order("task_date")
        .then((res) => ({ data: res.data as ScheduleRow[] | null, error: res.error })),
    ),
  ]);

  const rooms = roomRows.map(mapRoom);
  const allowedRoomIds = rooms.map((r) => r.id);
  const windowRows = await selectInChunks<WindowRow>(allowedRoomIds, (chunk) =>
    supabase
      .from("windows")
      .select("*")
      .in("room_id", chunk)
      .order("label")
      .then((res) => ({ data: res.data as WindowRow[] | null, error: res.error })),
  );

  const schedule = normalizeScheduleEntries(
    units,
    scheduleRows.map(mapSchedule)
  );

  console.log(
    `[scoped-load] installer=${installerId} units=${units.length} rooms=${rooms.length} windows=${windowRows.length} ${(performance.now() - startedAt).toFixed(0)}ms`
  );

  return finalizeDataset({
    clients: clientRows.map(mapClient),
    buildings: buildingRows.map(mapBuilding),
    units,
    rooms,
    windows: windowRows.map(mapWindow),
    installers: [],
    schedule,
    cutters: [],
    schedulers: [],
    manufacturingEscalations: [],
    postInstallIssues: [],
  });
}
