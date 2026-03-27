import type {
  Building,
  Client,
  Installer,
  Manufacturer,
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
  manufacturers: Manufacturer[];
  schedulers: Scheduler[];
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
