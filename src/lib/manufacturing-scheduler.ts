import { createClient } from "@/lib/supabase/server";
import type {
  BlindType,
  ManufacturingCalendarOverride,
  ManufacturingIssueStatus,
  ManufacturingSettings,
  ProductionStatus,
  WindowManufacturingEscalation,
  WindowManufacturingSchedule,
} from "@/lib/types";
import {
  addWorkingDays,
  getOntarioHolidayName,
  isWorkingDay,
  listMonthDays,
} from "@/lib/manufacturing-calendar";
import {
  loadManufacturingEscalationHistoryByWindow,
  loadOpenManufacturingEscalationsByWindow,
} from "@/lib/manufacturing-escalations";

type SettingsRow = {
  id: string;
  cutter_daily_capacity: number;
  assembler_daily_capacity: number;
  qc_daily_capacity: number;
  apply_ontario_holidays: boolean;
};

type CalendarOverrideRow = {
  id: string;
  work_date: string;
  is_working: boolean;
  label: string;
};

type ScheduleRow = {
  id: string;
  window_id: string;
  unit_id: string;
  target_ready_date: string | null;
  scheduled_cut_date: string | null;
  scheduled_assembly_date: string | null;
  scheduled_qc_date: string | null;
  manual_priority: number | null;
  is_schedule_locked: boolean | null;
  lock_reason: string | null;
  last_reschedule_reason: string | null;
  over_capacity_override: boolean | null;
  moved_by_user_id: string | null;
  moved_at: string | null;
};

type UnitRow = {
  id: string;
  building_id: string;
  client_id: string;
  unit_number: string;
  building_name: string;
  client_name: string;
  installation_date: string | null;
  status: string;
};

type RoomRow = {
  id: string;
  unit_id: string;
  name: string;
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
  notes: string | null;
};

type ProductionRow = {
  id: string;
  window_id: string;
  unit_id: string;
  status: ProductionStatus;
  cut_at: string | null;
  assembled_at: string | null;
  qc_approved_at: string | null;
  issue_status: ManufacturingIssueStatus;
  issue_reason: string | null;
  issue_notes: string | null;
};

export type ManufacturingCalendarDay = {
  date: string;
  isCurrentMonth: boolean;
  isWorking: boolean;
  isWeekend: boolean;
  holidayName: string | null;
  override: ManufacturingCalendarOverride | null;
};

export interface ManufacturingWindowItem {
  windowId: string;
  unitId: string;
  buildingId: string;
  clientId: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  targetReadyDate: string | null;
  roomName: string;
  label: string;
  blindType: BlindType;
  width: number | null;
  height: number | null;
  depth: number | null;
  blindWidth: number | null;
  blindHeight: number | null;
  blindDepth: number | null;
  notes: string;
  productionStatus: ProductionStatus;
  issueStatus: ManufacturingIssueStatus;
  issueReason: string;
  issueNotes: string;
  escalation: WindowManufacturingEscalation | null;
  cutAt: string | null;
  assembledAt: string | null;
  qcApprovedAt: string | null;
  scheduledCutDate: string | null;
  scheduledAssemblyDate: string | null;
  scheduledQcDate: string | null;
  isScheduleLocked: boolean;
  overCapacityOverride: boolean;
}

export interface ManufacturingUnitCard {
  unitId: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  scheduledCount: number;
  blindTypeGroups: Array<{
    blindType: BlindType;
    windows: ManufacturingWindowItem[];
  }>;
}

export interface ManufacturingDayBucket {
  date: string | null;
  label: string;
  capacity: number;
  scheduledCount: number;
  isOverCapacity: boolean;
  units: ManufacturingUnitCard[];
}

export interface ManufacturingRoleSchedule {
  settings: ManufacturingSettings;
  currentWorkDate: string;
  todayCount: number;
  tomorrowCount: number;
  upcomingCount: number;
  issueCount: number;
  overdueCount: number;
  unscheduledCount: number;
  allItems: ManufacturingWindowItem[];
  buckets: ManufacturingDayBucket[];
}

export interface ManufacturingCompletedWindowItem extends ManufacturingWindowItem {
  escalationHistory: WindowManufacturingEscalation[];
  roleCompletedAt: string | null;
}

export interface ManufacturingCompletedRoleData {
  role: "cutter" | "assembler" | "qc";
  items: ManufacturingCompletedWindowItem[];
}

function getQueueWindowPriority(
  role: "cutter" | "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  if (item.issueStatus === "open" && item.escalation?.targetRole === role) return 0;
  if (item.issueStatus === "open") return 0;
  if (role === "cutter") {
    return item.productionStatus === "pending" ? 1 : 2;
  }
  if (role === "assembler") {
    return item.productionStatus === "cut" ? 1 : 2;
  }
  if (item.productionStatus === "assembled") return 1;
  return 3;
}

function isReturnedToRole(
  role: "cutter" | "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  return item.issueStatus === "open" && item.escalation?.targetRole === role;
}

function countQueueReadyWindows(
  role: "cutter" | "assembler" | "qc",
  windows: ManufacturingWindowItem[]
) {
  return windows.filter((item) => getQueueWindowPriority(role, item) < 3).length;
}

function sortQueueWindows(
  role: "cutter" | "assembler" | "qc",
  windows: ManufacturingWindowItem[]
) {
  return [...windows].sort((a, b) => {
    const priorityDiff = getQueueWindowPriority(role, a) - getQueueWindowPriority(role, b);
    if (priorityDiff !== 0) return priorityDiff;

    const readyDateA = a.targetReadyDate ?? "9999-12-31";
    const readyDateB = b.targetReadyDate ?? "9999-12-31";
    if (readyDateA !== readyDateB) return readyDateA.localeCompare(readyDateB);

    if (a.roomName !== b.roomName) return a.roomName.localeCompare(b.roomName);
    return a.label.localeCompare(b.label);
  });
}

function formatDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

function mapSettings(row: SettingsRow | null): ManufacturingSettings {
  return {
    id: row?.id ?? "default",
    cutterDailyCapacity: row?.cutter_daily_capacity ?? 30,
    assemblerDailyCapacity: row?.assembler_daily_capacity ?? 30,
    qcDailyCapacity: row?.qc_daily_capacity ?? 30,
    applyOntarioHolidays: row?.apply_ontario_holidays ?? false,
  };
}

function mapOverride(row: CalendarOverrideRow): ManufacturingCalendarOverride {
  return {
    id: row.id,
    workDate: row.work_date,
    isWorking: row.is_working,
    label: row.label ?? "",
  };
}

function mapSchedule(row: ScheduleRow): WindowManufacturingSchedule {
  return {
    id: row.id,
    windowId: row.window_id,
    unitId: row.unit_id,
    targetReadyDate: row.target_ready_date,
    scheduledCutDate: row.scheduled_cut_date,
    scheduledAssemblyDate: row.scheduled_assembly_date,
    scheduledQcDate: row.scheduled_qc_date,
    manualPriority: row.manual_priority ?? 0,
    isScheduleLocked: row.is_schedule_locked ?? false,
    lockReason: row.lock_reason ?? "",
    lastRescheduleReason: row.last_reschedule_reason ?? "",
    overCapacityOverride: row.over_capacity_override ?? false,
    movedByUserId: row.moved_by_user_id ?? null,
    movedAt: row.moved_at ?? null,
  };
}

async function getSettingsAndOverrides() {
  const supabase = await createClient();
  const [settingsRes, overridesRes] = await Promise.all([
    supabase.from("manufacturing_settings").select("*").eq("id", "default").maybeSingle(),
    supabase
      .from("manufacturing_calendar_overrides")
      .select("id, work_date, is_working, label")
      .order("work_date"),
  ]);

  const settings = mapSettings((settingsRes.data as SettingsRow | null) ?? null);
  const overrides = new Map<string, ManufacturingCalendarOverride>();
  for (const row of (overridesRes.data as CalendarOverrideRow[] | null) ?? []) {
    const mapped = mapOverride(row);
    overrides.set(mapped.workDate, mapped);
  }

  return { supabase, settings, overrides };
}

function todayKey(): string {
  return formatDateKey(new Date());
}

function getCurrentWorkDate(
  settings: ManufacturingSettings,
  overrides: Map<string, ManufacturingCalendarOverride>
): string {
  const today = todayKey();
  return isWorkingDay(today, settings, overrides)
    ? today
    : addWorkingDays(today, 1, settings, overrides);
}

function findLatestWorkingDayWithCapacity(
  latestDate: string,
  capacity: number,
  loadMap: Map<string, number>,
  settings: ManufacturingSettings,
  overrides: Map<string, ManufacturingCalendarOverride>,
  requiredSlots: number,
  floorDate: string
): string | null {
  if (capacity <= 0) return null;

  let cursor = latestDate < floorDate ? floorDate : latestDate;
  for (let i = 0; i < 370; i += 1) {
    if (cursor < floorDate) return null;
    if (isWorkingDay(cursor, settings, overrides)) {
      const load = loadMap.get(cursor) ?? 0;
      if (load + requiredSlots <= capacity) {
        return cursor;
      }
    }
    const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
    if (nextCursor < floorDate) return null;
    cursor = nextCursor;
  }
  return null;
}

function pushLoad(loadMap: Map<string, number>, date: string | null) {
  if (!date) return;
  loadMap.set(date, (loadMap.get(date) ?? 0) + 1);
}

function buildBlindSortKey(win: WindowRow): string {
  return `${win.blind_type}:${win.label}`;
}

export async function reflowManufacturingSchedules(reason = "system_reflow"): Promise<void> {
  const { supabase, settings, overrides } = await getSettingsAndOverrides();
  const currentWorkDate = getCurrentWorkDate(settings, overrides);

  const { data: unitRows } = await supabase
    .from("units")
    .select("id, building_id, client_id, unit_number, building_name, client_name, installation_date, status")
    .in("status", ["measured", "bracketed", "manufactured", "measured_and_bracketed"])
    .order("installation_date", { ascending: true, nullsFirst: false })
    .order("unit_number");

  const units = (unitRows as UnitRow[] | null) ?? [];
  if (units.length === 0) {
    return;
  }

  const unitIds = units.map((unit) => unit.id);
  const { data: roomRows } = await supabase
    .from("rooms")
    .select("id, unit_id, name")
    .in("unit_id", unitIds)
    .order("name");
  const rooms = (roomRows as RoomRow[] | null) ?? [];
  const roomIds = rooms.map((room) => room.id);

  const [windowRows, productionRows, scheduleRows] = await Promise.all([
    roomIds.length > 0
      ? supabase
          .from("windows")
          .select("id, room_id, label, blind_type, width, height, depth, blind_width, blind_height, blind_depth, notes")
          .in("room_id", roomIds)
          .order("label")
      : Promise.resolve({ data: [] as WindowRow[] }),
    supabase
      .from("window_production_status")
      .select("id, window_id, unit_id, status, cut_at, assembled_at, qc_approved_at, issue_status, issue_reason, issue_notes")
      .in("unit_id", unitIds),
    supabase
      .from("window_manufacturing_schedule")
      .select("*")
      .in("unit_id", unitIds),
  ]);

  const windows = (windowRows.data as WindowRow[] | null) ?? [];
  const productions = (productionRows.data as ProductionRow[] | null) ?? [];
  const schedules = (scheduleRows.data as ScheduleRow[] | null) ?? [];

  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const productionByWindow = new Map(productions.map((row) => [row.window_id, row]));
  const scheduleByWindow = new Map(
    schedules.map((row) => [row.window_id, mapSchedule(row)])
  );

  type Candidate = {
    window: WindowRow;
    unit: UnitRow;
    targetReadyDate: string | null;
    production: ProductionRow | null;
    existing: WindowManufacturingSchedule | null;
    scheduledQcDate: string | null;
    scheduledAssemblyDate: string | null;
    scheduledCutDate: string | null;
  };

  const candidatesByUnit = new Map<string, Candidate[]>();
  const qcLoad = new Map<string, number>();
  const assemblyLoad = new Map<string, number>();
  const cutLoad = new Map<string, number>();
  const upserts = new Map<string, Record<string, unknown>>();

  for (const unit of units) {
    candidatesByUnit.set(unit.id, []);
  }

  for (const window of windows) {
    const room = roomById.get(window.room_id);
    if (!room) continue;
    const unit = units.find((item) => item.id === room.unit_id);
    if (!unit) continue;

    const production = productionByWindow.get(window.id) ?? null;
    const existing = scheduleByWindow.get(window.id) ?? null;
    const targetReadyDate = unit.installation_date
      ? addWorkingDays(unit.installation_date, -3, settings, overrides)
      : null;

    let scheduledQcDate = existing?.scheduledQcDate ?? targetReadyDate;
    let scheduledAssemblyDate = existing?.scheduledAssemblyDate ?? null;
    let scheduledCutDate = existing?.scheduledCutDate ?? null;

    if (production?.status === "cut" || production?.status === "assembled" || production?.status === "qc_approved") {
      scheduledCutDate = production.cut_at?.slice(0, 10) ?? scheduledCutDate;
    }
    if (production?.status === "assembled") {
      scheduledAssemblyDate = production.assembled_at?.slice(0, 10) ?? scheduledAssemblyDate;
    }
    if (production?.status === "qc_approved") {
      scheduledQcDate = production.qc_approved_at?.slice(0, 10) ?? scheduledQcDate;
      scheduledAssemblyDate =
        production.assembled_at?.slice(0, 10) ??
        scheduledAssemblyDate;
    }

    if (scheduledQcDate && production?.status !== "qc_approved" && scheduledQcDate < currentWorkDate) {
      scheduledQcDate = currentWorkDate;
    }
    if (
      scheduledAssemblyDate &&
      production?.status !== "assembled" &&
      production?.status !== "qc_approved" &&
      scheduledAssemblyDate < currentWorkDate
    ) {
      scheduledAssemblyDate = currentWorkDate;
    }
    if (scheduledCutDate && (production?.status ?? "pending") === "pending" && scheduledCutDate < currentWorkDate) {
      scheduledCutDate = currentWorkDate;
    }

    const candidate: Candidate = {
      window,
      unit,
      targetReadyDate,
      production,
      existing,
      scheduledQcDate,
      scheduledAssemblyDate,
      scheduledCutDate,
    };
    candidatesByUnit.get(unit.id)?.push(candidate);

    if (existing?.isScheduleLocked && scheduledQcDate && production?.status !== "qc_approved") {
      pushLoad(qcLoad, scheduledQcDate);
    }
    if (existing?.isScheduleLocked && scheduledAssemblyDate && production?.status !== "qc_approved") {
      pushLoad(assemblyLoad, scheduledAssemblyDate);
    }
    if (existing?.isScheduleLocked && scheduledCutDate && production?.status === "pending") {
      pushLoad(cutLoad, scheduledCutDate);
    }
  }

  const qcCandidates = [...candidatesByUnit.values()]
    .map((items) =>
      items
        .filter((item) => {
          const status = item.production?.status ?? "pending";
          return status !== "qc_approved";
        })
        .sort((a, b) => buildBlindSortKey(a.window).localeCompare(buildBlindSortKey(b.window)))
    )
    .filter((items) => items.length > 0)
    .sort((a, b) => {
      const aDate = a[0]?.targetReadyDate ?? "9999-12-31";
      const bDate = b[0]?.targetReadyDate ?? "9999-12-31";
      if (aDate !== bDate) return aDate.localeCompare(bDate);
      return a[0].unit.unit_number.localeCompare(b[0].unit.unit_number);
    });

  for (const group of qcCandidates) {
    const unlocked = group.filter((item) => !item.existing?.isScheduleLocked);
    if (unlocked.length === 0) continue;

    const latestDate = group[0].targetReadyDate;
    if (!latestDate) continue;

    const sameDay = findLatestWorkingDayWithCapacity(
      latestDate,
      settings.qcDailyCapacity,
      qcLoad,
      settings,
      overrides,
      unlocked.length,
      currentWorkDate
    );

    if (sameDay) {
      for (const item of unlocked) {
        item.scheduledQcDate = sameDay;
        pushLoad(qcLoad, sameDay);
      }
      continue;
    }

    const remaining = [...unlocked];
    let cursor = latestDate < currentWorkDate ? currentWorkDate : latestDate;
    while (remaining.length > 0) {
      if (!isWorkingDay(cursor, settings, overrides)) {
        const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
        if (nextCursor < currentWorkDate) break;
        cursor = nextCursor;
        continue;
      }
      const used = qcLoad.get(cursor) ?? 0;
      const available = Math.max(0, settings.qcDailyCapacity - used);
      if (available === 0) {
        const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
        if (nextCursor < currentWorkDate) break;
        cursor = nextCursor;
        continue;
      }
      const take = remaining.splice(0, available);
      for (const item of take) {
        item.scheduledQcDate = cursor;
        pushLoad(qcLoad, cursor);
      }
      const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
      if (nextCursor < currentWorkDate) break;
      cursor = nextCursor;
    }
  }

  const assemblyCandidateGroups = [...candidatesByUnit.values()]
    .flatMap((items) => {
      const readyForAssembly = items.filter((item) => {
        const status = item.production?.status ?? "pending";
        return status !== "assembled" && status !== "qc_approved";
      });
      const byQcDate = new Map<string, Candidate[]>();
      for (const item of readyForAssembly) {
        const key = item.scheduledQcDate ?? "__unscheduled__";
        const list = byQcDate.get(key) ?? [];
        list.push(item);
        byQcDate.set(key, list);
      }
      return [...byQcDate.entries()]
        .filter(([qcDate, rows]) => qcDate !== "__unscheduled__" && rows.length > 0)
        .map(([qcDate, rows]) => ({
          qcDate,
          rows: rows.sort((a, b) => buildBlindSortKey(a.window).localeCompare(buildBlindSortKey(b.window))),
        }));
    })
    .sort((a, b) => a.qcDate.localeCompare(b.qcDate));

  for (const group of assemblyCandidateGroups) {
    const unlocked = group.rows.filter((item) => !item.existing?.isScheduleLocked);
    if (unlocked.length === 0) continue;

    const latestAssemblyDate = addWorkingDays(group.qcDate, -1, settings, overrides);
    const sameDay = findLatestWorkingDayWithCapacity(
      latestAssemblyDate,
      settings.assemblerDailyCapacity,
      assemblyLoad,
      settings,
      overrides,
      unlocked.length,
      currentWorkDate
    );

    if (sameDay) {
      for (const item of unlocked) {
        item.scheduledAssemblyDate = sameDay;
        pushLoad(assemblyLoad, sameDay);
      }
      continue;
    }

    const remaining = [...unlocked];
    let cursor = latestAssemblyDate < currentWorkDate ? currentWorkDate : latestAssemblyDate;
    while (remaining.length > 0) {
      if (!isWorkingDay(cursor, settings, overrides)) {
        const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
        if (nextCursor < currentWorkDate) break;
        cursor = nextCursor;
        continue;
      }
      const used = assemblyLoad.get(cursor) ?? 0;
      const available = Math.max(0, settings.assemblerDailyCapacity - used);
      if (available === 0) {
        const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
        if (nextCursor < currentWorkDate) break;
        cursor = nextCursor;
        continue;
      }
      const take = remaining.splice(0, available);
      for (const item of take) {
        item.scheduledAssemblyDate = cursor;
        pushLoad(assemblyLoad, cursor);
      }
      const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
      if (nextCursor < currentWorkDate) break;
      cursor = nextCursor;
    }
  }

  const cutCandidateGroups = [...candidatesByUnit.values()]
    .flatMap((items) => {
      const pending = items.filter((item) => (item.production?.status ?? "pending") === "pending");
      const byAssemblyDate = new Map<string, Candidate[]>();
      for (const item of pending) {
        const key = item.scheduledAssemblyDate ?? "__unscheduled__";
        const list = byAssemblyDate.get(key) ?? [];
        list.push(item);
        byAssemblyDate.set(key, list);
      }
      return [...byAssemblyDate.entries()]
        .filter(([assemblyDate, rows]) => assemblyDate !== "__unscheduled__" && rows.length > 0)
        .map(([assemblyDate, rows]) => ({
          assemblyDate,
          rows: rows.sort((a, b) => buildBlindSortKey(a.window).localeCompare(buildBlindSortKey(b.window))),
        }));
    })
    .sort((a, b) => a.assemblyDate.localeCompare(b.assemblyDate));

  for (const group of cutCandidateGroups) {
    const unlocked = group.rows.filter((item) => !item.existing?.isScheduleLocked);
    if (unlocked.length === 0) continue;

    const latestCutDate = addWorkingDays(group.assemblyDate, -1, settings, overrides);
    const sameDay = findLatestWorkingDayWithCapacity(
      latestCutDate,
      settings.cutterDailyCapacity,
      cutLoad,
      settings,
      overrides,
      unlocked.length,
      currentWorkDate
    );

    if (sameDay) {
      for (const item of unlocked) {
        item.scheduledCutDate = sameDay;
        pushLoad(cutLoad, sameDay);
      }
      continue;
    }

    const remaining = [...unlocked];
    let cursor = latestCutDate < currentWorkDate ? currentWorkDate : latestCutDate;
    while (remaining.length > 0) {
      if (!isWorkingDay(cursor, settings, overrides)) {
        const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
        if (nextCursor < currentWorkDate) break;
        cursor = nextCursor;
        continue;
      }
      const used = cutLoad.get(cursor) ?? 0;
      const available = Math.max(0, settings.cutterDailyCapacity - used);
      if (available === 0) {
        const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
        if (nextCursor < currentWorkDate) break;
        cursor = nextCursor;
        continue;
      }
      const take = remaining.splice(0, available);
      for (const item of take) {
        item.scheduledCutDate = cursor;
        pushLoad(cutLoad, cursor);
      }
      const nextCursor = addWorkingDays(cursor, -1, settings, overrides);
      if (nextCursor < currentWorkDate) break;
      cursor = nextCursor;
    }
  }

  for (const unitCandidates of candidatesByUnit.values()) {
    for (const item of unitCandidates) {
      const production = item.production;
      const existing = item.existing;
      upserts.set(item.window.id, {
        id: existing?.id ?? `mfg-${crypto.randomUUID().slice(0, 8)}`,
        window_id: item.window.id,
        unit_id: item.unit.id,
        target_ready_date: item.targetReadyDate,
        scheduled_cut_date: item.scheduledCutDate,
        scheduled_assembly_date: item.scheduledAssemblyDate,
        scheduled_qc_date: item.scheduledQcDate,
        manual_priority: existing?.manualPriority ?? 0,
        is_schedule_locked: existing?.isScheduleLocked ?? false,
        lock_reason: existing?.lockReason ?? "",
        last_reschedule_reason: existing?.isScheduleLocked
          ? existing.lastRescheduleReason
          : reason,
        over_capacity_override: existing?.overCapacityOverride ?? false,
        moved_by_user_id: existing?.movedByUserId,
        moved_at: existing?.movedAt,
      });
    }
  }

  if (upserts.size > 0) {
    await supabase
      .from("window_manufacturing_schedule")
      .upsert([...upserts.values()], { onConflict: "window_id" });
  }
}

export async function loadManufacturingSettings(): Promise<{
  settings: ManufacturingSettings;
  overrides: ManufacturingCalendarOverride[];
}> {
  const { settings, overrides } = await getSettingsAndOverrides();
  return { settings, overrides: [...overrides.values()] };
}

export async function buildManufacturingCalendarMonth(
  year: number,
  monthIndex: number
): Promise<ManufacturingCalendarDay[]> {
  const { settings, overrides } = await getSettingsAndOverrides();
  return listMonthDays(year, monthIndex).map((date) => ({
    date,
    isCurrentMonth: parseDateKey(date).getMonth() === monthIndex,
    isWorking: isWorkingDay(date, settings, overrides),
    isWeekend: [0, 6].includes(parseDateKey(date).getDay()),
    holidayName: settings.applyOntarioHolidays ? getOntarioHolidayName(date) : null,
    override: overrides.get(date) ?? null,
  }));
}

export async function loadManufacturingRoleSchedule(
  role: "cutter" | "assembler" | "qc"
): Promise<ManufacturingRoleSchedule> {
  await reflowManufacturingSchedules("load_queue");
  const { supabase, settings, overrides } = await getSettingsAndOverrides();
  const currentWorkDate = getCurrentWorkDate(settings, overrides);
  const { data: scheduleRows } = await supabase
    .from("window_manufacturing_schedule")
    .select("*")
    .order(
      role === "cutter"
        ? "scheduled_cut_date"
        : role === "assembler"
          ? "scheduled_assembly_date"
          : "scheduled_qc_date",
      { ascending: true, nullsFirst: false }
    );

  const schedules = (scheduleRows as ScheduleRow[] | null) ?? [];
  const unitIds = [...new Set(schedules.map((row) => row.unit_id))];
  const windowIds = [...new Set(schedules.map((row) => row.window_id))];

  const [unitRows, windowRows, productionRows, escalationByWindow] = await Promise.all([
    unitIds.length > 0
      ? supabase
          .from("units")
          .select("id, building_id, client_id, unit_number, building_name, client_name, installation_date, status")
          .in("id", unitIds)
      : Promise.resolve({ data: [] as UnitRow[] }),
    windowIds.length > 0
      ? supabase
          .from("windows")
          .select("id, room_id, label, blind_type, width, height, depth, blind_width, blind_height, blind_depth, notes")
          .in("id", windowIds)
      : Promise.resolve({ data: [] as WindowRow[] }),
    windowIds.length > 0
      ? supabase
          .from("window_production_status")
          .select("window_id, status, issue_status, issue_reason, issue_notes, cut_at, assembled_at, qc_approved_at")
          .in("window_id", windowIds)
      : Promise.resolve({
          data: [] as Array<{
            window_id: string;
            status: ProductionStatus;
            issue_status: ManufacturingIssueStatus;
            issue_reason: string | null;
            issue_notes: string | null;
            cut_at: string | null;
            assembled_at: string | null;
            qc_approved_at: string | null;
          }>,
        }),
    loadOpenManufacturingEscalationsByWindow(supabase, windowIds),
  ]);

  const windows = (windowRows.data as WindowRow[] | null) ?? [];
  const roomIds = [...new Set(windows.map((window) => window.room_id))];
  const roomRows = roomIds.length > 0
    ? await supabase.from("rooms").select("id, name").in("id", roomIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const items: ManufacturingWindowItem[] = [];
  const roleDateKey =
    role === "cutter"
      ? "scheduledCutDate"
      : role === "assembler"
        ? "scheduledAssemblyDate"
        : "scheduledQcDate";
  const unitsById = new Map(((unitRows.data as UnitRow[] | null) ?? []).map((unit) => [unit.id, unit]));
  const windowsById = new Map(windows.map((window) => [window.id, window]));
  const roomsById = new Map((((roomRows.data as Array<{ id: string; name: string }> | null) ?? [])).map((room) => [room.id, room]));
  const productionByWindow = new Map(
    ((((productionRows.data as Array<{
      window_id: string;
      status: ProductionStatus;
      issue_status: ManufacturingIssueStatus;
      issue_reason: string | null;
      issue_notes: string | null;
      cut_at: string | null;
      assembled_at: string | null;
      qc_approved_at: string | null;
    }> | null) ?? []))).map((production) => [production.window_id, production])
  );

  const allItems: ManufacturingWindowItem[] = [];
  for (const row of schedules) {
    const unit = unitsById.get(row.unit_id);
    const window = windowsById.get(row.window_id);
    if (!unit || !window) continue;
    const production = productionByWindow.get(row.window_id);
    const roomName = roomsById.get(window.room_id)?.name ?? "Room";
    const productionStatus = production?.status ?? "pending";
    const issueStatus = production?.issue_status ?? "none";
    const escalation = escalationByWindow.get(row.window_id) ?? null;

    const item: ManufacturingWindowItem = {
      windowId: row.window_id,
      unitId: row.unit_id,
      buildingId: unit.building_id,
      clientId: unit.client_id,
      unitNumber: unit.unit_number,
      buildingName: unit.building_name,
      clientName: unit.client_name,
      installationDate: unit.installation_date,
      targetReadyDate: row.target_ready_date,
      roomName,
      label: window.label,
      blindType: window.blind_type,
      width: window.width,
      height: window.height,
      depth: window.depth,
      blindWidth: window.blind_width,
      blindHeight: window.blind_height,
      blindDepth: window.blind_depth,
      notes: window.notes ?? "",
      productionStatus,
      issueStatus,
      issueReason: production?.issue_reason ?? "",
      issueNotes: production?.issue_notes ?? "",
      escalation,
      cutAt: production?.cut_at ?? null,
      assembledAt: production?.assembled_at ?? null,
      qcApprovedAt: production?.qc_approved_at ?? null,
      scheduledCutDate: row.scheduled_cut_date,
      scheduledAssemblyDate: row.scheduled_assembly_date,
      scheduledQcDate: row.scheduled_qc_date,
      isScheduleLocked: row.is_schedule_locked ?? false,
      overCapacityOverride: row.over_capacity_override ?? false,
    };
    allItems.push(item);

    if (role === "cutter" && productionStatus !== "pending") {
      continue;
    }
    if (role === "assembler" && productionStatus !== "cut") {
      continue;
    }
    if (role === "qc" && productionStatus !== "assembled") {
      continue;
    }

    items.push(item);
  }

  const today = currentWorkDate;
  const tomorrow = addWorkingDays(today, 1, settings, overrides);
  const capacity =
    role === "cutter"
      ? settings.cutterDailyCapacity
      : role === "assembler"
        ? settings.assemblerDailyCapacity
        : settings.qcDailyCapacity;

  const byBucket = new Map<string, ManufacturingWindowItem[]>();
  for (const item of items) {
    const rawDate = item[roleDateKey];
    const date = rawDate && rawDate < currentWorkDate ? currentWorkDate : rawDate;
    if (isReturnedToRole(role, item)) {
      const list = byBucket.get("__returned__") ?? [];
      list.push(item);
      byBucket.set("__returned__", list);
      continue;
    }
    if (item.issueStatus === "open") {
      const list = byBucket.get("__issues__") ?? [];
      list.push(item);
      byBucket.set("__issues__", list);
      continue;
    }
    if (!date) {
      const list = byBucket.get("__unscheduled__") ?? [];
      list.push(item);
      byBucket.set("__unscheduled__", list);
      continue;
    }
    const list = byBucket.get(date) ?? [];
    list.push(item);
    byBucket.set(date, list);
  }

  const orderedKeys = [...byBucket.keys()].sort((a, b) => {
    const specialOrder = ["__returned__", "__issues__", "__unscheduled__"];
    const aIdx = specialOrder.indexOf(a);
    const bIdx = specialOrder.indexOf(b);
    if (aIdx >= 0 || bIdx >= 0) {
      if (aIdx === -1) return -1;
      if (bIdx === -1) return 1;
      return aIdx - bIdx;
    }
    return a.localeCompare(b);
  });

  const buckets: ManufacturingDayBucket[] = orderedKeys.map((key) => {
    const bucketItems = [...(byBucket.get(key) ?? [])];
    const unitsMap = new Map<string, ManufacturingUnitCard>();
    for (const item of bucketItems) {
      const existing = unitsMap.get(item.unitId);
      if (!existing) {
        unitsMap.set(item.unitId, {
          unitId: item.unitId,
          unitNumber: item.unitNumber,
          buildingName: item.buildingName,
          clientName: item.clientName,
          installationDate: item.installationDate,
          scheduledCount: 1,
          blindTypeGroups: [{ blindType: item.blindType, windows: [item] }],
        });
        continue;
      }
      existing.scheduledCount += 1;
      const group = existing.blindTypeGroups.find((entry) => entry.blindType === item.blindType);
      if (group) {
        group.windows.push(item);
      } else {
        existing.blindTypeGroups.push({ blindType: item.blindType, windows: [item] });
      }
    }

    const units = [...unitsMap.values()]
      .map((unit) => ({
        ...unit,
        blindTypeGroups: [...unit.blindTypeGroups]
          .map((group) => ({
            ...group,
            windows: sortQueueWindows(role, group.windows),
          }))
          .sort((a, b) => {
            const aReady = countQueueReadyWindows(role, a.windows);
            const bReady = countQueueReadyWindows(role, b.windows);
            if (aReady !== bReady) return bReady - aReady;

            const aPriority = Math.min(...a.windows.map((window) => getQueueWindowPriority(role, window)));
            const bPriority = Math.min(...b.windows.map((window) => getQueueWindowPriority(role, window)));
            if (aPriority !== bPriority) return aPriority - bPriority;

            return a.blindType.localeCompare(b.blindType);
          }),
      }))
      .sort((a, b) => {
        const aWindows = a.blindTypeGroups.flatMap((group) => group.windows);
        const bWindows = b.blindTypeGroups.flatMap((group) => group.windows);
        const aPriority = Math.min(...aWindows.map((window) => getQueueWindowPriority(role, window)));
        const bPriority = Math.min(...bWindows.map((window) => getQueueWindowPriority(role, window)));
        if (aPriority !== bPriority) return aPriority - bPriority;

        const aReady = countQueueReadyWindows(role, aWindows);
        const bReady = countQueueReadyWindows(role, bWindows);
        if (aReady !== bReady) return bReady - aReady;

        return a.unitNumber.localeCompare(b.unitNumber);
      });

    return {
      date: key.startsWith("__") ? null : key,
      label:
        key === "__returned__"
          ? "Returned"
          : key === "__issues__"
          ? "Issues"
          : key === "__unscheduled__"
          ? "Unscheduled"
          : key === today
          ? "Today"
          : key === tomorrow
          ? "Next Working Day"
          : key,
      capacity,
      scheduledCount: bucketItems.length,
      isOverCapacity: !key.startsWith("__") && bucketItems.length > capacity,
      units,
    };
  });

  const datedBuckets = buckets.filter((bucket) => bucket.date);
  const issueCount = byBucket.get("__issues__")?.length ?? 0;
  const unscheduledCount = byBucket.get("__unscheduled__")?.length ?? 0;
  const overdueCount = datedBuckets
    .filter((bucket) => bucket.date !== null && bucket.date < today)
    .reduce((sum, bucket) => sum + bucket.scheduledCount, 0);

  return {
    settings,
    currentWorkDate,
    todayCount: buckets.find((bucket) => bucket.date === today)?.scheduledCount ?? 0,
    tomorrowCount: buckets.find((bucket) => bucket.date === tomorrow)?.scheduledCount ?? 0,
    upcomingCount: datedBuckets
      .filter((bucket) => bucket.date !== null && bucket.date > tomorrow)
      .reduce((sum, bucket) => sum + bucket.scheduledCount, 0),
    issueCount,
    overdueCount,
    unscheduledCount,
    allItems,
    buckets,
  };
}

function getRoleCompletedAt(
  role: "cutter" | "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  return role === "cutter"
    ? item.cutAt
    : role === "assembler"
      ? item.assembledAt
      : item.qcApprovedAt;
}

function isCompletedForRole(
  role: "cutter" | "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  if (role === "cutter") {
    return item.productionStatus === "cut" || item.productionStatus === "assembled" || item.productionStatus === "qc_approved";
  }
  if (role === "assembler") {
    return item.productionStatus === "assembled" || item.productionStatus === "qc_approved";
  }
  return item.productionStatus === "qc_approved";
}

function compareCompletedItems(a: ManufacturingCompletedWindowItem, b: ManufacturingCompletedWindowItem) {
  const aCompleted = a.roleCompletedAt ?? "";
  const bCompleted = b.roleCompletedAt ?? "";
  if (aCompleted !== bCompleted) return bCompleted.localeCompare(aCompleted);

  if (a.installationDate !== b.installationDate) {
    if (!a.installationDate) return 1;
    if (!b.installationDate) return -1;
    return a.installationDate.localeCompare(b.installationDate);
  }

  const unitCompare = a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true });
  if (unitCompare !== 0) return unitCompare;
  const roomCompare = a.roomName.localeCompare(b.roomName, undefined, { numeric: true });
  if (roomCompare !== 0) return roomCompare;
  return a.label.localeCompare(b.label, undefined, { numeric: true });
}

export async function loadManufacturingCompletedRoleData(
  role: "cutter" | "assembler" | "qc"
): Promise<ManufacturingCompletedRoleData> {
  const schedule = await loadManufacturingRoleSchedule(role);
  const supabase = await createClient();
  const windowIds = schedule.allItems.map((item) => item.windowId);
  const escalationHistoryByWindow = await loadManufacturingEscalationHistoryByWindow(supabase, windowIds);

  const items = schedule.allItems
    .filter((item) => isCompletedForRole(role, item))
    .map((item) => ({
      ...item,
      escalationHistory: escalationHistoryByWindow.get(item.windowId) ?? [],
      roleCompletedAt: getRoleCompletedAt(role, item),
    }))
    .sort(compareCompletedItems);

  return {
    role,
    items,
  };
}
