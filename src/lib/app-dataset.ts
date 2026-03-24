import type {
  Building,
  Client,
  Installer,
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
