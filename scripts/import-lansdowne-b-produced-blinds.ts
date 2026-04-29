import XLSX from "xlsx";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAdminClient } from "../src/lib/supabase/admin.ts";

const DEFAULT_FILE = "/Users/sergeikorolev/Desktop/lansdowne b blinds produced (1).xlsx";
const DEFAULT_BUILDING_ID = "bldg-01bff281";
const DEFAULT_BACKUP_DIR = "tmp";

const EXPECTED_UNIT_COUNT = 129;
const EXPECTED_BLIND_COUNT = 709;

const TODAY = "2026-04-29";
const NEXT_INSTALL_DATE = "2026-04-30";
const PROTECTED_INSTALLED_UNITS = new Set(["2901", "1802", "602", "502", "402"]);

type Mode = "dry-run" | "apply" | "verify";
type BlindType = "screen" | "blackout";
type TaskType = "measurement" | "bracketing" | "installation";

type Args = {
  mode: Mode;
  file: string;
  buildingId: string;
  backupDir: string;
};

type WorkbookBlind = {
  sourceRow: number;
  width: number;
  height: number;
  rawFabric: string;
  blindType: BlindType;
  rawStatus: string;
  workbookInstalled: boolean;
};

type WorkbookUnit = {
  unitNumber: string;
  qty: number | null;
  blinds: WorkbookBlind[];
};

type UnitRow = Record<string, unknown> & {
  id: string;
  building_id: string;
  client_id: string;
  client_name: string;
  building_name: string;
  unit_number: string;
  status: string;
};

type BuildingRow = Record<string, unknown> & {
  id: string;
  client_id: string;
  name: string;
};

type ClientRow = Record<string, unknown> & {
  id: string;
  name: string;
};

type RoomRow = Record<string, unknown> & {
  id: string;
  unit_id: string;
  name: string;
};

type WindowRow = Record<string, unknown> & {
  id: string;
  room_id: string;
  label: string;
  blind_type: string;
  width: number | null;
  height: number | null;
  measured: boolean;
  bracketed: boolean;
  installed: boolean;
};

type ProductionRow = Record<string, unknown> & {
  id: string;
  window_id: string;
  unit_id: string;
  status: string;
};

type MediaRow = Record<string, unknown> & {
  id: string;
  unit_id: string;
  room_id: string | null;
  window_id: string | null;
  stage: string | null;
};

type ScheduleEntryRow = Record<string, unknown> & {
  id: string;
  unit_id: string;
  task_type: TaskType;
};

type DesiredBlind = WorkbookBlind & {
  index: number;
  targetRoomName: string;
  targetLabel: string;
  finalInstalled: boolean;
};

type WindowAssignment = {
  desired: DesiredBlind;
  existingWindow: WindowRow | null;
};

type PlannedUnit = {
  workbookUnit: WorkbookUnit;
  dbUnit: UnitRow | null;
  desiredBlinds: DesiredBlind[];
  targetStatus: "manufactured" | "installed";
  measurementDate: string;
  bracketingDate: string;
  installationDate: string;
  completeByDate: string;
  assignments: WindowAssignment[];
  extraWindowsToDelete: WindowRow[];
  roomsToCreate: string[];
  protectsInstalledOverride: boolean;
};

type LoadedData = {
  building: BuildingRow;
  client: ClientRow;
  units: UnitRow[];
  rooms: RoomRow[];
  windows: WindowRow[];
  productionRows: ProductionRow[];
  mediaRows: MediaRow[];
  scheduleEntries: ScheduleEntryRow[];
  activityLogs: Record<string, unknown>[];
};

type Plan = {
  runId: string;
  workbookUnits: WorkbookUnit[];
  plannedUnits: PlannedUnit[];
  loaded: LoadedData;
  errors: string[];
  warnings: string[];
  anomalies: string[];
};

function usage(): never {
  throw new Error(
    [
      "Usage:",
      "  node --experimental-strip-types scripts/import-lansdowne-b-produced-blinds.ts [--dry-run|--apply|--verify]",
      "Options:",
      "  --file <xlsx>          Defaults to the Lansdowne B workbook on Desktop.",
      "  --building-id <id>     Defaults to Lansdowne Building B.",
      "  --backup-dir <dir>     Defaults to tmp.",
    ].join("\n")
  );
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    mode: "dry-run",
    file: DEFAULT_FILE,
    buildingId: DEFAULT_BUILDING_ID,
    backupDir: DEFAULT_BACKUP_DIR,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--dry-run") {
      args.mode = "dry-run";
    } else if (arg === "--apply") {
      args.mode = "apply";
    } else if (arg === "--verify") {
      args.mode = "verify";
    } else if (arg === "--file" && next) {
      args.file = next;
      i += 1;
    } else if (arg === "--building-id" && next) {
      args.buildingId = next;
      i += 1;
    } else if (arg === "--backup-dir" && next) {
      args.backupDir = next;
      i += 1;
    } else {
      usage();
    }
  }

  return args;
}

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function parseNumber(value: string, label: string, sourceRow: number): number {
  const cleaned = value.trim().replace(/["']/g, "");
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    const mixed = cleaned.match(/^(-?\d+(?:\.\d+)?)\s+(\d+)\/(\d+)$/);
    if (mixed) {
      const whole = Number(mixed[1]);
      const numerator = Number(mixed[2]);
      const denominator = Number(mixed[3]);
      if (denominator !== 0) return whole + Math.sign(whole || 1) * (numerator / denominator);
    }

    const fraction = cleaned.match(/^(-?\d+)\/(\d+)$/);
    if (fraction) {
      const numerator = Number(fraction[1]);
      const denominator = Number(fraction[2]);
      if (denominator !== 0) return numerator / denominator;
    }

    throw new Error(`Row ${sourceRow}: invalid ${label} "${value}".`);
  }
  return parsed;
}

function normalizeFabric(raw: string, sourceRow: number): BlindType {
  const normalized = raw.trim().toLowerCase();
  if (["b/o", "bv/o"].includes(normalized)) return "blackout";
  if (["0.03", "3%", "3e%", "35"].includes(normalized)) return "screen";
  throw new Error(`Row ${sourceRow}: unknown fabric "${raw}".`);
}

function parseWorkbook(file: string): WorkbookUnit[] {
  if (!existsSync(file)) {
    throw new Error(`Workbook not found: ${file}`);
  }

  const workbook = XLSX.readFile(file);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error("Workbook has no sheets.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  const units: WorkbookUnit[] = [];
  let current: WorkbookUnit | null = null;

  rows.slice(1).forEach((row, offset) => {
    const sourceRow = offset + 2;
    const unitNumber = asText(row[0]);
    const qtyRaw = asText(row[1]);
    const widthRaw = asText(row[2]);
    const heightRaw = asText(row[3]);
    const fabricRaw = asText(row[4]);
    const statusRaw = asText(row[5]);

    if (unitNumber) {
      current = {
        unitNumber,
        qty: qtyRaw ? parseNumber(qtyRaw, "quantity", sourceRow) : null,
        blinds: [],
      };
      units.push(current);
    }

    if (!current || (!widthRaw && !heightRaw && !fabricRaw && !statusRaw)) return;
    if (!widthRaw || !heightRaw || !fabricRaw) {
      throw new Error(`Row ${sourceRow}: missing width, height, or fabric.`);
    }

    current.blinds.push({
      sourceRow,
      width: parseNumber(widthRaw, "width", sourceRow),
      height: parseNumber(heightRaw, "height", sourceRow),
      rawFabric: fabricRaw,
      blindType: normalizeFabric(fabricRaw, sourceRow),
      rawStatus: statusRaw,
      workbookInstalled: /^installed$/i.test(statusRaw),
    });
  });

  return units;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function must<T>(
  result: PromiseLike<{ data: T | null; error: { message: string } | null }>,
  label: string
): Promise<T> {
  const { data, error } = await result;
  if (error) throw new Error(`${label}: ${error.message}`);
  if (data === null) throw new Error(`${label}: no data returned.`);
  return data;
}

async function selectIn<T extends Record<string, unknown>>(
  supabase: ReturnType<typeof createAdminClient>,
  table: string,
  column: string,
  values: string[],
  select = "*"
): Promise<T[]> {
  const rows: T[] = [];
  for (const group of chunk(values, 80)) {
    if (group.length === 0) continue;
    const { data, error } = await supabase.from(table).select(select).in(column, group);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as T[]));
  }
  return rows;
}

async function loadData(
  buildingId: string,
  workbookUnits: WorkbookUnit[]
): Promise<LoadedData> {
  const supabase = createAdminClient();
  const building = await must<BuildingRow>(
    supabase.from("buildings").select("*").eq("id", buildingId).single(),
    "Load building"
  );
  const client = await must<ClientRow>(
    supabase.from("clients").select("*").eq("id", building.client_id).single(),
    "Load client"
  );

  const { data: unitsData, error: unitsError } = await supabase
    .from("units")
    .select("*")
    .eq("building_id", buildingId);
  if (unitsError) throw new Error(`Load units: ${unitsError.message}`);
  const allBuildingUnits = (unitsData ?? []) as UnitRow[];
  const workbookNumbers = new Set(workbookUnits.map((unit) => unit.unitNumber));
  const touchedUnits = allBuildingUnits.filter((unit) => workbookNumbers.has(unit.unit_number));
  const touchedUnitIds = touchedUnits.map((unit) => unit.id);

  const rooms = await selectIn<RoomRow>(supabase, "rooms", "unit_id", touchedUnitIds);
  const roomIds = rooms.map((room) => room.id);
  const windows = await selectIn<WindowRow>(supabase, "windows", "room_id", roomIds);
  const windowIds = windows.map((windowRow) => windowRow.id);
  const productionRows = await selectIn<ProductionRow>(
    supabase,
    "window_production_status",
    "window_id",
    windowIds
  );
  const mediaRows = await selectIn<MediaRow>(supabase, "media_uploads", "unit_id", touchedUnitIds);
  const scheduleEntries = await selectIn<ScheduleEntryRow>(
    supabase,
    "schedule_entries",
    "unit_id",
    touchedUnitIds
  );
  const activityLogs = await selectIn<Record<string, unknown>>(
    supabase,
    "unit_activity_log",
    "unit_id",
    touchedUnitIds
  );

  return {
    building,
    client,
    units: allBuildingUnits,
    rooms,
    windows,
    productionRows,
    mediaRows,
    scheduleEntries,
    activityLogs,
  };
}

function roomPriority(name: string): number {
  const normalized = name.toLowerCase();
  if (normalized === "living room") return 0;
  if (normalized === "bedroom 1") return 1;
  return 2;
}

function compareExistingWindows(
  roomNameById: Map<string, string>,
  a: WindowRow,
  b: WindowRow
): number {
  const roomA = roomNameById.get(a.room_id) ?? "";
  const roomB = roomNameById.get(b.room_id) ?? "";
  return (
    roomPriority(roomA) - roomPriority(roomB) ||
    roomA.localeCompare(roomB, undefined, { numeric: true }) ||
    String(a.label ?? "").localeCompare(String(b.label ?? ""), undefined, { numeric: true }) ||
    a.id.localeCompare(b.id)
  );
}

function closeEnough(a: number | null, b: number): boolean {
  return a !== null && Math.abs(a - b) < 0.001;
}

function desiredRoomName(blindType: BlindType): string {
  return blindType === "screen" ? "Living Room" : "Bedroom 1";
}

function buildDesiredBlinds(unit: WorkbookUnit): DesiredBlind[] {
  let livingIndex = 0;
  let bedroomIndex = 0;
  const protectedInstalled = PROTECTED_INSTALLED_UNITS.has(unit.unitNumber);

  return unit.blinds.map((blind, index) => {
    const targetRoomName = desiredRoomName(blind.blindType);
    const targetIndex = blind.blindType === "screen" ? ++livingIndex : ++bedroomIndex;
    return {
      ...blind,
      index,
      targetRoomName,
      targetLabel:
        blind.blindType === "screen"
          ? `Living Room ${targetIndex}`
          : `Bedroom ${targetIndex}`,
      finalInstalled: protectedInstalled ? true : blind.workbookInstalled,
    };
  });
}

function scoreWindowCandidate(
  desired: DesiredBlind,
  windowRow: WindowRow,
  roomNameById: Map<string, string>
): number {
  let score = 0;
  if (windowRow.blind_type !== desired.blindType) score += 100;
  if (!closeEnough(windowRow.width, desired.width)) score += 30;
  if (!closeEnough(windowRow.height, desired.height)) score += 30;
  if ((roomNameById.get(windowRow.room_id) ?? "") !== desired.targetRoomName) score += 10;
  return score;
}

function assignWindows(
  desiredBlinds: DesiredBlind[],
  existingWindows: WindowRow[],
  roomNameById: Map<string, string>
): { assignments: WindowAssignment[]; extras: WindowRow[] } {
  const unused = new Set(existingWindows.map((windowRow) => windowRow.id));
  const sortedExisting = [...existingWindows].sort((a, b) =>
    compareExistingWindows(roomNameById, a, b)
  );

  const assignments = desiredBlinds.map((desired) => {
    let selected: WindowRow | null = null;
    let selectedScore = Number.POSITIVE_INFINITY;

    for (const windowRow of sortedExisting) {
      if (!unused.has(windowRow.id)) continue;
      const score = scoreWindowCandidate(desired, windowRow, roomNameById);
      if (score < selectedScore) {
        selected = windowRow;
        selectedScore = score;
      }
    }

    if (selected) unused.delete(selected.id);
    return { desired, existingWindow: selected };
  });

  return {
    assignments,
    extras: sortedExisting.filter((windowRow) => unused.has(windowRow.id)),
  };
}

function buildPlan(workbookUnits: WorkbookUnit[], loaded: LoadedData): Plan {
  const errors: string[] = [];
  const warnings: string[] = [];
  const anomalies: string[] = [];
  const runId = `lansdowne-b-produced-${new Date().toISOString().replace(/[:.]/g, "-")}`;

  const totalBlinds = workbookUnits.reduce((sum, unit) => sum + unit.blinds.length, 0);
  if (workbookUnits.length !== EXPECTED_UNIT_COUNT) {
    errors.push(`Expected ${EXPECTED_UNIT_COUNT} units, parsed ${workbookUnits.length}.`);
  }
  if (totalBlinds !== EXPECTED_BLIND_COUNT) {
    errors.push(`Expected ${EXPECTED_BLIND_COUNT} blinds, parsed ${totalBlinds}.`);
  }

  const unitNumbers = new Set<string>();
  for (const unit of workbookUnits) {
    if (unitNumbers.has(unit.unitNumber)) {
      errors.push(`Duplicate workbook unit ${unit.unitNumber}.`);
    }
    unitNumbers.add(unit.unitNumber);
    if (unit.qty !== null && unit.qty !== unit.blinds.length) {
      anomalies.push(
        `Unit ${unit.unitNumber}: Qty blinds says ${unit.qty}, parsed ${unit.blinds.length} blind rows.`
      );
    }
    for (const blind of unit.blinds) {
      if (!["B/O", "3%", "0.03"].includes(blind.rawFabric)) {
        anomalies.push(
          `Unit ${unit.unitNumber} row ${blind.sourceRow}: normalized fabric "${blind.rawFabric}" to ${blind.blindType}.`
        );
      }
    }
  }

  const dbUnitsByNumber = new Map<string, UnitRow>();
  const dbUnitNumberCounts = new Map<string, number>();
  for (const unit of loaded.units) {
    dbUnitNumberCounts.set(unit.unit_number, (dbUnitNumberCounts.get(unit.unit_number) ?? 0) + 1);
    if (!dbUnitsByNumber.has(unit.unit_number)) dbUnitsByNumber.set(unit.unit_number, unit);
  }
  for (const [unitNumber, count] of dbUnitNumberCounts) {
    if (count > 1 && unitNumbers.has(unitNumber)) {
      errors.push(`Building has ${count} DB rows for unit ${unitNumber}; cannot safely import.`);
    }
  }

  const roomsByUnit = new Map<string, RoomRow[]>();
  const roomNameById = new Map<string, string>();
  for (const room of loaded.rooms) {
    const existing = roomsByUnit.get(room.unit_id) ?? [];
    existing.push(room);
    roomsByUnit.set(room.unit_id, existing);
    roomNameById.set(room.id, room.name);
  }

  const unitIdByRoomId = new Map(loaded.rooms.map((room) => [room.id, room.unit_id]));
  const windowsByUnit = new Map<string, WindowRow[]>();
  for (const windowRow of loaded.windows) {
    const unitId = unitIdByRoomId.get(windowRow.room_id);
    if (!unitId) continue;
    const existing = windowsByUnit.get(unitId) ?? [];
    existing.push(windowRow);
    windowsByUnit.set(unitId, existing);
  }

  const mediaByWindowId = new Map<string, MediaRow[]>();
  for (const media of loaded.mediaRows) {
    if (!media.window_id) continue;
    const existing = mediaByWindowId.get(media.window_id) ?? [];
    existing.push(media);
    mediaByWindowId.set(media.window_id, existing);
  }

  const plannedUnits = workbookUnits.map((workbookUnit) => {
    const dbUnit = dbUnitsByNumber.get(workbookUnit.unitNumber) ?? null;
    const desiredBlinds = buildDesiredBlinds(workbookUnit);
    const allInstalled = desiredBlinds.every((blind) => blind.finalInstalled);
    const targetStatus: PlannedUnit["targetStatus"] = allInstalled ? "installed" : "manufactured";
    const desiredRoomNames = [...new Set(desiredBlinds.map((blind) => blind.targetRoomName))];

    let assignments: WindowAssignment[] = desiredBlinds.map((desired) => ({
      desired,
      existingWindow: null,
    }));
    let extraWindowsToDelete: WindowRow[] = [];
    let roomsToCreate = desiredRoomNames;

    if (dbUnit) {
      const existingRooms = roomsByUnit.get(dbUnit.id) ?? [];
      roomsToCreate = desiredRoomNames.filter(
        (roomName) => !existingRooms.some((room) => room.name === roomName)
      );
      const existingWindows = windowsByUnit.get(dbUnit.id) ?? [];
      const assigned = assignWindows(desiredBlinds, existingWindows, roomNameById);
      assignments = assigned.assignments;
      extraWindowsToDelete = assigned.extras;

      const mediaExtras = extraWindowsToDelete.filter(
        (windowRow) => (mediaByWindowId.get(windowRow.id) ?? []).length > 0
      );
      if (mediaExtras.length > 0) {
        errors.push(
          `Unit ${workbookUnit.unitNumber}: ${mediaExtras.length} extra windows have media; refusing to delete them.`
        );
      }

      const workbookInstalledCount = workbookUnit.blinds.filter((blind) => blind.workbookInstalled).length;
      const liveInstalledCount = existingWindows.filter((windowRow) => windowRow.installed).length;
      if (workbookInstalledCount < workbookUnit.blinds.length && liveInstalledCount > workbookInstalledCount) {
        const suffix = PROTECTED_INSTALLED_UNITS.has(workbookUnit.unitNumber)
          ? "protected; keeping installed"
          : "not protected; workbook will override";
        warnings.push(
          `Unit ${workbookUnit.unitNumber}: workbook ${workbookInstalledCount}/${workbookUnit.blinds.length} installed, DB ${liveInstalledCount}/${existingWindows.length} installed (${suffix}).`
        );
      }
    }

    return {
      workbookUnit,
      dbUnit,
      desiredBlinds,
      targetStatus,
      measurementDate: TODAY,
      bracketingDate: TODAY,
      installationDate: allInstalled ? TODAY : NEXT_INSTALL_DATE,
      completeByDate: allInstalled ? TODAY : NEXT_INSTALL_DATE,
      assignments,
      extraWindowsToDelete,
      roomsToCreate,
      protectsInstalledOverride: PROTECTED_INSTALLED_UNITS.has(workbookUnit.unitNumber),
    };
  });

  const missingUnits = plannedUnits.filter((unit) => !unit.dbUnit).map((unit) => unit.workbookUnit.unitNumber);
  if (missingUnits.length > 0) {
    warnings.push(`Workbook units missing from DB and planned for creation: ${missingUnits.join(", ")}.`);
  }

  return { runId, workbookUnits, plannedUnits, loaded, errors, warnings, anomalies };
}

function printPlan(plan: Plan, mode: Mode): void {
  const totalBlinds = plan.workbookUnits.reduce((sum, unit) => sum + unit.blinds.length, 0);
  const installedUnits = plan.plannedUnits.filter((unit) => unit.targetStatus === "installed").length;
  const manufacturedUnits = plan.plannedUnits.filter((unit) => unit.targetStatus === "manufactured").length;
  const inserts = plan.plannedUnits.reduce(
    (sum, unit) => sum + unit.assignments.filter((assignment) => !assignment.existingWindow).length,
    0
  );
  const updates = plan.plannedUnits.reduce(
    (sum, unit) => sum + unit.assignments.filter((assignment) => assignment.existingWindow).length,
    0
  );
  const windowDeletes = plan.plannedUnits.reduce(
    (sum, unit) => sum + unit.extraWindowsToDelete.length,
    0
  );
  const protectedUnits = plan.plannedUnits
    .filter((unit) => unit.protectsInstalledOverride)
    .map((unit) => unit.workbookUnit.unitNumber);

  console.log(`Mode: ${mode}`);
  console.log(`Run id: ${plan.runId}`);
  console.log(`Workbook units: ${plan.workbookUnits.length}`);
  console.log(`Workbook blinds: ${totalBlinds}`);
  console.log(`Target installed units: ${installedUnits}`);
  console.log(`Target manufactured units: ${manufacturedUnits}`);
  console.log(`Window updates: ${updates}`);
  console.log(`Window inserts: ${inserts}`);
  console.log(`Window deletes without media: ${windowDeletes}`);
  console.log("Planned photo/media deletes: 0");
  console.log(`Protected installed units: ${protectedUnits.join(", ")}`);

  if (plan.anomalies.length > 0) {
    console.log("\nAnomalies:");
    for (const anomaly of plan.anomalies) console.log(`- ${anomaly}`);
  }

  if (plan.warnings.length > 0) {
    console.log("\nWarnings:");
    for (const warning of plan.warnings) console.log(`- ${warning}`);
  }

  if (plan.errors.length > 0) {
    console.log("\nErrors:");
    for (const error of plan.errors) console.log(`- ${error}`);
  }
}

function ensureBackupDir(backupDir: string): void {
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
}

function writeBackup(plan: Plan, backupDir: string): string {
  ensureBackupDir(backupDir);
  const path = join(backupDir, `${plan.runId}-backup.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        runId: plan.runId,
        createdAt: new Date().toISOString(),
        constants: {
          buildingId: plan.loaded.building.id,
          today: TODAY,
          nextInstallDate: NEXT_INSTALL_DATE,
          protectedInstalledUnits: [...PROTECTED_INSTALLED_UNITS],
        },
        workbookUnits: plan.workbookUnits,
        units: plan.loaded.units.filter((unit) =>
          plan.workbookUnits.some((workbookUnit) => workbookUnit.unitNumber === unit.unit_number)
        ),
        rooms: plan.loaded.rooms,
        windows: plan.loaded.windows,
        productionRows: plan.loaded.productionRows,
        mediaRows: plan.loaded.mediaRows,
        scheduleEntries: plan.loaded.scheduleEntries,
        activityLogs: plan.loaded.activityLogs,
      },
      null,
      2
    )
  );
  return path;
}

async function getRoomIdsForUnit(
  supabase: ReturnType<typeof createAdminClient>,
  unitId: string,
  plannedUnit: PlannedUnit
): Promise<Map<string, string>> {
  const { data: currentRooms, error: currentRoomsError } = await supabase
    .from("rooms")
    .select("*")
    .eq("unit_id", unitId);
  if (currentRoomsError) throw new Error(`Load rooms for ${plannedUnit.workbookUnit.unitNumber}: ${currentRoomsError.message}`);

  const roomIds = new Map<string, string>();
  for (const room of (currentRooms ?? []) as RoomRow[]) {
    if (!roomIds.has(room.name)) roomIds.set(room.name, room.id);
  }

  for (const roomName of plannedUnit.roomsToCreate) {
    if (roomIds.has(roomName)) continue;
    const { data: inserted, error } = await supabase
      .from("rooms")
      .insert({
        id: `room-${crypto.randomUUID()}`,
        unit_id: unitId,
        name: roomName,
        window_count: 0,
        completed_windows: 0,
      })
      .select("*")
      .single();
    if (error) throw new Error(`Create room ${plannedUnit.workbookUnit.unitNumber}/${roomName}: ${error.message}`);
    roomIds.set((inserted as RoomRow).name, (inserted as RoomRow).id);
  }

  return roomIds;
}

async function createMissingUnit(
  supabase: ReturnType<typeof createAdminClient>,
  plan: Plan,
  plannedUnit: PlannedUnit
): Promise<UnitRow> {
  const unitId = `unit-${crypto.randomUUID().slice(0, 8)}`;
  const { data, error } = await supabase
    .from("units")
    .insert({
      id: unitId,
      building_id: plan.loaded.building.id,
      client_id: plan.loaded.client.id,
      client_name: plan.loaded.client.name,
      building_name: plan.loaded.building.name,
      unit_number: plannedUnit.workbookUnit.unitNumber,
      status: "not_started",
      risk_flag: "green",
      measurement_date: plannedUnit.measurementDate,
      bracketing_date: plannedUnit.bracketingDate,
      installation_date: plannedUnit.installationDate,
      complete_by_date: plannedUnit.completeByDate,
      room_count: 0,
      window_count: 0,
      photos_uploaded: 0,
      notes_count: 0,
    })
    .select("*")
    .single();
  if (error) throw new Error(`Create unit ${plannedUnit.workbookUnit.unitNumber}: ${error.message}`);
  return data as UnitRow;
}

async function upsertProductionStatus(
  supabase: ReturnType<typeof createAdminClient>,
  windowId: string,
  unitId: string,
  existing: ProductionRow | undefined,
  now: string
): Promise<void> {
  if (existing) {
    const { error } = await supabase
      .from("window_production_status")
      .update({
        unit_id: unitId,
        status: "qc_approved",
        cut_at: existing.cut_at ?? now,
        assembled_at: existing.assembled_at ?? now,
        qc_approved_at: existing.qc_approved_at ?? now,
      })
      .eq("window_id", windowId);
    if (error) throw new Error(`Update production status ${windowId}: ${error.message}`);
    return;
  }

  const { error } = await supabase.from("window_production_status").insert({
    id: `wps-${crypto.randomUUID().slice(0, 8)}`,
    window_id: windowId,
    unit_id: unitId,
    status: "qc_approved",
    cut_at: now,
    assembled_at: now,
    qc_approved_at: now,
    issue_status: "none",
    issue_reason: "",
    issue_notes: "",
    cut_notes: "",
    assembled_notes: "",
    qc_notes: "one-off Lansdowne B produced blinds import",
  });
  if (error) throw new Error(`Insert production status ${windowId}: ${error.message}`);
}

async function upsertScheduleEntry(
  supabase: ReturnType<typeof createAdminClient>,
  plannedUnit: PlannedUnit,
  unit: UnitRow,
  existingEntries: ScheduleEntryRow[],
  taskType: TaskType,
  taskDate: string
): Promise<void> {
  const existing = existingEntries.find((entry) => entry.task_type === taskType);
  if (existing) {
    const { error } = await supabase
      .from("schedule_entries")
      .update({
        task_date: taskDate,
        status: plannedUnit.targetStatus,
        risk_flag: "green",
        unit_number: plannedUnit.workbookUnit.unitNumber,
        building_name: unit.building_name,
        client_name: unit.client_name,
      })
      .eq("id", existing.id);
    if (error) throw new Error(`Update ${taskType} schedule for ${plannedUnit.workbookUnit.unitNumber}: ${error.message}`);
    return;
  }

  const { error } = await supabase.from("schedule_entries").insert({
    id: `sch-${crypto.randomUUID().slice(0, 8)}`,
    unit_id: unit.id,
    unit_number: plannedUnit.workbookUnit.unitNumber,
    building_name: unit.building_name,
    client_name: unit.client_name,
    task_type: taskType,
    task_date: taskDate,
    status: plannedUnit.targetStatus,
    risk_flag: "green",
  });
  if (error) throw new Error(`Insert ${taskType} schedule for ${plannedUnit.workbookUnit.unitNumber}: ${error.message}`);
}

async function refreshAggregates(
  supabase: ReturnType<typeof createAdminClient>,
  unitId: string
): Promise<void> {
  const { data: rooms, error: roomsError } = await supabase
    .from("rooms")
    .select("id")
    .eq("unit_id", unitId);
  if (roomsError) throw new Error(`Refresh rooms ${unitId}: ${roomsError.message}`);

  const roomIds = ((rooms ?? []) as Array<{ id: string }>).map((room) => room.id);
  for (const roomId of roomIds) {
    const { data: windows, error: windowsError } = await supabase
      .from("windows")
      .select("id, measured")
      .eq("room_id", roomId);
    if (windowsError) throw new Error(`Refresh room windows ${roomId}: ${windowsError.message}`);
    const roomWindows = (windows ?? []) as Array<{ id: string; measured: boolean }>;
    const { error } = await supabase
      .from("rooms")
      .update({
        window_count: roomWindows.length,
        completed_windows: roomWindows.filter((windowRow) => windowRow.measured).length,
      })
      .eq("id", roomId);
    if (error) throw new Error(`Update room aggregate ${roomId}: ${error.message}`);
  }

  const [{ count: windowCount, error: windowCountError }, { count: mediaCount, error: mediaCountError }] =
    await Promise.all([
      roomIds.length
        ? supabase.from("windows").select("*", { count: "exact", head: true }).in("room_id", roomIds)
        : Promise.resolve({ count: 0, error: null }),
      supabase.from("media_uploads").select("*", { count: "exact", head: true }).eq("unit_id", unitId),
    ]);
  if (windowCountError) throw new Error(`Window count ${unitId}: ${windowCountError.message}`);
  if (mediaCountError) throw new Error(`Media count ${unitId}: ${mediaCountError.message}`);

  const { error } = await supabase
    .from("units")
    .update({
      room_count: roomIds.length,
      window_count: windowCount ?? 0,
      photos_uploaded: mediaCount ?? 0,
    })
    .eq("id", unitId);
  if (error) throw new Error(`Update unit aggregate ${unitId}: ${error.message}`);
}

async function applyPlan(plan: Plan, backupDir: string): Promise<string> {
  if (plan.errors.length > 0) {
    throw new Error("Refusing to apply while plan has errors.");
  }

  const backupPath = writeBackup(plan, backupDir);
  const supabase = createAdminClient();
  const productionByWindowId = new Map(
    plan.loaded.productionRows.map((row) => [row.window_id, row])
  );
  const scheduleByUnitId = new Map<string, ScheduleEntryRow[]>();
  for (const entry of plan.loaded.scheduleEntries) {
    const existing = scheduleByUnitId.get(entry.unit_id) ?? [];
    existing.push(entry);
    scheduleByUnitId.set(entry.unit_id, existing);
  }
  const now = new Date().toISOString();

  for (const plannedUnit of plan.plannedUnits) {
    const unit = plannedUnit.dbUnit ?? (await createMissingUnit(supabase, plan, plannedUnit));
    const roomIds = await getRoomIdsForUnit(supabase, unit.id, plannedUnit);
    const windowIdsForUnit: string[] = [];

    for (const assignment of plannedUnit.assignments) {
      const roomId = roomIds.get(assignment.desired.targetRoomName);
      if (!roomId) {
        throw new Error(`No room ${assignment.desired.targetRoomName} for ${plannedUnit.workbookUnit.unitNumber}.`);
      }

      if (assignment.existingWindow) {
        const windowId = assignment.existingWindow.id;
        const { error } = await supabase
          .from("windows")
          .update({
            room_id: roomId,
            label: assignment.desired.targetLabel,
            blind_type: assignment.desired.blindType,
            width: assignment.desired.width,
            height: assignment.desired.height,
            measured: true,
            bracketed: true,
            installed: assignment.desired.finalInstalled,
          })
          .eq("id", windowId);
        if (error) throw new Error(`Update window ${windowId}: ${error.message}`);

        const { error: mediaRoomError } = await supabase
          .from("media_uploads")
          .update({ room_id: roomId, unit_id: unit.id })
          .eq("window_id", windowId);
        if (mediaRoomError) throw new Error(`Relink media ${windowId}: ${mediaRoomError.message}`);

        await upsertProductionStatus(
          supabase,
          windowId,
          unit.id,
          productionByWindowId.get(windowId),
          now
        );
        windowIdsForUnit.push(windowId);
      } else {
        const windowId = `win-${crypto.randomUUID()}`;
        const { error } = await supabase.from("windows").insert({
          id: windowId,
          room_id: roomId,
          label: assignment.desired.targetLabel,
          blind_type: assignment.desired.blindType,
          width: assignment.desired.width,
          height: assignment.desired.height,
          depth: null,
          notes: "",
          risk_flag: "green",
          photo_url: null,
          measured: true,
          bracketed: true,
          installed: assignment.desired.finalInstalled,
          chain_side: null,
          window_installation: "inside",
          wand_chain: null,
          fabric_adjustment_side: "none",
          fabric_adjustment_inches: null,
        });
        if (error) throw new Error(`Insert window ${plannedUnit.workbookUnit.unitNumber}: ${error.message}`);

        await upsertProductionStatus(supabase, windowId, unit.id, undefined, now);
        windowIdsForUnit.push(windowId);
      }
    }

    for (const extraWindow of plannedUnit.extraWindowsToDelete) {
      const { count, error: mediaCountError } = await supabase
        .from("media_uploads")
        .select("*", { count: "exact", head: true })
        .eq("window_id", extraWindow.id);
      if (mediaCountError) throw new Error(`Check extra window media ${extraWindow.id}: ${mediaCountError.message}`);
      if ((count ?? 0) > 0) {
        throw new Error(`Refusing to delete extra media-linked window ${extraWindow.id}.`);
      }
      const { error } = await supabase.from("windows").delete().eq("id", extraWindow.id);
      if (error) throw new Error(`Delete extra window ${extraWindow.id}: ${error.message}`);
    }

    const { error: unitError } = await supabase
      .from("units")
      .update({
        status: plannedUnit.targetStatus,
        risk_flag: "green",
        measurement_date: plannedUnit.measurementDate,
        bracketing_date: plannedUnit.bracketingDate,
        installation_date: plannedUnit.installationDate,
        complete_by_date: plannedUnit.completeByDate,
      })
      .eq("id", unit.id);
    if (unitError) throw new Error(`Update unit ${plannedUnit.workbookUnit.unitNumber}: ${unitError.message}`);

    const existingSchedule = scheduleByUnitId.get(unit.id) ?? [];
    await upsertScheduleEntry(supabase, plannedUnit, unit, existingSchedule, "measurement", plannedUnit.measurementDate);
    await upsertScheduleEntry(supabase, plannedUnit, unit, existingSchedule, "bracketing", plannedUnit.bracketingDate);
    await upsertScheduleEntry(supabase, plannedUnit, unit, existingSchedule, "installation", plannedUnit.installationDate);

    await refreshAggregates(supabase, unit.id);

    const { error: logError } = await supabase.from("unit_activity_log").insert({
      id: `log-${crypto.randomUUID()}`,
      unit_id: unit.id,
      actor_role: "system",
      actor_name: "Lansdowne B import",
      action: "lansdowne_b_produced_blinds_imported",
      details: {
        runId: plan.runId,
        source: DEFAULT_FILE,
        workbookUnit: plannedUnit.workbookUnit.unitNumber,
        workbookBlindRows: plannedUnit.workbookUnit.blinds.length,
        protectedInstalledOverride: plannedUnit.protectsInstalledOverride,
        targetStatus: plannedUnit.targetStatus,
        dates: {
          measurementDate: plannedUnit.measurementDate,
          bracketingDate: plannedUnit.bracketingDate,
          installationDate: plannedUnit.installationDate,
          completeByDate: plannedUnit.completeByDate,
        },
        windowIds: windowIdsForUnit,
      },
      created_at: now,
    });
    if (logError) throw new Error(`Insert activity log ${plannedUnit.workbookUnit.unitNumber}: ${logError.message}`);
  }

  return backupPath;
}

async function verify(args: Args, workbookUnits: WorkbookUnit[]): Promise<string[]> {
  const loaded = await loadData(args.buildingId, workbookUnits);
  const unitByNumber = new Map(loaded.units.map((unit) => [unit.unit_number, unit]));
  const roomsByUnit = new Map<string, RoomRow[]>();
  for (const room of loaded.rooms) {
    const existing = roomsByUnit.get(room.unit_id) ?? [];
    existing.push(room);
    roomsByUnit.set(room.unit_id, existing);
  }
  const unitIdByRoom = new Map(loaded.rooms.map((room) => [room.id, room.unit_id]));
  const windowsByUnit = new Map<string, WindowRow[]>();
  for (const windowRow of loaded.windows) {
    const unitId = unitIdByRoom.get(windowRow.room_id);
    if (!unitId) continue;
    const existing = windowsByUnit.get(unitId) ?? [];
    existing.push(windowRow);
    windowsByUnit.set(unitId, existing);
  }
  const productionByWindow = new Map(loaded.productionRows.map((row) => [row.window_id, row]));
  const mediaRowsTouched = loaded.mediaRows.length;

  const failures: string[] = [];
  for (const workbookUnit of workbookUnits) {
    const unit = unitByNumber.get(workbookUnit.unitNumber);
    if (!unit) {
      failures.push(`Missing unit ${workbookUnit.unitNumber}.`);
      continue;
    }
    const desired = buildDesiredBlinds(workbookUnit);
    const windows = windowsByUnit.get(unit.id) ?? [];
    const installedCount = windows.filter((windowRow) => windowRow.installed).length;
    const qcCount = windows.filter((windowRow) => productionByWindow.get(windowRow.id)?.status === "qc_approved").length;
    const expectedInstalled = desired.filter((blind) => blind.finalInstalled).length;
    const allInstalled = expectedInstalled === desired.length;
    const expectedDate = allInstalled ? TODAY : NEXT_INSTALL_DATE;

    if (windows.length !== desired.length) {
      failures.push(`Unit ${workbookUnit.unitNumber}: expected ${desired.length} windows, found ${windows.length}.`);
    }
    if (installedCount !== expectedInstalled) {
      failures.push(
        `Unit ${workbookUnit.unitNumber}: expected ${expectedInstalled} installed windows, found ${installedCount}.`
      );
    }
    if (qcCount !== desired.length) {
      failures.push(`Unit ${workbookUnit.unitNumber}: expected ${desired.length} qc_approved rows, found ${qcCount}.`);
    }
    if (unit.status !== (allInstalled ? "installed" : "manufactured")) {
      failures.push(`Unit ${workbookUnit.unitNumber}: expected status ${allInstalled ? "installed" : "manufactured"}, found ${unit.status}.`);
    }
    if (unit.measurement_date !== TODAY || unit.bracketing_date !== TODAY) {
      failures.push(`Unit ${workbookUnit.unitNumber}: measurement/bracketing dates are not ${TODAY}.`);
    }
    if (unit.installation_date !== expectedDate || unit.complete_by_date !== expectedDate) {
      failures.push(`Unit ${workbookUnit.unitNumber}: install/complete-by dates are not ${expectedDate}.`);
    }
  }

  const spotChecks = ["2901", "1802", "602", "502", "402", "2801", "401"];
  const lines = [`Verification touched media rows preserved in place: ${mediaRowsTouched}`];
  for (const unitNumber of spotChecks) {
    const unit = unitByNumber.get(unitNumber);
    if (!unit) {
      lines.push(`${unitNumber}: missing`);
      continue;
    }
    const windows = windowsByUnit.get(unit.id) ?? [];
    lines.push(
      `${unitNumber}: status=${unit.status}, windows=${windows.length}, installed=${windows.filter((windowRow) => windowRow.installed).length}, measurement=${unit.measurement_date}, bracket=${unit.bracketing_date}, install=${unit.installation_date}, completeBy=${unit.complete_by_date}`
    );
  }

  if (failures.length > 0) {
    lines.push("Verification failures:");
    lines.push(...failures.map((failure) => `- ${failure}`));
  } else {
    lines.push("Verification passed.");
  }

  return lines;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const workbookUnits = parseWorkbook(args.file);

  if (args.mode === "verify") {
    const lines = await verify(args, workbookUnits);
    console.log(lines.join("\n"));
    return;
  }

  const loaded = await loadData(args.buildingId, workbookUnits);
  const plan = buildPlan(workbookUnits, loaded);
  printPlan(plan, args.mode);

  if (plan.errors.length > 0) {
    process.exitCode = 1;
    return;
  }

  if (args.mode === "dry-run") {
    console.log("\nDry-run only. No database writes performed.");
    return;
  }

  const backupPath = await applyPlan(plan, args.backupDir);
  console.log(`\nBackup written: ${backupPath}`);
  const lines = await verify(args, workbookUnits);
  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
