import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { AppDataset } from "@/lib/app-dataset";
import type {
  Building,
  Client,
  Installer,
  Notification,
  Room,
  ScheduleEntry,
  Unit,
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
  bracketing_date: string | null;
  installation_date: string | null;
  room_count: number;
  window_count: number;
  photos_uploaded: number;
  notes_count: number;
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
  task_type: "bracketing" | "installation";
  task_date: string;
  status: UnitStatus;
  risk_flag: RiskFlag;
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
    riskFlag: r.risk_flag,
    assignedInstallerId: r.assigned_installer_id,
    assignedInstallerName: r.assigned_installer_name,
    bracketingDate: r.bracketing_date,
    installationDate: r.installation_date,
    roomCount: r.room_count,
    windowCount: r.window_count,
    photosUploaded: r.photos_uploaded,
    notesCount: r.notes_count,
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
    width: r.width,
    height: r.height,
    depth: r.depth,
    blindWidth: r.blind_width,
    blindHeight: r.blind_height,
    blindDepth: r.blind_depth,
    notes: r.notes,
    riskFlag: r.risk_flag,
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
    taskType: r.task_type,
    date: r.task_date,
    status: r.status,
    riskFlag: r.risk_flag,
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

  const responses = [
    clientsRes,
    buildingsRes,
    unitsRes,
    roomsRes,
    windowsRes,
    installersRes,
    scheduleRes,
  ];
  const firstError = responses.find((r) => r.error)?.error;
  if (firstError) {
    const baseMessage = `Supabase: ${firstError.message}.`;
    if (/invalid api key/i.test(firstError.message)) {
      throw new Error(
        `${baseMessage} Update NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) in /Users/sergeikorolev/5. Vibe coding/260322-FSRblinds/.env.local and restart dev server.`
      );
    }
    throw new Error(
      `${baseMessage} Apply supabase/migrations in the SQL editor if tables are missing.`
    );
  }

  return {
    clients: (clientsRes.data as ClientRow[]).map(mapClient),
    buildings: (buildingsRes.data as BuildingRow[]).map(mapBuilding),
    units: (unitsRes.data as UnitRow[]).map(mapUnit),
    rooms: (roomsRes.data as RoomRow[]).map(mapRoom),
    windows: (windowsRes.data as WindowRow[]).map(mapWindow),
    installers: (installersRes.data as InstallerRow[]).map(mapInstaller),
    schedule: (scheduleRes.data as ScheduleRow[]).map(mapSchedule),
  };
});

export type InstallerMediaItem = {
  id: string;
  publicUrl: string;
  label: string | null;
  unitId: string;
  unitNumber: string | undefined;
  createdAt: string;
};

export async function loadInstallerMedia(
  installerId: string
): Promise<InstallerMediaItem[]> {
  const supabase = await createClient();
  const { data: units, error: ue } = await supabase
    .from("units")
    .select("id, unit_number")
    .eq("assigned_installer_id", installerId);
  if (ue) {
    throw new Error(ue.message);
  }
  const idMap = new Map((units ?? []).map((u) => [u.id, u.unit_number]));
  const unitIds = [...idMap.keys()];
  if (unitIds.length === 0) {
    return [];
  }
  const { data: media, error: me } = await supabase
    .from("media_uploads")
    .select("id, public_url, label, unit_id, created_at")
    .in("unit_id", unitIds)
    .order("created_at", { ascending: false });
  if (me) {
    throw new Error(
      `${me.message} Apply supabase/migrations/20250322140000_storage_and_media.sql if media_uploads is missing.`
    );
  }
  return (media ?? []).map((m) => ({
    id: m.id,
    publicUrl: m.public_url,
    label: m.label,
    unitId: m.unit_id,
    unitNumber: idMap.get(m.unit_id),
    createdAt: m.created_at,
  }));
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
