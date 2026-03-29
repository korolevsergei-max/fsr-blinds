import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getLinkedSchedulerId } from "@/lib/auth";
import type { AppDataset } from "@/lib/app-dataset";
import type {
  Building,
  Client,
  Installer,
  Manufacturer,
  Scheduler,
  Notification,
  Room,
  ScheduleEntry,
  Unit,
  UnitActivityLog,
  UnitPhotoStage,
  UnitStatus,
  Window,
  BlindType,
  RiskFlag,
} from "@/lib/types";

type ClientRow = {
  id: string;
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
};

type BuildingRow = {
  id: string;
  client_id: string;
  name: string;
  address: string;
};

type InstallerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar_url: string;
  auth_user_id?: string | null;
};

type UnitRow = {
  id: string;
  building_id: string;
  client_id: string;
  client_name: string;
  building_name: string;
  unit_number: string;
  status: UnitStatus;
  risk_flag: RiskFlag;
  assigned_installer_id: string | null;
  assigned_installer_name: string | null;
  measurement_date: string | null;
  bracketing_date: string | null;
  installation_date: string | null;
  earliest_bracketing_date: string | null;
  earliest_installation_date?: string | null;
  // Note: Database unit record type no longer includes occupancy_date
  complete_by_date?: string | null;
  room_count: number;
  window_count: number;
  photos_uploaded: number;
  notes_count: number;
  created_at: string | null;
};

type UnitActivityLogRow = {
  id: string;
  unit_id: string;
  actor_role: string;
  actor_name: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type RoomRow = {
  id: string;
  unit_id: string;
  name: string;
  window_count: number;
  completed_windows: number;
};

type WindowRow = {
  id: string;
  room_id: string;
  label: string;
  blind_type: BlindType;
  width: number | null;
  height: number | null;
  depth: number | null;
  blind_width: number | null;
  blind_height: number | null;
  blind_depth: number | null;
  notes: string;
  risk_flag: RiskFlag;
  photo_url: string | null;
  measured: boolean;
};

type ScheduleRow = {
  id: string;
  unit_id: string;
  unit_number: string;
  building_name: string;
  client_name: string;
  owner_user_id: string | null;
  owner_name: string | null;
  task_type: "measurement" | "bracketing" | "installation";
  task_date: string;
  status: UnitStatus;
  risk_flag: RiskFlag;
};

type ManufacturerRow = {
  id: string;
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  auth_user_id?: string | null;
};

type SchedulerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  auth_user_id?: string | null;
};

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

function mapClient(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
  };
}

function mapBuilding(r: BuildingRow): Building {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    address: r.address,
  };
}

function mapInstaller(r: InstallerRow): Installer {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    avatarUrl: r.avatar_url,
    authUserId: r.auth_user_id ?? null,
  };
}

function mapUnit(r: UnitRow): Unit {
  return {
    id: r.id,
    buildingId: r.building_id,
    clientId: r.client_id,
    clientName: r.client_name,
    buildingName: r.building_name,
    unitNumber: r.unit_number,
    status: r.status,
    assignedInstallerId: r.assigned_installer_id,
    assignedInstallerName: r.assigned_installer_name,
    measurementDate: r.measurement_date || null,
    bracketingDate: r.bracketing_date,
    installationDate: r.installation_date || null,
    earliestBracketingDate: r.earliest_bracketing_date,
    earliestInstallationDate: r.earliest_installation_date || null,
    completeByDate: r.complete_by_date || null,
    roomCount: r.room_count ?? 0,
    windowCount: r.window_count,
    photosUploaded: r.photos_uploaded,
    notesCount: r.notes_count,
    createdAt: r.created_at,
  };
}

function mapActivityLog(r: UnitActivityLogRow): UnitActivityLog {
  return {
    id: r.id,
    unitId: r.unit_id,
    actorRole: r.actor_role,
    actorName: r.actor_name,
    action: r.action,
    details: r.details,
    createdAt: r.created_at,
  };
}

function mapRoom(r: RoomRow): Room {
  return {
    id: r.id,
    unitId: r.unit_id,
    name: r.name,
    windowCount: r.window_count,
    completedWindows: r.completed_windows,
  };
}

function mapWindow(r: WindowRow): Window {
  return {
    id: r.id,
    roomId: r.room_id,
    label: r.label,
    blindType: r.blind_type,
    riskFlag: r.risk_flag ?? "green",
    width: r.width,
    height: r.height,
    depth: r.depth,
    blindWidth: r.blind_width,
    blindHeight: r.blind_height,
    blindDepth: r.blind_depth,
    notes: r.notes || "",
    photoUrl: r.photo_url,
    measured: r.measured,
  };
}

function mapSchedule(r: ScheduleRow): ScheduleEntry {
  return {
    id: r.id,
    unitId: r.unit_id,
    unitNumber: r.unit_number,
    buildingName: r.building_name,
    clientName: r.client_name,
    ownerUserId: r.owner_user_id,
    ownerName: r.owner_name,
    taskType: r.task_type,
    date: r.task_date,
    status: r.status,
  };
}

function normalizeScheduleEntries(units: Unit[], schedule: ScheduleEntry[]): ScheduleEntry[] {
  const existingByTask = new Map<string, ScheduleEntry>();

  for (const entry of schedule) {
    const key = `${entry.unitId}:${entry.taskType}`;
    if (!existingByTask.has(key)) {
      existingByTask.set(key, entry);
    }
  }

  const normalized: ScheduleEntry[] = [];

  for (const unit of units) {
    if (unit.measurementDate) {
      const existing = existingByTask.get(`${unit.id}:measurement`);
      normalized.push({
        id: existing?.id ?? `derived-measurement-${unit.id}`,
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        buildingName: unit.buildingName,
        clientName: unit.clientName,
        ownerUserId: existing?.ownerUserId ?? null,
        ownerName: existing?.ownerName ?? null,
        taskType: "measurement",
        date: unit.measurementDate,
        status: existing?.status ?? "not_started",
      });
    }

    if (unit.bracketingDate) {
      const existing = existingByTask.get(`${unit.id}:bracketing`);
      normalized.push({
        id: existing?.id ?? `derived-bracketing-${unit.id}`,
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        buildingName: unit.buildingName,
        clientName: unit.clientName,
        ownerUserId: existing?.ownerUserId ?? null,
        ownerName: existing?.ownerName ?? null,
        taskType: "bracketing",
        date: unit.bracketingDate,
        status: existing?.status ?? "not_started",
      });
    }

    if (unit.installationDate) {
      const existing = existingByTask.get(`${unit.id}:installation`);
      normalized.push({
        id: existing?.id ?? `derived-installation-${unit.id}`,
        unitId: unit.id,
        unitNumber: unit.unitNumber,
        buildingName: unit.buildingName,
        clientName: unit.clientName,
        ownerUserId: existing?.ownerUserId ?? null,
        ownerName: existing?.ownerName ?? null,
        taskType: "installation",
        date: unit.installationDate,
        status: existing?.status ?? "not_started",
      });
    }
  }

  return normalized.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }) ||
      a.taskType.localeCompare(b.taskType)
  );
}

function mapManufacturer(r: ManufacturerRow): Manufacturer {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    authUserId: r.auth_user_id ?? null,
  };
}

function mapScheduler(r: SchedulerRow): Scheduler {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    authUserId: r.auth_user_id ?? null,
  };
}

export const loadFullDataset = cache(async (): Promise<AppDataset> => {
  const supabase = await createClient();

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

  // Optional tables — only exist after their migration is applied.
  const [manufacturersRes, schedulersRes] = await Promise.all([
    supabase.from("manufacturers").select("*").order("name"),
    supabase.from("schedulers").select("*").order("name"),
  ]);

  const coreResponses = [
    clientsRes,
    buildingsRes,
    unitsRes,
    roomsRes,
    windowsRes,
    installersRes,
    scheduleRes,
  ];
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

  const units = (unitsRes.data as UnitRow[]).map(mapUnit);
  const schedule = normalizeScheduleEntries(units, (scheduleRes.data as ScheduleRow[]).map(mapSchedule));

  return {
    clients: (clientsRes.data as ClientRow[]).map(mapClient),
    buildings: (buildingsRes.data as BuildingRow[]).map(mapBuilding),
    units,
    rooms: (roomsRes.data as RoomRow[]).map(mapRoom),
    windows: (windowsRes.data as WindowRow[]).map(mapWindow),
    installers: (installersRes.data as InstallerRow[]).map(mapInstaller),
    schedule,
    manufacturers: manufacturersRes.error
      ? []
      : (manufacturersRes.data as ManufacturerRow[])?.map(mapManufacturer) ?? [],
    schedulers: schedulersRes.error
      ? []
      : (schedulersRes.data as SchedulerRow[])?.map(mapScheduler) ?? [],
  };
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
    manufacturers: [],
    schedulers: [],
  };
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
 * Loads a dataset scoped to the buildings the current scheduler is allowed to see.
 * Returns an empty dataset if the scheduler has no building assignments.
 */
export async function loadSchedulerDataset(): Promise<AppDataset> {
  const user = await getCurrentUser();
  if (!user || user.role !== "scheduler") {
    return emptyDataset();
  }

  const schedulerId = await getLinkedSchedulerId(user.id);
  if (!schedulerId) return emptyDataset();

  const supabase = await createClient();

  const { data: accessRows } = await supabase
    .from("scheduler_building_access")
    .select("building_id")
    .eq("scheduler_id", schedulerId);

  const allowedBuildingIds = (accessRows ?? []).map(
    (r: { building_id: string }) => r.building_id
  );

  if (allowedBuildingIds.length === 0) return emptyDataset();

  const [buildingRows, unitRows, installerRows] = await Promise.all([
    supabase.from("buildings").select("*").in("id", allowedBuildingIds).order("name"),
    supabase.from("units").select("*").in("building_id", allowedBuildingIds).order("unit_number"),
    supabase.from("installers").select("*").order("name"),
  ]);

  const buildings = ((buildingRows.data as BuildingRow[]) ?? []).map(mapBuilding);
  const units = ((unitRows.data as UnitRow[]) ?? []).map(mapUnit);
  const installers = ((installerRows.data as InstallerRow[]) ?? []).map(mapInstaller);

  const allowedClientIds = [...new Set(buildings.map((b) => b.clientId))];
  const allowedUnitIds = units.map((u) => u.id);

  const [clientRows, roomRows, scheduleRows] = await Promise.all([
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

  const clients = ((clientRows.data as ClientRow[]) ?? []).map(mapClient);
  const rooms = ((roomRows.data as RoomRow[]) ?? []).map(mapRoom);

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
    manufacturers: [],
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
    createdAt: r.created_at,
    read: readSet.has(r.id),
  }));
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
