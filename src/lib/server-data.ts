import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getLinkedSchedulerId } from "@/lib/auth";
import { getSchedulerScopedUnitIds } from "@/lib/scheduler-scope";
import type { AppDataset } from "@/lib/app-dataset";
import type { Notification, UnitActivityLog, UnitPhotoStage } from "@/lib/types";
import {
  mapClient,
  mapBuilding,
  mapInstaller,
  mapUnit,
  mapActivityLog,
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
  type UnitActivityLogRow,
  type RoomRow,
  type WindowRow,
  type ScheduleRow,
  type CutterRow,
  type SchedulerRow,
} from "@/lib/dataset-mappers";

type MediaUploadRow = {
  id: string;
  public_url: string;
  label: string | null;
  unit_id: string;
  room_id: string | null;
  window_id: string | null;
  upload_kind: string;
  stage: string | null;
  phase: string | null;
  created_at: string;
};

/**
 * Transforms raw RPC / multi-query results into a typed AppDataset.
 * Shared by both the fast RPC path and the legacy multi-query fallback.
 */
function buildDatasetFromRaw(raw: {
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
}): AppDataset {
  const schedulersData = raw.schedulers ?? [];
  const schedulerMap = new Map(schedulersData.map((s) => [s.id, s.name]));
  const assignmentMap = new Map(
    (raw.scheduler_unit_assignments ?? []).map((a) => [
      a.unit_id,
      { id: a.scheduler_id, name: schedulerMap.get(a.scheduler_id) || "Unknown", assigned_at: a.assigned_at },
    ])
  );

  const units = (raw.units ?? []).map((r) => {
    const assignment = assignmentMap.get(r.id);
    return mapUnit(
      { ...r, assigned_at: assignment?.assigned_at },
      assignment?.name,
      assignment?.id
    );
  });
  const schedule = normalizeScheduleEntries(units, (raw.schedule_entries ?? []).map(mapSchedule));

  const installers = (raw.installers ?? []).map(mapInstaller);
  const schedulers = schedulersData.map(mapScheduler);

  // Allow Schedulers to act as Installers
  const combinedInstallers = [
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
  };
}

export const loadFullDataset = cache(async (): Promise<AppDataset> => {
  const supabase = await createClient();

  // Fast path: single RPC call (requires migration 20260408110000)
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_full_dataset");
  if (!rpcError && rpcData) {
    return buildDatasetFromRaw(rpcData as {
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
    });
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

  return buildDatasetFromRaw({
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
  });
});

function emptyDataset(): AppDataset {
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
  };
}

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
 * Loads a dataset scoped to the current scheduler: units from
 * `scheduler_unit_assignments` plus units assigned to installers on this scheduler's team
 * (`installers.scheduler_id`). The latter keeps units visible after handoff to a team installer.
 */
export async function loadSchedulerDataset(): Promise<AppDataset> {
  const user = await getCurrentUser();
  if (!user || user.role !== "scheduler") {
    return emptyDataset();
  }

  const schedulerId = await getLinkedSchedulerId(user.id);
  if (!schedulerId) return emptyDataset();

  const supabase = await createClient();

  const scopedUnitIds = await getSchedulerScopedUnitIds(supabase, schedulerId);

  if (scopedUnitIds.length === 0) return emptyDataset();

  const { data: unitData, error: unitError } = await supabase
    .from("units")
    .select("*")
    .in("id", scopedUnitIds)
    .order("unit_number");

  if (unitError) return emptyDataset();
  const { data: assignmentsData } = await supabase
    .from("scheduler_unit_assignments")
    .select("unit_id, assigned_at")
    .eq("scheduler_id", schedulerId);
  const assignmentAtMap = new Map(
    ((assignmentsData ?? []) as { unit_id: string; assigned_at: string }[]).map((a) => [
      a.unit_id,
      a.assigned_at,
    ])
  );

  const { data: schedulerRow } = await supabase.from("schedulers").select("name").eq("id", schedulerId).single();
  const schedulerName = (schedulerRow as { name: string })?.name || "Unknown";

  const units = ((unitData as UnitRow[]) ?? []).map((r) =>
    mapUnit({ ...r, assigned_at: assignmentAtMap.get(r.id) }, schedulerName, schedulerId)
  );

  // Derive unique building and client id sets from the loaded units.
  const allowedBuildingIds = [...new Set(units.map((u) => u.buildingId))];
  const allowedClientIds = [...new Set(units.map((u) => u.clientId))];
  const allowedUnitIds = units.map((u) => u.id);

  const [buildingRows, clientRows, roomRows, scheduleRows, installerRows] = await Promise.all([
    allowedBuildingIds.length > 0
      ? supabase.from("buildings").select("*").in("id", allowedBuildingIds).order("name")
      : Promise.resolve({ data: [] }),
    allowedClientIds.length > 0
      ? supabase.from("clients").select("*").in("id", allowedClientIds).order("name")
      : Promise.resolve({ data: [] }),
    allowedUnitIds.length > 0
      ? supabase.from("rooms").select("*").in("unit_id", allowedUnitIds).order("name")
      : Promise.resolve({ data: [] }),
    allowedUnitIds.length > 0
      ? supabase.from("schedule_entries").select("*").in("unit_id", allowedUnitIds).order("task_date")
      : Promise.resolve({ data: [] }),
    // Scope installers to this scheduler's team.
    supabase.from("installers").select("*").eq("scheduler_id", schedulerId).order("name"),
  ]);

  const buildings = ((buildingRows.data as BuildingRow[]) ?? []).map(mapBuilding);
  const clients = ((clientRows.data as ClientRow[]) ?? []).map(mapClient);
  const rooms = ((roomRows.data as RoomRow[]) ?? []).map(mapRoom);

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
  const windowRows =
    allowedRoomIds.length > 0
      ? await supabase.from("windows").select("*").in("room_id", allowedRoomIds).order("label")
      : { data: [] };

  const windows = ((windowRows.data as WindowRow[]) ?? []).map(mapWindow);
  const schedule = normalizeScheduleEntries(
    units,
    ((scheduleRows.data as ScheduleRow[]) ?? []).map(mapSchedule)
  );

  return {
    clients,
    buildings,
    units,
    rooms,
    windows,
    installers,
    schedule,
    cutters: [],
    schedulers: [],
  };
}

/**
 * Loads a dataset scoped to the current installer: only units assigned to them,
 * plus their buildings, clients, rooms, and windows.
 * ~10x smaller payload than loadFullDataset() for active installers.
 */
export async function loadInstallerDataset(installerId: string): Promise<AppDataset> {
  if (!installerId) return emptyDataset();

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
    allowedBuildingIds.length > 0
      ? supabase.from("buildings").select("*").in("id", allowedBuildingIds).order("name")
      : Promise.resolve({ data: [] }),
    allowedClientIds.length > 0
      ? supabase.from("clients").select("*").in("id", allowedClientIds).order("name")
      : Promise.resolve({ data: [] }),
    allowedUnitIds.length > 0
      ? supabase.from("rooms").select("*").in("unit_id", allowedUnitIds).order("name")
      : Promise.resolve({ data: [] }),
    allowedUnitIds.length > 0
      ? supabase.from("schedule_entries").select("*").in("unit_id", allowedUnitIds).order("task_date")
      : Promise.resolve({ data: [] }),
  ]);

  const rooms = ((roomRows.data as RoomRow[]) ?? []).map(mapRoom);
  const allowedRoomIds = rooms.map((r) => r.id);
  const windowRows = allowedRoomIds.length > 0
    ? await supabase.from("windows").select("*").in("room_id", allowedRoomIds).order("label")
    : { data: [] };

  const schedule = normalizeScheduleEntries(
    units,
    ((scheduleRows.data as ScheduleRow[]) ?? []).map(mapSchedule)
  );

  return {
    clients: ((clientRows.data as ClientRow[]) ?? []).map(mapClient),
    buildings: ((buildingRows.data as BuildingRow[]) ?? []).map(mapBuilding),
    units,
    rooms,
    windows: ((windowRows.data as WindowRow[]) ?? []).map(mapWindow),
    installers: [],
    schedule,
    cutters: [],
    schedulers: [],
  };
}

export type InstallerMediaItem = {
  id: string;
  publicUrl: string;
  label: string | null;
  unitId: string;
  unitNumber: string;
  buildingId: string;
  buildingName: string;
  stage: UnitPhotoStage;
  createdAt: string;
};

export type UnitStageMediaItem = {
  id: string;
  publicUrl: string;
  label: string | null;
  unitId: string;
  roomId: string | null;
  roomName: string | null;
  windowId: string | null;
  windowLabel: string | null;
  uploadKind: string;
  stage: UnitPhotoStage;
  createdAt: string;
};

function normalizeMediaStage(
  stage: string | null,
  phase: string | null
): UnitPhotoStage {
  if (
    stage === "scheduled_bracketing" ||
    stage === "bracketed_measured" ||
    stage === "installed_pending_approval"
  ) {
    return stage;
  }
  return phase === "installation"
    ? "installed_pending_approval"
    : "bracketed_measured";
}

export async function loadInstallerMedia(
  installerId: string
): Promise<InstallerMediaItem[]> {
  const supabase = await createClient();
  const { data: units, error: ue } = await supabase
    .from("units")
    .select("id, unit_number, building_id, building_name")
    .eq("assigned_installer_id", installerId);
  if (ue) {
    throw new Error(ue.message);
  }
  type UnitMeta = { unit_number: string; building_id: string; building_name: string };
  const unitMap = new Map<string, UnitMeta>(
    (units ?? []).map((u) => [
      u.id,
      { unit_number: u.unit_number, building_id: u.building_id, building_name: u.building_name },
    ])
  );
  const unitIds = [...unitMap.keys()];
  if (unitIds.length === 0) {
    return [];
  }
  const { data: media, error: me } = await supabase
    .from("media_uploads")
    .select("id, public_url, label, unit_id, stage, phase, created_at")
    .in("unit_id", unitIds)
    .order("created_at", { ascending: false });
  if (me) {
    throw new Error(
      `${me.message} Apply supabase/migrations/20250322140000_storage_and_media.sql if media_uploads is missing.`
    );
  }
  return (media ?? []).map((m) => {
    const meta = unitMap.get(m.unit_id);
    return {
      id: m.id,
      publicUrl: m.public_url,
      label: m.label,
      unitId: m.unit_id,
      unitNumber: meta?.unit_number ?? m.unit_id,
      buildingId: meta?.building_id ?? "",
      buildingName: meta?.building_name ?? "",
      stage: normalizeMediaStage(m.stage, m.phase),
      createdAt: m.created_at,
    };
  });
}

export async function loadUnitStageMedia(
  unitId: string
): Promise<UnitStageMediaItem[]> {
  const supabase = await createClient();
  const [{ data: media, error: mediaError }, { data: rooms, error: roomError }] =
    await Promise.all([
      supabase
        .from("media_uploads")
        .select(
          "id, public_url, label, unit_id, room_id, window_id, upload_kind, stage, phase, created_at"
        )
        .eq("unit_id", unitId)
        .order("created_at", { ascending: false }),
      supabase.from("rooms").select("id, name").eq("unit_id", unitId),
    ]);

  if (mediaError) {
    throw new Error(
      `${mediaError.message} Apply supabase/migrations/20250322140000_storage_and_media.sql if media_uploads is missing.`
    );
  }
  if (roomError) {
    throw new Error(roomError.message);
  }

  const roomMap = new Map((rooms ?? []).map((room) => [room.id, room.name]));
  const roomIds = [...roomMap.keys()];
  const { data: windows, error: windowError } = roomIds.length
    ? await supabase
        .from("windows")
        .select("id, room_id, label")
        .in("room_id", roomIds)
    : { data: [], error: null };

  if (windowError) {
    throw new Error(windowError.message);
  }

  const windowMap = new Map(
    (windows ?? []).map((window) => [window.id, { label: window.label, roomId: window.room_id }])
  );

  return ((media ?? []) as MediaUploadRow[]).map((item) => {
    const windowMeta = item.window_id ? windowMap.get(item.window_id) : null;
    return {
      id: item.id,
      publicUrl: item.public_url,
      label: item.label,
      unitId: item.unit_id,
      roomId: item.room_id,
      roomName: item.room_id ? roomMap.get(item.room_id) ?? null : null,
      windowId: item.window_id,
      windowLabel: windowMeta?.label ?? null,
      uploadKind: item.upload_kind,
      stage: normalizeMediaStage(item.stage, item.phase),
      createdAt: item.created_at,
    };
  });
}

export async function loadNotifications(
  recipientRole: string,
  recipientId: string
): Promise<Notification[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_role", recipientRole)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false });
  if (error) return [];

  const ids = (rows ?? []).map((r) => r.id);
  let readSet = new Set<string>();
  if (ids.length > 0) {
    const { data: reads } = await supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("user_role", recipientRole)
      .eq("user_id", recipientId)
      .in("notification_id", ids);
    readSet = new Set((reads ?? []).map((r) => r.notification_id));
  }

  return (rows ?? []).map((r) => ({
    id: r.id,
    recipientRole: r.recipient_role,
    recipientId: r.recipient_id,
    type: r.type,
    title: r.title,
    body: r.body,
    relatedWeekStart: r.related_week_start,
    relatedUnitId: r.related_unit_id ?? null,
    createdAt: r.created_at,
    read: readSet.has(r.id),
  }));
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

  return {
    ...emptyDataset(),
    units: [unit],
    rooms,
    windows: ((windowsRes.data as WindowRow[]) ?? []).map(mapWindow),
  };
}

export async function loadUnitActivityLog(
  unitId: string
): Promise<UnitActivityLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unit_activity_log")
    .select("*")
    .eq("unit_id", unitId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as UnitActivityLogRow[]).map(mapActivityLog);
}

export async function getUnreadNotificationCount(
  recipientRole: string,
  recipientId: string
): Promise<number> {
  const supabase = await createClient();
  const { count: total } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_role", recipientRole)
    .eq("recipient_id", recipientId);
  const { count: readCount } = await supabase
    .from("notification_reads")
    .select("*", { count: "exact", head: true })
    .eq("user_role", recipientRole)
    .eq("user_id", recipientId);
  return Math.max(0, (total ?? 0) - (readCount ?? 0));
}
