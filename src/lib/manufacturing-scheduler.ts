import { createClient } from "@/lib/supabase/server";
import type {
  BlindType,
  ChainSide,
  FabricAdjustmentSide,
  ManufacturingCalendarOverride,
  ManufacturingIssueStatus,
  ManufacturingSettings,
  ProductionStatus,
  WandChain,
  WindowInstallation,
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
import { selectInChunks } from "@/lib/supabase-chunking";
import {
  buildRoleScheduleOutput,
  countQueueReadyWindows,
  getQueueWindowPriority,
  isReworkPriority,
  sortQueueWindows,
} from "@/lib/manufacturing-queue-core";
import type {
  ManufacturingDayBucket,
  ManufacturingRoleSchedule,
  ManufacturingUnitCard,
  ManufacturingWindowItem,
} from "@/lib/manufacturing-queue-core";
export type {
  ManufacturingDayBucket,
  ManufacturingRoleSchedule,
  ManufacturingUnitCard,
  ManufacturingWindowItem,
} from "@/lib/manufacturing-queue-core";
export { buildRoleScheduleOutput } from "@/lib/manufacturing-queue-core";

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
  complete_by_date: string | null;
  status: string;
  all_measured_at: string | null;
  production_entered_at: string | null;
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
  notes: string | null;
  window_installation: string | null;
  wand_chain: number | null;
  fabric_adjustment_side: string | null;
  fabric_adjustment_inches: number | null;
  chain_side: string | null;
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

export interface ManufacturingCompletedWindowItem extends ManufacturingWindowItem {
  escalationHistory: WindowManufacturingEscalation[];
  roleCompletedAt: string | null;
}

export interface ManufacturingCompletedRoleData {
  role: "cutter" | "assembler" | "qc";
  items: ManufacturingCompletedWindowItem[];
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

function getUnitManufacturingDueDate(unit: Pick<UnitRow, "installation_date" | "complete_by_date">): string | null {
  return unit.installation_date ?? unit.complete_by_date ?? null;
}

function getWindowManufacturingDueDate(
  item: Pick<ManufacturingWindowItem, "installationDate" | "completeByDate">
): string | null {
  return item.installationDate ?? item.completeByDate ?? null;
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
    .select("id, building_id, client_id, unit_number, building_name, client_name, installation_date, complete_by_date, status")
    .in("status", ["measured", "bracketed", "manufactured"])
    .order("installation_date", { ascending: true, nullsFirst: false })
    .order("unit_number");

  const units = (unitRows as UnitRow[] | null) ?? [];
  if (units.length === 0) {
    return;
  }

  const unitIds = units.map((unit) => unit.id);
  const rooms = await selectInChunks<RoomRow>(unitIds, (chunk) =>
    supabase
      .from("rooms")
      .select("id, unit_id, name")
      .in("unit_id", chunk)
      .order("name")
      .then((res) => ({ data: res.data as RoomRow[] | null, error: res.error })),
  );
  const roomIds = rooms.map((room) => room.id);

  const [windows, productions, schedules] = await Promise.all([
    selectInChunks<WindowRow>(roomIds, (chunk) =>
      supabase
        .from("windows")
        .select("id, room_id, label, blind_type, width, height, depth, notes")
        .in("room_id", chunk)
        .order("label")
        .then((res) => ({ data: res.data as WindowRow[] | null, error: res.error })),
    ),
    selectInChunks<ProductionRow>(unitIds, (chunk) =>
      supabase
        .from("window_production_status")
        .select("id, window_id, unit_id, status, cut_at, assembled_at, qc_approved_at, issue_status, issue_reason, issue_notes, manufacturing_label_printed_at, packaging_label_printed_at")
        .in("unit_id", chunk)
        .then((res) => ({ data: res.data as ProductionRow[] | null, error: res.error })),
    ),
    selectInChunks<ScheduleRow>(unitIds, (chunk) =>
      supabase
        .from("window_manufacturing_schedule")
        .select("*")
        .in("unit_id", chunk)
        .then((res) => ({ data: res.data as ScheduleRow[] | null, error: res.error })),
    ),
  ]);

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
      : unit.complete_by_date ?? null;

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

  // ── CUT QUEUE — forward fill ──────────────────────────────────────────────
  // All pending unlocked windows sorted by urgency (install date, unit, blind).
  // Start from today and pack each working day to capacity, spilling into the next.
  {
    const candidates: Candidate[] = [...candidatesByUnit.values()]
      .flatMap((items) =>
        items.filter(
          (item) =>
            (item.production?.status ?? "pending") === "pending" &&
            !item.existing?.isScheduleLocked
        )
      )
      .sort((a, b) => {
        const aDue = getUnitManufacturingDueDate(a.unit) ?? "9999-12-31";
        const bDue = getUnitManufacturingDueDate(b.unit) ?? "9999-12-31";
        if (aDue !== bDue) return aDue.localeCompare(bDue);
        if (a.unit.unit_number !== b.unit.unit_number)
          return a.unit.unit_number.localeCompare(b.unit.unit_number);
        return buildBlindSortKey(a.window).localeCompare(buildBlindSortKey(b.window));
      });

    let cursor = currentWorkDate;
    for (const item of candidates) {
      for (let guard = 0; guard < 730; guard++) {
        if (
          isWorkingDay(cursor, settings, overrides) &&
          (cutLoad.get(cursor) ?? 0) < settings.cutterDailyCapacity
        )
          break;
        cursor = addWorkingDays(cursor, 1, settings, overrides);
      }
      item.scheduledCutDate = cursor;
      pushLoad(cutLoad, cursor);
    }
  }

  // ── ASSEMBLY QUEUE — forward fill, gated on cut date ─────────────────────
  // Assembly cannot happen before the window is cut. Sort by cut date so
  // earlier-cut items fill assembly days first, then by urgency.
  {
    const candidates: Candidate[] = [...candidatesByUnit.values()]
      .flatMap((items) =>
        items.filter((item) => {
          const status = item.production?.status ?? "pending";
          return (
            status !== "assembled" &&
            status !== "qc_approved" &&
            !item.existing?.isScheduleLocked &&
            item.scheduledCutDate !== null
          );
        })
      )
      .sort((a, b) => {
        const aCut = a.scheduledCutDate ?? "9999-12-31";
        const bCut = b.scheduledCutDate ?? "9999-12-31";
        if (aCut !== bCut) return aCut.localeCompare(bCut);
        const aDue = getUnitManufacturingDueDate(a.unit) ?? "9999-12-31";
        const bDue = getUnitManufacturingDueDate(b.unit) ?? "9999-12-31";
        if (aDue !== bDue) return aDue.localeCompare(bDue);
        if (a.unit.unit_number !== b.unit.unit_number)
          return a.unit.unit_number.localeCompare(b.unit.unit_number);
        return buildBlindSortKey(a.window).localeCompare(buildBlindSortKey(b.window));
      });

    let cursor = currentWorkDate;
    for (const item of candidates) {
      // Cannot assemble before the cut date
      let day = item.scheduledCutDate! > cursor ? item.scheduledCutDate! : cursor;
      for (let guard = 0; guard < 730; guard++) {
        if (
          isWorkingDay(day, settings, overrides) &&
          (assemblyLoad.get(day) ?? 0) < settings.assemblerDailyCapacity
        )
          break;
        day = addWorkingDays(day, 1, settings, overrides);
      }
      item.scheduledAssemblyDate = day;
      pushLoad(assemblyLoad, day);
      cursor = day;
    }
  }

  // ── QC QUEUE — forward fill, gated on assembly date ──────────────────────
  // QC cannot happen before assembly. Same forward-fill pattern.
  {
    const candidates: Candidate[] = [...candidatesByUnit.values()]
      .flatMap((items) =>
        items.filter((item) => {
          const status = item.production?.status ?? "pending";
          return (
            status !== "qc_approved" &&
            !item.existing?.isScheduleLocked &&
            item.scheduledAssemblyDate !== null
          );
        })
      )
      .sort((a, b) => {
        const aAssembly = a.scheduledAssemblyDate ?? "9999-12-31";
        const bAssembly = b.scheduledAssemblyDate ?? "9999-12-31";
        if (aAssembly !== bAssembly) return aAssembly.localeCompare(bAssembly);
        const aDue = getUnitManufacturingDueDate(a.unit) ?? "9999-12-31";
        const bDue = getUnitManufacturingDueDate(b.unit) ?? "9999-12-31";
        if (aDue !== bDue) return aDue.localeCompare(bDue);
        if (a.unit.unit_number !== b.unit.unit_number)
          return a.unit.unit_number.localeCompare(b.unit.unit_number);
        return buildBlindSortKey(a.window).localeCompare(buildBlindSortKey(b.window));
      });

    let cursor = currentWorkDate;
    for (const item of candidates) {
      // Cannot QC before assembly
      let day = item.scheduledAssemblyDate! > cursor ? item.scheduledAssemblyDate! : cursor;
      for (let guard = 0; guard < 730; guard++) {
        if (
          isWorkingDay(day, settings, overrides) &&
          (qcLoad.get(day) ?? 0) < settings.qcDailyCapacity
        )
          break;
        day = addWorkingDays(day, 1, settings, overrides);
      }
      item.scheduledQcDate = day;
      pushLoad(qcLoad, day);
      cursor = day;
    }
  }

  for (const unitCandidates of candidatesByUnit.values()) {
    for (const item of unitCandidates) {
      const existing = item.existing;
      upserts.set(item.window.id, {
        id: existing?.id ?? `mfg-${crypto.randomUUID()}`,
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

export async function loadPersistedRoleSchedule(
  role: "cutter" | "assembler" | "qc"
): Promise<ManufacturingRoleSchedule> {
  const { supabase, settings, overrides } = await getSettingsAndOverrides();
  const currentWorkDate = getCurrentWorkDate(settings, overrides);

  // NOTE: this is a pure read. Correctness of the persisted schedule (every
  // zone window has a row) is now guaranteed by the mutations that create
  // unscheduled windows — moving a unit into the zone (recomputeUnitStatus)
  // and adding a window to a unit already in the zone (addWindow*) both
  // trigger reflowManufacturingSchedules. We deliberately do NOT self-heal
  // inline here: under concurrent load that turned every queue view into a
  // facility-wide reflow + upsert storm (the 2026-06-23 pool-exhaustion
  // shape). Out-of-band writes (SQL seeds/backfills/direct DB edits) must
  // call reflowManufacturingSchedules() themselves.

  const dateColumn =
    role === "cutter"
      ? "scheduled_cut_date"
      : role === "assembler"
        ? "scheduled_assembly_date"
        : "scheduled_qc_date";

  // Paginate through all schedule rows — the PostgREST default caps at 1000 rows
  // so we must page until exhausted rather than issuing a single unbounded query.
  const allScheduleRows: ScheduleRow[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data } = await supabase
      .from("window_manufacturing_schedule")
      .select("*")
      .order(dateColumn, { ascending: true, nullsFirst: false })
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    allScheduleRows.push(...(data as ScheduleRow[]));
    if (data.length < PAGE) break;
  }

  const schedules = allScheduleRows;
  const unitIds = [...new Set(schedules.map((row) => row.unit_id))];
  const windowIds = [...new Set(schedules.map((row) => row.window_id))];

  type ProductionStatusRow = {
    window_id: string;
    status: ProductionStatus;
    issue_status: ManufacturingIssueStatus;
    issue_reason: string | null;
    issue_notes: string | null;
    cut_at: string | null;
    assembled_at: string | null;
    qc_approved_at: string | null;
    manufacturing_label_printed_at: string | null;
    packaging_label_printed_at: string | null;
    cut_list_printed_at: string | null;
  };

  const [unitData, windowData, productionData, escalationByWindow, escalationHistoryByWindow] = await Promise.all([
    selectInChunks<UnitRow>(unitIds, (chunk) =>
      supabase
        .from("units")
        .select("id, building_id, client_id, unit_number, building_name, client_name, installation_date, complete_by_date, status, all_measured_at, production_entered_at")
        .in("id", chunk)
        .then((res) => ({ data: res.data as UnitRow[] | null, error: res.error })),
    ),
    selectInChunks<WindowRow>(windowIds, (chunk) =>
      supabase
        .from("windows")
        .select("id, room_id, label, blind_type, width, height, depth, notes, window_installation, wand_chain, fabric_adjustment_side, fabric_adjustment_inches, chain_side")
        .in("id", chunk)
        .then((res) => ({ data: res.data as WindowRow[] | null, error: res.error })),
    ),
    selectInChunks<ProductionStatusRow>(windowIds, (chunk) =>
      supabase
        .from("window_production_status")
        .select("window_id, status, issue_status, issue_reason, issue_notes, cut_at, assembled_at, qc_approved_at, manufacturing_label_printed_at, packaging_label_printed_at, cut_list_printed_at")
        .in("window_id", chunk)
        .then((res) => ({ data: res.data as ProductionStatusRow[] | null, error: res.error })),
    ),
    loadOpenManufacturingEscalationsByWindow(supabase, windowIds),
    loadManufacturingEscalationHistoryByWindow(supabase, windowIds),
  ]);

  const windows = windowData;
  const roomIds = [...new Set(windows.map((window) => window.room_id))];
  const roomData = await selectInChunks<{ id: string; name: string }>(roomIds, (chunk) =>
    supabase
      .from("rooms")
      .select("id, name")
      .in("id", chunk)
      .then((res) => ({ data: res.data as Array<{ id: string; name: string }> | null, error: res.error })),
  );

  const items: ManufacturingWindowItem[] = [];
  const unitsById = new Map(unitData.map((unit) => [unit.id, unit]));
  const windowsById = new Map(windows.map((window) => [window.id, window]));
  const roomsById = new Map(roomData.map((room) => [room.id, room]));
  const productionByWindow = new Map(productionData.map((production) => [production.window_id, production]));

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
    const history = escalationHistoryByWindow.get(row.window_id) ?? [];
    const latestEscalation = escalation ?? history[0] ?? null;
    const wasReworkInCycle = history.length > 0;

    const item: ManufacturingWindowItem = {
      windowId: row.window_id,
      unitId: row.unit_id,
      buildingId: unit.building_id,
      clientId: unit.client_id,
      unitNumber: unit.unit_number,
      buildingName: unit.building_name,
      clientName: unit.client_name,
      installationDate: unit.installation_date,
      completeByDate: unit.complete_by_date,
      targetReadyDate: row.target_ready_date,
      roomName,
      label: window.label,
      blindType: window.blind_type,
      width: window.width,
      height: window.height,
      depth: window.depth,
      notes: window.notes ?? "",
      productionStatus,
      issueStatus,
      issueReason: production?.issue_reason ?? "",
      issueNotes: production?.issue_notes ?? "",
      escalation,
      latestEscalation,
      escalationHistory: history,
      wasReworkInCycle,
      cutAt: production?.cut_at ?? null,
      assembledAt: production?.assembled_at ?? null,
      qcApprovedAt: production?.qc_approved_at ?? null,
      manufacturingLabelPrintedAt: production?.manufacturing_label_printed_at ?? null,
      packagingLabelPrintedAt: production?.packaging_label_printed_at ?? null,
      cutListPrintedAt: production?.cut_list_printed_at ?? null,
      allMeasuredAt: unit.all_measured_at ?? null,
      productionEnteredAt: unit.production_entered_at ?? null,
      scheduledCutDate: row.scheduled_cut_date,
      scheduledAssemblyDate: row.scheduled_assembly_date,
      scheduledQcDate: row.scheduled_qc_date,
      isScheduleLocked: row.is_schedule_locked ?? false,
      overCapacityOverride: row.over_capacity_override ?? false,
      windowInstallation: (window.window_installation ?? "inside") as WindowInstallation,
      wandChain: (window.wand_chain ?? null) as WandChain | null,
      fabricAdjustmentSide: (window.fabric_adjustment_side ?? "none") as FabricAdjustmentSide,
      fabricAdjustmentInches: window.fabric_adjustment_inches ?? null,
      chainSide: (window.chain_side ?? null) as ChainSide | null,
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

  return buildRoleScheduleOutput(role, items, allItems, currentWorkDate, settings, overrides);
}

export async function loadManufacturingRoleSchedule(
  role: "cutter" | "assembler" | "qc"
): Promise<ManufacturingRoleSchedule> {
  // Pure read: the persisted schedule is kept current by mutation-triggered
  // reflows, so neither the queue nor the completed views need to recompute
  // the facility on every load.
  return loadPersistedRoleSchedule(role);
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

  const aDue = getWindowManufacturingDueDate(a);
  const bDue = getWindowManufacturingDueDate(b);
  if (aDue !== bDue) {
    if (!aDue) return 1;
    if (!bDue) return -1;
    return aDue.localeCompare(bDue);
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
