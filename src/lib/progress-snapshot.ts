import { createAdminClient } from "./supabase/admin.ts";
import type { ProgressStage } from "./types";

const TORONTO_TIME_ZONE = "America/Toronto";

type SupabaseAdminClient = ReturnType<typeof createAdminClient>;

type SnapshotUnitRow = {
  id: string;
  building_id: string;
  client_id: string;
  unit_number: string;
  window_count: number | null;
  assigned_installer_id: string | null;
  assigned_installer_name: string | null;
  measurement_date: string | null;
  bracketing_date: string | null;
  installation_date: string | null;
};

type SnapshotWindowRow = {
  id: string;
  room_id: string;
  measured: boolean | null;
  bracketed: boolean | null;
  installed: boolean | null;
};

type SnapshotRoomRow = {
  id: string;
  unit_id: string;
};

type ManufacturingScheduleRow = {
  window_id: string;
  unit_id: string;
  target_ready_date: string | null;
};

type ProductionRow = {
  window_id: string;
  unit_id: string;
  status: "pending" | "cut" | "assembled" | "qc_approved";
  cut_by_cutter_id: string | null;
  cut_at: string | null;
  assembled_by_assembler_id: string | null;
  assembled_at: string | null;
  qc_approved_by_qc_id: string | null;
  qc_approved_by_assembler_id: string | null;
  qc_approved_at: string | null;
};

type PostInstallIssueRow = {
  id: string;
  unit_id: string;
  opened_by_user_id: string;
  opened_by_role: string;
  opened_at: string;
  resolved_at: string | null;
};

type SnapshotRow = {
  id: string;
  snapshot_date: string;
  stage: ProgressStage;
  unit_id: string;
  building_id: string;
  client_id: string;
  floor: number | null;
  expected_blinds: number;
  done_blinds: number;
  assigned_user_ids: string[];
  assigned_display: string | null;
};

type SnapshotResult = {
  snapshotDate: string;
  rows: number;
  stages: Partial<Record<ProgressStage, number>>;
};

type DateBounds = {
  startIso: string;
  endExclusiveIso: string;
};

const SNAPSHOT_STAGES: ProgressStage[] = [
  "measurement",
  "bracketing",
  "cutting",
  "assembling",
  "qc",
  "installation",
  "post_install_issue",
];

function assertDateKey(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Invalid snapshot date "${date}". Expected YYYY-MM-DD.`);
  }
}

function getDatePartsInToronto(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
  };
}

export function todayInToronto(now = new Date()): string {
  const { year, month, day } = getDatePartsInToronto(now);
  return `${year}-${month}-${day}`;
}

function addUtcDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + days));
  return next.toISOString().slice(0, 10);
}

function getZonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TORONTO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function zonedTorontoMidnightToUtc(date: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const targetUtc = Date.UTC(year, month - 1, day, 0, 0, 0);
  let candidateUtc = targetUtc;

  for (let i = 0; i < 4; i += 1) {
    const parts = getZonedParts(new Date(candidateUtc));
    const renderedUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second
    );
    candidateUtc -= renderedUtc - targetUtc;
  }

  return new Date(candidateUtc);
}

function getTorontoDateBounds(date: string): DateBounds {
  return {
    startIso: zonedTorontoMidnightToUtc(date).toISOString(),
    endExclusiveIso: zonedTorontoMidnightToUtc(addUtcDays(date, 1)).toISOString(),
  };
}

function isBeforeEndOfSnapshot(value: string | null | undefined, bounds: DateBounds): boolean {
  return Boolean(value && value < bounds.endExclusiveIso);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function joinDisplay(names: Array<string | null | undefined>): string | null {
  const display = unique(names).join(", ");
  return display || null;
}

function snapshotId(date: string, stage: ProgressStage, unitId: string): string {
  return `dps:${date}:${stage}:${unitId}`;
}

function parseFloor(unitNumber: string): number | null {
  const match = unitNumber.match(/\d+/);
  if (!match) return null;

  const value = Number(match[0]);
  if (!Number.isFinite(value)) return null;
  if (value < 100) return value;
  return Math.floor(value / 100);
}

function normalizeDateKey(value: string | null | undefined): string | null {
  return value ? value.slice(0, 10) : null;
}

function makeSnapshotRow(
  date: string,
  stage: ProgressStage,
  unit: SnapshotUnitRow,
  expectedBlinds: number,
  doneBlinds: number,
  assignedUserIds: string[],
  assignedDisplay: string | null
): SnapshotRow {
  return {
    id: snapshotId(date, stage, unit.id),
    snapshot_date: date,
    stage,
    unit_id: unit.id,
    building_id: unit.building_id,
    client_id: unit.client_id,
    floor: parseFloor(unit.unit_number),
    expected_blinds: expectedBlinds,
    done_blinds: doneBlinds,
    assigned_user_ids: assignedUserIds,
    assigned_display: assignedDisplay,
  };
}

async function loadUnitsByIds(
  supabase: SupabaseAdminClient,
  unitIds: string[]
): Promise<Map<string, SnapshotUnitRow>> {
  if (unitIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("units")
    .select(
      "id, building_id, client_id, unit_number, window_count, assigned_installer_id, assigned_installer_name, measurement_date, bracketing_date, installation_date"
    )
    .in("id", unitIds);

  if (error) throw new Error(`Failed to load units: ${error.message}`);

  const rows = (data ?? []) as SnapshotUnitRow[];
  return new Map(rows.map((unit) => [unit.id, unit]));
}

async function loadFieldUnits(
  supabase: SupabaseAdminClient,
  date: string
): Promise<SnapshotUnitRow[]> {
  const { data, error } = await supabase
    .from("units")
    .select(
      "id, building_id, client_id, unit_number, window_count, assigned_installer_id, assigned_installer_name, measurement_date, bracketing_date, installation_date"
    )
    .or(`measurement_date.eq.${date},bracketing_date.eq.${date},installation_date.eq.${date}`);

  if (error) throw new Error(`Failed to load field units: ${error.message}`);
  return (data ?? []) as SnapshotUnitRow[];
}

async function loadWindowsForUnits(
  supabase: SupabaseAdminClient,
  unitIds: string[]
): Promise<Map<string, SnapshotWindowRow[]>> {
  const windowsByUnit = new Map<string, SnapshotWindowRow[]>();
  if (unitIds.length === 0) return windowsByUnit;

  const { data: roomsData, error: roomsError } = await supabase
    .from("rooms")
    .select("id, unit_id")
    .in("unit_id", unitIds);

  if (roomsError) throw new Error(`Failed to load rooms: ${roomsError.message}`);

  const rooms = (roomsData ?? []) as SnapshotRoomRow[];
  const unitIdByRoomId = new Map(rooms.map((room) => [room.id, room.unit_id]));
  const roomIds = rooms.map((room) => room.id);
  if (roomIds.length === 0) return windowsByUnit;

  const { data: windowsData, error: windowsError } = await supabase
    .from("windows")
    .select("id, room_id, measured, bracketed, installed")
    .in("room_id", roomIds);

  if (windowsError) throw new Error(`Failed to load windows: ${windowsError.message}`);

  for (const window of (windowsData ?? []) as SnapshotWindowRow[]) {
    const unitId = unitIdByRoomId.get(window.room_id);
    if (!unitId) continue;
    const list = windowsByUnit.get(unitId) ?? [];
    list.push(window);
    windowsByUnit.set(unitId, list);
  }

  return windowsByUnit;
}

async function loadStageMediaByWindow(
  supabase: SupabaseAdminClient,
  windowIds: string[]
): Promise<Map<string, Map<string, string[]>>> {
  const mediaByWindow = new Map<string, Map<string, string[]>>();
  if (windowIds.length === 0) return mediaByWindow;

  const { data, error } = await supabase
    .from("media_uploads")
    .select("window_id, stage, created_at")
    .in("window_id", windowIds)
    .in("stage", ["scheduled_bracketing", "bracketed_measured", "installed_pending_approval"]);

  if (error) throw new Error(`Failed to load media timestamps: ${error.message}`);

  for (const row of (data ?? []) as Array<{ window_id: string | null; stage: string | null; created_at: string | null }>) {
    if (!row.window_id || !row.stage || !row.created_at) continue;
    const byStage = mediaByWindow.get(row.window_id) ?? new Map<string, string[]>();
    const values = byStage.get(row.stage) ?? [];
    values.push(row.created_at);
    byStage.set(row.stage, values);
    mediaByWindow.set(row.window_id, byStage);
  }

  return mediaByWindow;
}

function doneByFlagAndOptionalMedia(
  window: SnapshotWindowRow,
  flag: "measured" | "bracketed" | "installed",
  mediaStage: string,
  mediaByWindow: Map<string, Map<string, string[]>>,
  bounds: DateBounds
) {
  if (!window[flag]) return false;

  const evidence = mediaByWindow.get(window.id)?.get(mediaStage) ?? [];
  if (evidence.length === 0) return true;
  return evidence.some((createdAt) => createdAt < bounds.endExclusiveIso);
}

async function buildFieldStageRows(
  supabase: SupabaseAdminClient,
  date: string,
  bounds: DateBounds
): Promise<SnapshotRow[]> {
  const units = await loadFieldUnits(supabase, date);
  const windowsByUnit = await loadWindowsForUnits(
    supabase,
    units.map((unit) => unit.id)
  );
  const allWindowIds = [...windowsByUnit.values()].flat().map((window) => window.id);
  const mediaByWindow = await loadStageMediaByWindow(supabase, allWindowIds);
  const rows: SnapshotRow[] = [];

  for (const unit of units) {
    const windows = windowsByUnit.get(unit.id) ?? [];
    const assignedUserIds = unique([unit.assigned_installer_id]);
    const assignedDisplay = unit.assigned_installer_name ?? null;

    if (normalizeDateKey(unit.measurement_date) === date) {
      const measuredCount = windows.filter((window) =>
        doneByFlagAndOptionalMedia(window, "measured", "scheduled_bracketing", mediaByWindow, bounds)
      ).length;
      rows.push(
        makeSnapshotRow(
          date,
          "measurement",
          unit,
          measuredCount > 0 ? unit.window_count ?? 0 : 0,
          measuredCount,
          assignedUserIds,
          assignedDisplay
        )
      );
    }

    if (normalizeDateKey(unit.bracketing_date) === date) {
      const measuredCount = windows.filter((window) =>
        doneByFlagAndOptionalMedia(window, "measured", "scheduled_bracketing", mediaByWindow, bounds)
      ).length;
      const bracketedCount = windows.filter((window) =>
        doneByFlagAndOptionalMedia(window, "bracketed", "bracketed_measured", mediaByWindow, bounds)
      ).length;
      rows.push(
        makeSnapshotRow(
          date,
          "bracketing",
          unit,
          measuredCount > 0 || bracketedCount > 0 ? unit.window_count ?? 0 : 0,
          bracketedCount,
          assignedUserIds,
          assignedDisplay
        )
      );
    }

    if (normalizeDateKey(unit.installation_date) === date) {
      const expectedBlinds = unit.window_count ?? 0;
      rows.push(
        makeSnapshotRow(
          date,
          "installation",
          unit,
          expectedBlinds,
          windows.filter((window) =>
            doneByFlagAndOptionalMedia(window, "installed", "installed_pending_approval", mediaByWindow, bounds)
          ).length,
          assignedUserIds,
          assignedDisplay
        )
      );
    }
  }

  return rows;
}

async function loadTargetReadySchedules(
  supabase: SupabaseAdminClient,
  date: string
): Promise<ManufacturingScheduleRow[]> {
  const { data, error } = await supabase
    .from("window_manufacturing_schedule")
    .select("window_id, unit_id, target_ready_date")
    .eq("target_ready_date", date);

  if (error) throw new Error(`Failed to load manufacturing schedule: ${error.message}`);
  return (data ?? []) as ManufacturingScheduleRow[];
}

async function loadProductionRows(
  supabase: SupabaseAdminClient,
  windowIds: string[]
): Promise<Map<string, ProductionRow>> {
  if (windowIds.length === 0) return new Map();

  const { data, error } = await supabase
    .from("window_production_status")
    .select(
      "window_id, unit_id, status, cut_by_cutter_id, cut_at, assembled_by_assembler_id, assembled_at, qc_approved_by_qc_id, qc_approved_by_assembler_id, qc_approved_at"
    )
    .in("window_id", windowIds);

  if (error) throw new Error(`Failed to load production rows: ${error.message}`);

  const rows = (data ?? []) as ProductionRow[];
  return new Map(rows.map((row) => [row.window_id, row]));
}

async function loadDisplayNames(
  supabase: SupabaseAdminClient,
  table: "cutters" | "assemblers" | "qcs" | "user_profiles",
  ids: string[]
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();

  const nameColumn = table === "user_profiles" ? "display_name" : "name";
  const { data, error } = await supabase
    .from(table)
    .select(`id, ${nameColumn}`)
    .in("id", ids);

  if (error) throw new Error(`Failed to load ${table} names: ${error.message}`);

  return new Map(
    ((data ?? []) as Array<{ id: string; name?: string | null; display_name?: string | null }>).map((row) => [
      row.id,
      row.name ?? row.display_name ?? row.id,
    ])
  );
}

async function buildManufacturingStageRows(
  supabase: SupabaseAdminClient,
  date: string,
  bounds: DateBounds
): Promise<SnapshotRow[]> {
  const schedules = await loadTargetReadySchedules(supabase, date);
  if (schedules.length === 0) return [];

  const productionByWindow = await loadProductionRows(
    supabase,
    schedules.map((schedule) => schedule.window_id)
  );
  const unitsById = await loadUnitsByIds(
    supabase,
    unique(schedules.map((schedule) => schedule.unit_id))
  );

  const cutDoneRows = [...productionByWindow.values()].filter((row) =>
    isBeforeEndOfSnapshot(row.cut_at, bounds)
  );
  const assembledDoneRows = [...productionByWindow.values()].filter((row) =>
    isBeforeEndOfSnapshot(row.assembled_at, bounds)
  );
  const qcDoneRows = [...productionByWindow.values()].filter((row) =>
    isBeforeEndOfSnapshot(row.qc_approved_at, bounds)
  );

  const cutterNames = await loadDisplayNames(
    supabase,
    "cutters",
    unique(cutDoneRows.map((row) => row.cut_by_cutter_id))
  );
  const assemblerNames = await loadDisplayNames(
    supabase,
    "assemblers",
    unique(assembledDoneRows.map((row) => row.assembled_by_assembler_id))
  );
  const qcNames = await loadDisplayNames(
    supabase,
    "qcs",
    unique(qcDoneRows.map((row) => row.qc_approved_by_qc_id ?? row.qc_approved_by_assembler_id))
  );

  const schedulesByUnit = new Map<string, ManufacturingScheduleRow[]>();
  for (const schedule of schedules) {
    const list = schedulesByUnit.get(schedule.unit_id) ?? [];
    list.push(schedule);
    schedulesByUnit.set(schedule.unit_id, list);
  }

  const rows: SnapshotRow[] = [];
  for (const [unitId, unitSchedules] of schedulesByUnit) {
    const unit = unitsById.get(unitId);
    if (!unit) continue;

    const productionRows = unitSchedules.map((schedule) => productionByWindow.get(schedule.window_id) ?? null);
    const cutRows = productionRows.filter((row): row is ProductionRow => isBeforeEndOfSnapshot(row?.cut_at, bounds));
    const assemblyQueueRows = productionRows.filter((row): row is ProductionRow =>
      isBeforeEndOfSnapshot(row?.cut_at, bounds)
    );
    const assembledRows = assemblyQueueRows.filter((row) => isBeforeEndOfSnapshot(row.assembled_at, bounds));
    const qcQueueRows = productionRows.filter((row): row is ProductionRow =>
      isBeforeEndOfSnapshot(row?.assembled_at, bounds)
    );
    const approvedRows = qcQueueRows.filter((row) => isBeforeEndOfSnapshot(row.qc_approved_at, bounds));

    rows.push(
      makeSnapshotRow(
        date,
        "cutting",
        unit,
        unitSchedules.length,
        cutRows.length,
        unique(cutRows.map((row) => row.cut_by_cutter_id)),
        joinDisplay(cutRows.map((row) => (row.cut_by_cutter_id ? cutterNames.get(row.cut_by_cutter_id) : null))) ?? "—"
      )
    );

    if (assemblyQueueRows.length > 0) {
      rows.push(
        makeSnapshotRow(
          date,
          "assembling",
          unit,
          assemblyQueueRows.length,
          assembledRows.length,
          unique(assembledRows.map((row) => row.assembled_by_assembler_id)),
          joinDisplay(
            assembledRows.map((row) =>
              row.assembled_by_assembler_id ? assemblerNames.get(row.assembled_by_assembler_id) : null
            )
          ) ?? "—"
        )
      );
    }

    if (qcQueueRows.length > 0) {
      const qcUserIds = unique(
        approvedRows.map((row) => row.qc_approved_by_qc_id ?? row.qc_approved_by_assembler_id)
      );
      rows.push(
        makeSnapshotRow(
          date,
          "qc",
          unit,
          qcQueueRows.length,
          approvedRows.length,
          qcUserIds,
          joinDisplay(qcUserIds.map((id) => qcNames.get(id))) ?? "—"
        )
      );
    }
  }

  return rows;
}

async function loadIssuesOpenedOnDate(
  supabase: SupabaseAdminClient,
  bounds: DateBounds
): Promise<PostInstallIssueRow[]> {
  const { data, error } = await supabase
    .from("window_post_install_issues")
    .select("id, unit_id, opened_by_user_id, opened_by_role, opened_at, resolved_at")
    .gte("opened_at", bounds.startIso)
    .lt("opened_at", bounds.endExclusiveIso);

  if (error) throw new Error(`Failed to load post-install issues: ${error.message}`);
  return (data ?? []) as PostInstallIssueRow[];
}

async function buildPostInstallIssueRows(
  supabase: SupabaseAdminClient,
  date: string,
  bounds: DateBounds
): Promise<SnapshotRow[]> {
  const issues = await loadIssuesOpenedOnDate(supabase, bounds);
  if (issues.length === 0) return [];

  const unitsById = await loadUnitsByIds(supabase, unique(issues.map((issue) => issue.unit_id)));
  const openerNames = await loadDisplayNames(
    supabase,
    "user_profiles",
    unique(issues.map((issue) => issue.opened_by_user_id))
  );

  const issuesByUnit = new Map<string, PostInstallIssueRow[]>();
  for (const issue of issues) {
    const list = issuesByUnit.get(issue.unit_id) ?? [];
    list.push(issue);
    issuesByUnit.set(issue.unit_id, list);
  }

  const rows: SnapshotRow[] = [];
  for (const [unitId, unitIssues] of issuesByUnit) {
    const unit = unitsById.get(unitId);
    if (!unit) continue;

    const openerIds = unique(unitIssues.map((issue) => issue.opened_by_user_id));
    rows.push(
      makeSnapshotRow(
        date,
        "post_install_issue",
        unit,
        unitIssues.length,
        unitIssues.filter((issue) => isBeforeEndOfSnapshot(issue.resolved_at, bounds)).length,
        openerIds,
        joinDisplay(
          openerIds.map((id) => {
            const issue = unitIssues.find((item) => item.opened_by_user_id === id);
            return openerNames.get(id) ?? issue?.opened_by_role ?? id;
          })
        )
      )
    );
  }

  return rows;
}

async function upsertSnapshotRows(
  supabase: SupabaseAdminClient,
  rows: SnapshotRow[]
): Promise<void> {
  if (rows.length === 0) return;

  const { error } = await supabase
    .from("daily_progress_snapshots")
    .upsert(rows, { onConflict: "snapshot_date,stage,unit_id" });

  if (error) throw new Error(`Failed to upsert progress snapshots: ${error.message}`);
}

function countRowsByStage(rows: SnapshotRow[]): Partial<Record<ProgressStage, number>> {
  const stages: Partial<Record<ProgressStage, number>> = {};
  for (const row of rows) {
    stages[row.stage] = (stages[row.stage] ?? 0) + 1;
  }
  for (const stage of SNAPSHOT_STAGES) {
    if (stages[stage] === undefined) stages[stage] = 0;
  }
  return stages;
}

export async function snapshotProgressForDate(date: string): Promise<SnapshotResult> {
  assertDateKey(date);

  const supabase = createAdminClient();
  const bounds = getTorontoDateBounds(date);
  const rows = [
    ...(await buildFieldStageRows(supabase, date, bounds)),
    ...(await buildManufacturingStageRows(supabase, date, bounds)),
    ...(await buildPostInstallIssueRows(supabase, date, bounds)),
  ];

  await upsertSnapshotRows(supabase, rows);

  return {
    snapshotDate: date,
    rows: rows.length,
    stages: countRowsByStage(rows),
  };
}
