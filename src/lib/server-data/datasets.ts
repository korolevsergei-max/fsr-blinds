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
  const startedAt = performance.now();
  const supabase = await createClient();

  // Owner fast path: single RPC call that never builds raw rooms/windows server-side.
  // get_full_dataset remains below as the rollback / pre-migration fallback.
  const { data: ownerRpcData, error: ownerRpcError } = await supabase.rpc("get_owner_dataset");
  if (!ownerRpcError && ownerRpcData) {
    const raw = ownerRpcData as {
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
    };
    console.log(
      `[owner-load] management units=${raw.units?.length ?? 0} rooms=0 windows=0 schedule=${raw.schedule_entries?.length ?? 0} ${(performance.now() - startedAt).toFixed(0)}ms`
    );
    return finalizeDataset(buildDatasetFromRaw(raw), {
      deriveStatusFromWindows: false,
    });
  }

  // Fallback fast path: single RPC call (requires migration 20260408110000)
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_full_dataset");
  if (!rpcError && rpcData) {
    const raw = rpcData as {
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
    };
    // Owner global views (units list, dashboard, schedule, building/client pages) read only
    // unit-level data (persisted status, denormalized room/window counts) + the spine. Raw
    // rooms/windows — the two largest tables — are read only by the already-scoped
    // unit-detail routes, which load their own via loadUnitDetail. Drop them from the client
    // payload and trust persisted units.status (drift confirmed 0). See DATA_SCOPING_PLAN.md.
    console.log(
      `[full-load] management units=${raw.units?.length ?? 0} rooms=${raw.rooms?.length ?? 0}→0 windows=${raw.windows?.length ?? 0}→0 schedule=${raw.schedule_entries?.length ?? 0} ${(performance.now() - startedAt).toFixed(0)}ms`
    );
    return finalizeDataset(buildDatasetFromRaw({ ...raw, rooms: [], windows: [] }), {
      deriveStatusFromWindows: false,
    });
  }

  // Fallback: multiple parallel queries (works before RPC migration is applied).
  // Owner global views don't need raw rooms/windows (see RPC path above), so skip those
  // two queries entirely.
  const [
    clientsRes,
    buildingsRes,
    unitsRes,
    installersRes,
    scheduleRes,
  ] = await Promise.all([
    supabase.from("clients").select("*").order("name"),
    supabase.from("buildings").select("*").order("name"),
    supabase.from("units").select("*").order("unit_number"),
    supabase.from("installers").select("*").order("name"),
    supabase.from("schedule_entries").select("*").order("task_date"),
  ]);

  const [cuttersRes, schedulersRes, assignmentsRes] = await Promise.all([
    supabase.from("cutters").select("*").order("name"),
    supabase.from("schedulers").select("*").order("name"),
    supabase.from("scheduler_unit_assignments").select("unit_id, scheduler_id, assigned_at"),
  ]);

  const coreResponses = [clientsRes, buildingsRes, unitsRes, installersRes, scheduleRes];
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

  return finalizeDataset(
    buildDatasetFromRaw({
      clients: (clientsRes.data as ClientRow[]) ?? [],
      buildings: (buildingsRes.data as BuildingRow[]) ?? [],
      units: (unitsRes.data as UnitRow[]) ?? [],
      rooms: [],
      windows: [],
      installers: (installersRes.data as InstallerRow[]) ?? [],
      schedule_entries: (scheduleRes.data as ScheduleRow[]) ?? [],
      cutters: cuttersRes.error ? [] : (cuttersRes.data as CutterRow[]) ?? [],
      schedulers: schedulersRes.error ? [] : (schedulersRes.data as SchedulerRow[]) ?? [],
      scheduler_unit_assignments: (assignmentsRes.data as { unit_id: string; scheduler_id: string; assigned_at: string }[]) ?? [],
    }),
    { deriveStatusFromWindows: false }
  );
});

/**
 * Raw scoped rows returned by the get_scheduler_dataset RPC (and re-assembled by the
 * chunked fallback). Mirrors the row shapes the chunked loader fetches today.
 */
type SchedulerDatasetRaw = {
  units: UnitRow[];
  assignments: { unit_id: string; assigned_at: string }[];
  scheduler: SchedulerRow | null;
  buildings: BuildingRow[];
  clients: ClientRow[];
  rooms: RoomRow[];
  windows: WindowRow[];
  schedule_entries: ScheduleRow[];
  team_installers: InstallerRow[];
  all_installers: InstallerRow[];
};

/**
 * Builds the scheduler AppDataset from raw scoped rows. Single source of mapping/business
 * logic for both the RPC fast path and the chunked fallback, so they stay byte-identical:
 * scheduler-name injection on every scoped unit, the synthetic `sch-<id>` self pick-list row,
 * the empty-team installer fallback, and schedule normalization.
 */
function buildSchedulerDataset(
  raw: SchedulerDatasetRaw,
  schedulerId: string
): Promise<AppDataset> {
  const assignmentAtMap = new Map(
    (raw.assignments ?? []).map((a) => [a.unit_id, a.assigned_at])
  );
  const schedulerName = raw.scheduler?.name || "Unknown";

  const units = (raw.units ?? []).map((r) =>
    mapUnit({ ...r, assigned_at: assignmentAtMap.get(r.id) }, schedulerName, schedulerId)
  );

  const buildings = (raw.buildings ?? []).map(mapBuilding);
  const clients = (raw.clients ?? []).map(mapClient);
  const rooms = (raw.rooms ?? []).map(mapRoom);

  // Fall back to all installers when the scheduler has no team yet.
  let installers = (raw.team_installers ?? []).map(mapInstaller);
  if (installers.length === 0) {
    installers = (raw.all_installers ?? []).map(mapInstaller);
  }

  // Same synthetic pick-list row as `loadFullDataset`: schedulers can assign units to themselves.
  const selfPickId = `sch-${schedulerId}`;
  if (raw.scheduler && !installers.some((i) => i.id === selfPickId)) {
    const sch = mapScheduler(raw.scheduler);
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

  const windows = (raw.windows ?? []).map(mapWindow);
  const schedule = normalizeScheduleEntries(units, (raw.schedule_entries ?? []).map(mapSchedule));

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
 * Loads a dataset scoped to the current scheduler: units from
 * `scheduler_unit_assignments` plus units assigned to installers on this scheduler's team
 * (`installers.scheduler_id`). The latter keeps units visible after handoff to a team installer.
 *
 * Prefers the get_scheduler_dataset RPC (one DB round-trip for the whole scoped spine);
 * falls back to the chunked multi-query path when the RPC is unavailable (pre-migration /
 * rollback). Both feed buildSchedulerDataset so the scoped shape is identical either way.
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

  // Fast path: single RPC returns the same scoped raw rows the chunked path fetches in 6+.
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_scheduler_dataset", {
    p_scheduler_id: schedulerId,
  });
  if (!rpcError && rpcData) {
    const raw = rpcData as SchedulerDatasetRaw;
    if (!raw.units || raw.units.length === 0) return emptyDataset();
    const dataset = await buildSchedulerDataset(raw, schedulerId);
    console.log(
      `[scoped-load] scheduler=${schedulerId} units=${dataset.units.length} rooms=${dataset.rooms.length} windows=${dataset.windows.length} rpc ${(performance.now() - startedAt).toFixed(0)}ms`
    );
    return dataset;
  }

  // Fallback: chunked multi-query path (pre-migration / rollback).
  // scopedUnitIds, assignments, and the scheduler row all derive from schedulerId only —
  // run them in parallel so we don't stack three round-trips before the units query.
  const [scopedUnitIds, assignmentsRes, schedulerRowRes] = await Promise.all([
    getSchedulerScopedUnitIds(supabase, schedulerId),
    supabase
      .from("scheduler_unit_assignments")
      .select("unit_id, assigned_at")
      .eq("scheduler_id", schedulerId),
    supabase.from("schedulers").select("*").eq("id", schedulerId).single(),
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

  const allowedBuildingIds = [...new Set(unitData.map((u) => u.building_id))];
  const allowedClientIds = [...new Set(unitData.map((u) => u.client_id))];
  const allowedUnitIds = unitData.map((u) => u.id);

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

  const allowedRoomIds = schedulerRoomRows.map((r) => r.id);
  const schedulerWindowRows = await selectInChunks<WindowRow>(allowedRoomIds, (chunk) =>
    supabase
      .from("windows")
      .select("*")
      .in("room_id", chunk)
      .order("label")
      .then((res) => ({ data: res.data as WindowRow[] | null, error: res.error })),
  );

  const teamInstallers = (installerRows.data as InstallerRow[]) ?? [];
  // Only fetch the full installers list when the team is empty (the builder's fallback).
  let allInstallers: InstallerRow[] = [];
  if (teamInstallers.length === 0) {
    const { data } = await supabase.from("installers").select("*").order("name");
    allInstallers = (data as InstallerRow[]) ?? [];
  }

  const dataset = await buildSchedulerDataset(
    {
      units: unitData,
      assignments: (assignmentsRes.data ?? []) as { unit_id: string; assigned_at: string }[],
      scheduler: (schedulerRowRes.data as SchedulerRow | null) ?? null,
      buildings: buildingRows,
      clients: clientRows,
      rooms: schedulerRoomRows,
      windows: schedulerWindowRows,
      schedule_entries: schedulerScheduleRows,
      team_installers: teamInstallers,
      all_installers: allInstallers,
    },
    schedulerId
  );

  console.log(
    `[scoped-load] scheduler=${schedulerId} units=${dataset.units.length} rooms=${dataset.rooms.length} windows=${dataset.windows.length} chunked ${(performance.now() - startedAt).toFixed(0)}ms`
  );

  return dataset;
}

/** Raw scoped rows returned by the get_installer_dataset RPC (and the chunked fallback). */
type InstallerDatasetRaw = {
  units: UnitRow[];
  buildings: BuildingRow[];
  clients: ClientRow[];
  rooms: RoomRow[];
  windows: WindowRow[];
  schedule_entries: ScheduleRow[];
};

/** Builds the installer AppDataset from raw scoped rows (shared by RPC + chunked paths). */
function buildInstallerDataset(raw: InstallerDatasetRaw): Promise<AppDataset> {
  const units = (raw.units ?? []).map((r) => mapUnit(r));
  const schedule = normalizeScheduleEntries(units, (raw.schedule_entries ?? []).map(mapSchedule));

  return finalizeDataset({
    clients: (raw.clients ?? []).map(mapClient),
    buildings: (raw.buildings ?? []).map(mapBuilding),
    units,
    rooms: (raw.rooms ?? []).map(mapRoom),
    windows: (raw.windows ?? []).map(mapWindow),
    installers: [],
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
 *
 * Prefers the get_installer_dataset RPC (one DB round-trip); falls back to the chunked
 * multi-query path when the RPC is unavailable. Both feed buildInstallerDataset.
 */
export async function loadInstallerDataset(installerId: string): Promise<AppDataset> {
  if (!installerId) return emptyDataset();

  const startedAt = performance.now();
  const supabase = await createClient();

  // Fast path: single RPC returns the same scoped raw rows the chunked path fetches.
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_installer_dataset", {
    p_installer_id: installerId,
  });
  if (!rpcError && rpcData) {
    const raw = rpcData as InstallerDatasetRaw;
    if (!raw.units || raw.units.length === 0) return emptyDataset();
    const dataset = await buildInstallerDataset(raw);
    console.log(
      `[scoped-load] installer=${installerId} units=${dataset.units.length} rooms=${dataset.rooms.length} windows=${dataset.windows.length} rpc ${(performance.now() - startedAt).toFixed(0)}ms`
    );
    return dataset;
  }

  // Fallback: chunked multi-query path (pre-migration / rollback).
  const { data: unitData, error: unitError } = await supabase
    .from("units")
    .select("*")
    .eq("assigned_installer_id", installerId)
    .order("unit_number");

  if (unitError || !unitData?.length) return emptyDataset();

  const unitRows = unitData as UnitRow[];
  const allowedBuildingIds = [...new Set(unitRows.map((u) => u.building_id))];
  const allowedClientIds = [...new Set(unitRows.map((u) => u.client_id))];
  const allowedUnitIds = unitRows.map((u) => u.id);

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

  const allowedRoomIds = roomRows.map((r) => r.id);
  const windowRows = await selectInChunks<WindowRow>(allowedRoomIds, (chunk) =>
    supabase
      .from("windows")
      .select("*")
      .in("room_id", chunk)
      .order("label")
      .then((res) => ({ data: res.data as WindowRow[] | null, error: res.error })),
  );

  const dataset = await buildInstallerDataset({
    units: unitRows,
    buildings: buildingRows,
    clients: clientRows,
    rooms: roomRows,
    windows: windowRows,
    schedule_entries: scheduleRows,
  });

  console.log(
    `[scoped-load] installer=${installerId} units=${dataset.units.length} rooms=${dataset.rooms.length} windows=${dataset.windows.length} chunked ${(performance.now() - startedAt).toFixed(0)}ms`
  );

  return dataset;
}
