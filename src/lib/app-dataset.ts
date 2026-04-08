import type {
  Building,
  Client,
  Installer,
  Cutter,
  Scheduler,
  Room,
  ScheduleEntry,
  Unit,
  Window,
} from "./types";

export type AppDataset = {
  clients: Client[];
  buildings: Building[];
  units: Unit[];
  rooms: Room[];
  windows: Window[];
  installers: Installer[];
  schedule: ScheduleEntry[];
  cutters: Cutter[];
  schedulers: Scheduler[];
  /** unit_id → scheduler_id mapping (populated in management portal). */
  unitSchedulerByUnit?: Record<string, string>;
};

export function getUnitsByInstaller(
  data: AppDataset,
  installerId: string
): Unit[] {
  return data.units.filter((u) => u.assignedInstallerId === installerId);
}

export function getRoomsByUnit(data: AppDataset, unitId: string): Room[] {
  return data.rooms.filter((r) => r.unitId === unitId);
}

export function getWindowsByRoom(data: AppDataset, roomId: string): Window[] {
  return data.windows.filter((w) => w.roomId === roomId);
}

export function getScheduleByInstaller(
  data: AppDataset,
  installerId: string
): ScheduleEntry[] {
  const installerUnits = new Set(
    data.units
      .filter((u) => u.assignedInstallerId === installerId)
      .map((u) => u.id)
  );
  return data.schedule.filter((s) => installerUnits.has(s.unitId));
}

export function getBuildingsByClient(
  data: AppDataset,
  clientId: string
): Building[] {
  return data.buildings.filter((b) => b.clientId === clientId);
}

export function getUnitsByBuilding(
  data: AppDataset,
  buildingId: string
): Unit[] {
  return data.units.filter((u) => u.buildingId === buildingId);
}

export function getScheduleByBuilding(
  data: AppDataset,
  buildingId: string
): ScheduleEntry[] {
  const buildingUnits = new Set(
    data.units.filter((u) => u.buildingId === buildingId).map((u) => u.id)
  );
  return data.schedule.filter((s) => buildingUnits.has(s.unitId));
}

export function getUnitIdsWithWindowEscalations(data: AppDataset): Set<string> {
  const roomToUnit = new Map<string, string>();
  for (const room of data.rooms) {
    roomToUnit.set(room.id, room.unitId);
  }

  const unitIds = new Set<string>();
  for (const w of data.windows) {
    if (w.riskFlag === "green") continue;
    const unitId = roomToUnit.get(w.roomId);
    if (unitId) unitIds.add(unitId);
  }

  return unitIds;
}

export function getInstallerColor(index: number) {
  const colors = [
    { bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-300" },
    { bg: "bg-purple-100", text: "text-purple-700", ring: "ring-purple-300" },
    { bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-300" },
    { bg: "bg-pink-100", text: "text-pink-700", ring: "ring-pink-300" },
    { bg: "bg-teal-100", text: "text-teal-700", ring: "ring-teal-300" },
    { bg: "bg-indigo-100", text: "text-indigo-700", ring: "ring-indigo-300" },
    { bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-300" },
    { bg: "bg-cyan-100", text: "text-cyan-700", ring: "ring-cyan-300" },
  ];
  return colors[index % colors.length];
}

export function getInitials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function getFloor(unitNumber: string): string {
  const num = parseInt(unitNumber, 10);
  if (isNaN(num)) return unitNumber[0] ?? "?";
  if (num < 200) return "1";
  if (num < 300) return "2";
  if (num < 400) return "3";
  if (num < 500) return "4";
  if (num < 600) return "5";
  if (num < 700) return "6";
  if (num < 800) return "7";
  if (num < 900) return "8";
  if (num < 1000) return "9";
  return Math.floor(num / 100).toString();
}
