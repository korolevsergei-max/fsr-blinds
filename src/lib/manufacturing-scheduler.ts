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

export interface ManufacturingWindowItem {
  windowId: string;
  unitId: string;
  buildingId: string;
  clientId: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  completeByDate: string | null;
  targetReadyDate: string | null;
  roomName: string;
  label: string;
  blindType: BlindType;
  width: number | null;
  height: number | null;
  depth: number | null;
  notes: string;
  productionStatus: ProductionStatus;
  issueStatus: ManufacturingIssueStatus;
  issueReason: string;
  issueNotes: string;
  escalation: WindowManufacturingEscalation | null;
  latestEscalation: WindowManufacturingEscalation | null;
  escalationHistory: WindowManufacturingEscalation[];
  wasReworkInCycle: boolean;
  cutAt: string | null;
  assembledAt: string | null;
  qcApprovedAt: string | null;
  manufacturingLabelPrintedAt: string | null;
  packagingLabelPrintedAt: string | null;
  scheduledCutDate: string | null;
  scheduledAssemblyDate: string | null;
  scheduledQcDate: string | null;
  isScheduleLocked: boolean;
  overCapacityOverride: boolean;
  windowInstallation: WindowInstallation;
  wandChain: WandChain | null;
  fabricAdjustmentSide: FabricAdjustmentSide;
  fabricAdjustmentInches: number | null;
  chainSide: ChainSide | null;
}

export interface ManufacturingUnitCard {
  unitId: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  installationDate: string | null;
  completeByDate: string | null;
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
  if (item.wasReworkInCycle) return 0;
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

function isReworkPriority(
  role: "cutter" | "assembler" | "qc",
  item: ManufacturingWindowItem
) {
  return isReturnedToRole(role, item) || item.wasReworkInCycle;
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

    if (isReworkPriority(role, a) || isReworkPriority(role, b)) {
      const aReturned = isReturnedToRole(role, a) ? 0 : 1;
      const bReturned = isReturnedToRole(role, b) ? 0 : 1;
      if (aReturned !== bReturned) return aReturned - bReturned;

      const aOpened = a.latestEscalation?.openedAt ?? "9999-12-31T00:00:00Z";
      const bOpened = b.latestEscalation?.openedAt ?? "9999-12-31T00:00:00Z";
      if (aOpened !== bOpened) return aOpened.localeCompare(bOpened);
    }

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

// Supabase routes long URLs through proxies that reject requests above ~8KB.
// `.in("id", ids)` puts every id in the URL, so a single 600+ id query 400s.
// Chunk the ids and merge the results to keep each URL well under that limit.
const SUPABASE_IN_CHUNK = 100;

async function selectInChunks<Row>(
  ids: readonly string[],
  fetchChunk: (chunk: string[]) => PromiseLike<{ data: Row[] | null; error: unknown }>
): Promise<Row[]> {
  if (ids.length === 0) return [];
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += SUPABASE_IN_CHUNK) {
    const chunk = ids.slice(i, i + SUPABASE_IN_CHUNK) as string[];
    const { data } = await fetchChunk(chunk);
    if (data) out.push(...data);
  }
  return out;
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
    .in("status", ["measured", "bracketed", "manufactured", "measured_and_bracketed"])
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
  };

  const [unitData, windowData, productionData, escalationByWindow, escalationHistoryByWindow] = await Promise.all([
    selectInChunks<UnitRow>(unitIds, (chunk) =>
      supabase
        .from("units")
        .select("id, building_id, client_id, unit_number, building_name, client_name, installation_date, complete_by_date, status")
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
        .select("window_id, status, issue_status, issue_reason, issue_notes, cut_at, assembled_at, qc_approved_at, manufacturing_label_printed_at, packaging_label_printed_at")
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
  const roleDateKey =
    role === "cutter"
      ? "scheduledCutDate"
      : role === "assembler"
        ? "scheduledAssemblyDate"
        : "scheduledQcDate";
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
    if (isReworkPriority(role, item) || item.issueStatus === "open") {
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
    const bucketList = byBucket.get(date) ?? [];
    bucketList.push(item);
    byBucket.set(date, bucketList);
  }

  // Clamp the earliest scheduled date to today so the queue always starts with
  // a "Today" bucket — cutters/assemblers should work on the next available
  // items now, not wait until the scheduled date.
  const dateBucketKeys = [...byBucket.keys()].filter((k) => !k.startsWith("__"));
  if (dateBucketKeys.length > 0) {
    const earliestKey = dateBucketKeys.sort()[0];
    if (earliestKey > currentWorkDate) {
      const items = byBucket.get(earliestKey)!;
      byBucket.delete(earliestKey);
      const existing = byBucket.get(currentWorkDate) ?? [];
      byBucket.set(currentWorkDate, [...existing, ...items]);
    }
  }

  const rankKey = (key: string): number => {
    if (key === "__issues__") return 0;
    if (key === "__unscheduled__") return 2;
    return 1;
  };
  const orderedKeys = [...byBucket.keys()].sort((a, b) => {
    const rankDiff = rankKey(a) - rankKey(b);
    if (rankDiff !== 0) return rankDiff;
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
          completeByDate: unitsById.get(item.unitId)?.complete_by_date ?? null,
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

        const aDate = a.installationDate ?? a.completeByDate ?? "9999-12-31";
        const bDate = b.installationDate ?? b.completeByDate ?? "9999-12-31";
        if (aDate !== bDate) return aDate.localeCompare(bDate);

        return a.unitNumber.localeCompare(b.unitNumber);
      });

    return {
      date: key.startsWith("__") ? null : key,
      label:
        key === "__issues__"
          ? "Rework — priority"
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
