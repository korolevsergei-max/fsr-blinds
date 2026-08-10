/**
 * Pure mapper functions for converting Supabase row types into app domain types.
 * Shared between server-data.ts (server) and realtime sync (client).
 */
import type {
  Building,
  Client,
  CurrentStage,
  Cutter,
  Installer,
  ManufacturingPartner,
  Room,
  ScheduleEntry,
  Scheduler,
  Unit,
  UnitActivityLog,
  UnitStatus,
  Window,
  BlindType,
  RiskFlag,
  WindowInstallation,
  WandChain,
  FabricAdjustmentSide,
} from "./types";
import { INTERNAL_PARTNER_ID } from "./manufacturing-partners.ts";

// ── Row types (match Supabase column names) ──────────────────────────

export type ClientRow = {
  id: string;
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
};

export type BuildingRow = {
  id: string;
  client_id: string;
  name: string;
  address: string;
};

export type InstallerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar_url: string;
  auth_user_id?: string | null;
};

export type UnitRow = {
  id: string;
  building_id: string;
  client_id: string;
  client_name: string;
  building_name: string;
  unit_number: string;
  status: UnitStatus;
  /**
   * Pipeline stage derived from production truth (windows + window_production_status)
   * by the `unit_current_stages` view, returned by the owner/scheduler dataset RPCs.
   * `units.status` cannot express cutting/assembling, so without this the dashboards
   * count in-manufacturing units as Measured/Bracketed. Absent on the pre-migration
   * and chunked fallback paths — mapUnit then leaves `currentStage` unset and
   * getUnitCurrentStage() falls back to the status mapping.
   */
  current_stage?: CurrentStage | null;
  risk_flag: RiskFlag;
  assigned_installer_id: string | null;
  assigned_installer_name: string | null;
  measurement_date: string | null;
  bracketing_date: string | null;
  installation_date: string | null;
  /**
   * Day the unit actually became fully installed. Distinct from
   * installation_date, which is the SCHEDULED date. Optional because the
   * scheduler/installer dataset RPCs do not project it — only the owner
   * dataset does, and the Progress Report is owner-only.
   */
  installed_at?: string | null;
  earliest_bracketing_date: string | null;
  earliest_installation_date?: string | null;
  complete_by_date?: string | null;
  room_count: number;
  window_count: number;
  photos_uploaded: number;
  notes_count: number;
  created_at: string | null;
  assigned_at?: string | null;
  manufacturing_risk_flag?: RiskFlag | null;
  /**
   * Assigned manufacturing partner. Optional because the installer dataset RPC
   * does not project it; mapUnit then falls back to the internal partner, which
   * is the column's DB default and therefore always the right assumption.
   */
  manufacturing_partner_id?: string | null;
  /** NULL = no manufacturer has been chosen for this unit yet. */
  manufacturing_assigned_at?: string | null;
  /**
   * Derived by unit_manufacturing_locks (20260810140000). The safe default is
   * the OPPOSITE of the partner default: absent must read FALSE, so an old RPC
   * shape leaves the manufacturer picker usable rather than freezing every
   * unit. The DB trigger and server action are the real enforcement.
   */
  manufacturing_locked?: boolean | null;
  /** Only the scoped unit-detail loaders supply these; see Unit's doc comment. */
  manufacturing_lock_started_count?: number | null;
  manufacturing_lock_qc_count?: number | null;
};

export type UnitActivityLogRow = {
  id: string;
  unit_id: string;
  actor_role: string;
  actor_name: string;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type RoomRow = {
  id: string;
  unit_id: string;
  name: string;
  window_count: number;
  completed_windows: number;
};

export type WindowRow = {
  id: string;
  room_id: string;
  label: string;
  blind_type: BlindType;
  chain_side: "left" | "right" | null;
  width: number | null;
  height: number | null;
  depth: number | null;
  window_installation: WindowInstallation;
  wand_chain: number | null;
  fabric_adjustment_side: FabricAdjustmentSide;
  fabric_adjustment_inches: number | null;
  notes: string;
  risk_flag: RiskFlag;
  photo_url: string | null;
  measured: boolean;
  bracketed: boolean;
  installed: boolean;
};

export type ScheduleRow = {
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

export type CutterRow = {
  id: string;
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  auth_user_id?: string | null;
};

export type ManufacturingPartnerRow = {
  id: string;
  name: string;
  contact_name?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  is_internal?: boolean | null;
};

export type SchedulerRow = {
  id: string;
  name: string;
  email: string;
  phone: string;
  auth_user_id?: string | null;
};

// ── Mapper functions ─────────────────────────────────────────────────

export function mapClient(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
  };
}

export function mapBuilding(r: BuildingRow): Building {
  return {
    id: r.id,
    clientId: r.client_id,
    name: r.name,
    address: r.address,
  };
}

export function mapInstaller(r: InstallerRow): Installer {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    avatarUrl: r.avatar_url,
    authUserId: r.auth_user_id ?? null,
  };
}

export function mapUnit(
  r: UnitRow,
  schedulerName?: string | null,
  schedulerId?: string | null
): Unit {
  return {
    id: r.id,
    buildingId: r.building_id,
    clientId: r.client_id,
    clientName: r.client_name,
    buildingName: r.building_name,
    unitNumber: r.unit_number,
    status: r.status,
    // Only present on the RPC paths that select it; omitted (not undefined) otherwise
    // so the mapped shape stays identical on the fallback paths.
    ...(r.current_stage ? { currentStage: r.current_stage } : {}),
    assignedInstallerId: r.assigned_installer_id || (schedulerId ? `sch-${schedulerId}` : null),
    assignedInstallerName: r.assigned_installer_name || (schedulerName ? `SC: ${schedulerName}` : null),
    assignedSchedulerId: schedulerId ?? null,
    assignedSchedulerName: schedulerName ?? null,
    measurementDate: r.measurement_date || null,
    bracketingDate: r.bracketing_date,
    installationDate: r.installation_date || null,
    installedAt: r.installed_at || null,
    earliestBracketingDate: r.earliest_bracketing_date,
    earliestInstallationDate: r.earliest_installation_date || null,
    completeByDate: r.complete_by_date || null,
    roomCount: r.room_count ?? 0,
    windowCount: r.window_count,
    photosUploaded: r.photos_uploaded,
    notesCount: r.notes_count,
    createdAt: r.created_at,
    assignedAt: schedulerId ? r.assigned_at ?? null : null,
    manufacturingRiskFlag: r.manufacturing_risk_flag ?? undefined,
    manufacturingPartnerId: r.manufacturing_partner_id ?? INTERNAL_PARTNER_ID,
    manufacturingAssignedAt: r.manufacturing_assigned_at ?? null,
    manufacturingLocked: r.manufacturing_locked ?? false,
    // Left undefined rather than defaulted to 0: "no counts available here" and
    // "nothing has been built" must stay distinguishable, or a list route would
    // claim a locked unit has zero blinds at risk.
    manufacturingLockStartedCount: r.manufacturing_lock_started_count ?? undefined,
    manufacturingLockQcCount: r.manufacturing_lock_qc_count ?? undefined,
  };
}

export function mapActivityLog(r: UnitActivityLogRow): UnitActivityLog {
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

export function mapRoom(r: RoomRow): Room {
  return {
    id: r.id,
    unitId: r.unit_id,
    name: r.name,
    windowCount: r.window_count,
    completedWindows: r.completed_windows,
  };
}

export function mapWindow(r: WindowRow): Window {
  return {
    id: r.id,
    roomId: r.room_id,
    label: r.label,
    blindType: r.blind_type,
    chainSide: r.chain_side ?? null,
    riskFlag: r.risk_flag ?? "green",
    width: r.width,
    height: r.height,
    depth: r.depth,
    windowInstallation: r.window_installation ?? "inside",
    wandChain: (r.wand_chain as WandChain | null) ?? null,
    fabricAdjustmentSide: r.fabric_adjustment_side ?? "none",
    fabricAdjustmentInches: r.fabric_adjustment_inches ?? null,
    notes: r.notes || "",
    photoUrl: r.photo_url,
    measured: r.measured,
    bracketed: r.bracketed,
    installed: r.installed,
  };
}

export function mapSchedule(r: ScheduleRow): ScheduleEntry {
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

export function mapCutter(r: CutterRow): Cutter {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name,
    contactEmail: r.contact_email,
    contactPhone: r.contact_phone,
    authUserId: r.auth_user_id ?? null,
  };
}

export function mapManufacturingPartner(r: ManufacturingPartnerRow): ManufacturingPartner {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name ?? "",
    contactEmail: r.contact_email ?? "",
    contactPhone: r.contact_phone ?? "",
    isInternal: r.is_internal ?? false,
  };
}

export function mapScheduler(r: SchedulerRow): Scheduler {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    authUserId: r.auth_user_id ?? null,
  };
}

export function normalizeScheduleEntries(
  units: Unit[],
  schedule: ScheduleEntry[]
): ScheduleEntry[] {
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
        status: unit.status,
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
        status: unit.status,
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
        status: unit.status,
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
