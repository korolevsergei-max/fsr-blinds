import type {
  Client,
  Building,
  Unit,
  Room,
  Window,
  Installer,
  ScheduleEntry,
} from "./types";

export const installers: Installer[] = [
  {
    id: "inst-1",
    name: "Tom Uramowski",
    email: "tom.u@fsrblinds.ca",
    phone: "+1 (416) 823-4107",
    avatarUrl: "https://picsum.photos/seed/tom-uramowski/80/80",
  },
  {
    id: "inst-2",
    name: "Lindsay Okafor",
    email: "lindsay.o@fsrblinds.ca",
    phone: "+1 (647) 391-8562",
    avatarUrl: "https://picsum.photos/seed/lindsay-okafor/80/80",
  },
];

export const clients: Client[] = [
  {
    id: "client-1",
    name: "Granite Peak Developments",
    contactName: "Marcus Albrecht",
    contactEmail: "marcus@granitepeakdev.ca",
    contactPhone: "+1 (416) 555-7834",
  },
  {
    id: "client-2",
    name: "Lakeshore Construction Group",
    contactName: "Priya Nandakumar",
    contactEmail: "priya@lakeshorecg.ca",
    contactPhone: "+1 (905) 441-2290",
  },
];

export const buildings: Building[] = [
  {
    id: "bldg-1",
    clientId: "client-1",
    name: "The Weston Residences",
    address: "240 Weston Rd, Toronto, ON",
  },
  {
    id: "bldg-2",
    clientId: "client-1",
    name: "Bloor & Dundas Tower",
    address: "1801 Bloor St W, Toronto, ON",
  },
  {
    id: "bldg-3",
    clientId: "client-2",
    name: "Harbourfront Commons",
    address: "55 Lake Shore Blvd E, Toronto, ON",
  },
];

export const units: Unit[] = [
  {
    id: "unit-1",
    buildingId: "bldg-1",
    clientId: "client-1",
    clientName: "Granite Peak Developments",
    buildingName: "The Weston Residences",
    unitNumber: "Unit 1204",
    status: "scheduled_bracketing",
    riskFlag: "green",
    assignedInstallerId: "inst-1",
    assignedInstallerName: "Tom Uramowski",
    bracketingDate: "2026-03-23",
    installationDate: null,
    roomCount: 3,
    windowCount: 7,
    photosUploaded: 0,
    notesCount: 0,
  },
  {
    id: "unit-2",
    buildingId: "bldg-1",
    clientId: "client-1",
    clientName: "Granite Peak Developments",
    buildingName: "The Weston Residences",
    unitNumber: "Unit 1205",
    status: "pending_scheduling",
    riskFlag: "green",
    assignedInstallerId: "inst-1",
    assignedInstallerName: "Tom Uramowski",
    bracketingDate: null,
    installationDate: null,
    roomCount: 0,
    windowCount: 0,
    photosUploaded: 0,
    notesCount: 0,
  },
  {
    id: "unit-3",
    buildingId: "bldg-2",
    clientId: "client-1",
    clientName: "Granite Peak Developments",
    buildingName: "Bloor & Dundas Tower",
    unitNumber: "Unit 802",
    status: "bracketed_measured",
    riskFlag: "yellow",
    assignedInstallerId: "inst-1",
    assignedInstallerName: "Tom Uramowski",
    bracketingDate: "2026-03-20",
    installationDate: null,
    roomCount: 2,
    windowCount: 4,
    photosUploaded: 4,
    notesCount: 1,
  },
  {
    id: "unit-4",
    buildingId: "bldg-3",
    clientId: "client-2",
    clientName: "Lakeshore Construction Group",
    buildingName: "Harbourfront Commons",
    unitNumber: "Unit 305",
    status: "install_date_scheduled",
    riskFlag: "green",
    assignedInstallerId: "inst-2",
    assignedInstallerName: "Lindsay Okafor",
    bracketingDate: "2026-03-10",
    installationDate: "2026-04-14",
    roomCount: 4,
    windowCount: 9,
    photosUploaded: 9,
    notesCount: 2,
  },
  {
    id: "unit-5",
    buildingId: "bldg-3",
    clientId: "client-2",
    clientName: "Lakeshore Construction Group",
    buildingName: "Harbourfront Commons",
    unitNumber: "Unit 306",
    status: "installed_pending_approval",
    riskFlag: "red",
    assignedInstallerId: "inst-2",
    assignedInstallerName: "Lindsay Okafor",
    bracketingDate: "2026-03-08",
    installationDate: "2026-03-18",
    roomCount: 3,
    windowCount: 6,
    photosUploaded: 12,
    notesCount: 3,
  },
  {
    id: "unit-6",
    buildingId: "bldg-1",
    clientId: "client-1",
    clientName: "Granite Peak Developments",
    buildingName: "The Weston Residences",
    unitNumber: "Unit 1206",
    status: "client_approved",
    riskFlag: "green",
    assignedInstallerId: "inst-2",
    assignedInstallerName: "Lindsay Okafor",
    bracketingDate: "2026-02-15",
    installationDate: "2026-03-05",
    roomCount: 2,
    windowCount: 5,
    photosUploaded: 10,
    notesCount: 0,
  },
];

export const rooms: Room[] = [
  { id: "room-1", unitId: "unit-1", name: "Living Room", windowCount: 3, completedWindows: 0 },
  { id: "room-2", unitId: "unit-1", name: "Bedroom 1", windowCount: 2, completedWindows: 0 },
  { id: "room-3", unitId: "unit-1", name: "Bedroom 2", windowCount: 2, completedWindows: 0 },
  { id: "room-4", unitId: "unit-3", name: "Master Suite", windowCount: 2, completedWindows: 2 },
  { id: "room-5", unitId: "unit-3", name: "Kitchen", windowCount: 2, completedWindows: 2 },
  { id: "room-6", unitId: "unit-4", name: "Living Room", windowCount: 3, completedWindows: 3 },
  { id: "room-7", unitId: "unit-4", name: "Bedroom 1", windowCount: 2, completedWindows: 2 },
  { id: "room-8", unitId: "unit-4", name: "Bedroom 2", windowCount: 2, completedWindows: 2 },
  { id: "room-9", unitId: "unit-4", name: "Office", windowCount: 2, completedWindows: 2 },
];

export const windows: Window[] = [
  { id: "win-1", roomId: "room-1", label: "Window A", blindType: "screen", width: null, height: null, depth: null, notes: "", riskFlag: "green", photoUrl: null, measured: false },
  { id: "win-2", roomId: "room-1", label: "Window B", blindType: "blackout", width: null, height: null, depth: null, notes: "", riskFlag: "green", photoUrl: null, measured: false },
  { id: "win-3", roomId: "room-1", label: "Window C", blindType: "screen", width: null, height: null, depth: null, notes: "", riskFlag: "green", photoUrl: null, measured: false },
  { id: "win-4", roomId: "room-2", label: "Window A", blindType: "blackout", width: null, height: null, depth: null, notes: "", riskFlag: "green", photoUrl: null, measured: false },
  { id: "win-5", roomId: "room-2", label: "Window B", blindType: "blackout", width: null, height: null, depth: null, notes: "", riskFlag: "green", photoUrl: null, measured: false },
  { id: "win-6", roomId: "room-4", label: "Window A", blindType: "screen", width: 48.5, height: 72.25, depth: 3.5, notes: "Slight crack in frame, needs sealant before install", riskFlag: "yellow", photoUrl: "https://picsum.photos/seed/win6/400/300", measured: true },
  { id: "win-7", roomId: "room-4", label: "Window B", blindType: "blackout", width: 36, height: 60, depth: 4, notes: "", riskFlag: "green", photoUrl: "https://picsum.photos/seed/win7/400/300", measured: true },
  { id: "win-8", roomId: "room-5", label: "Window A", blindType: "screen", width: 24, height: 36, depth: 3, notes: "", riskFlag: "green", photoUrl: "https://picsum.photos/seed/win8/400/300", measured: true },
  { id: "win-9", roomId: "room-5", label: "Window B", blindType: "screen", width: 24, height: 36, depth: 3, notes: "", riskFlag: "green", photoUrl: "https://picsum.photos/seed/win9/400/300", measured: true },
];

export const schedule: ScheduleEntry[] = [
  { id: "sch-1", unitId: "unit-1", unitNumber: "Unit 1204", buildingName: "The Weston Residences", clientName: "Granite Peak Developments", taskType: "bracketing", date: "2026-03-23", status: "scheduled_bracketing", riskFlag: "green" },
  { id: "sch-2", unitId: "unit-2", unitNumber: "Unit 1205", buildingName: "The Weston Residences", clientName: "Granite Peak Developments", taskType: "bracketing", date: "2026-03-25", status: "pending_scheduling", riskFlag: "green" },
  { id: "sch-3", unitId: "unit-4", unitNumber: "Unit 305", buildingName: "Harbourfront Commons", clientName: "Lakeshore Construction Group", taskType: "installation", date: "2026-04-14", status: "install_date_scheduled", riskFlag: "green" },
  { id: "sch-4", unitId: "unit-3", unitNumber: "Unit 802", buildingName: "Bloor & Dundas Tower", clientName: "Granite Peak Developments", taskType: "bracketing", date: "2026-03-24", status: "bracketed_measured", riskFlag: "yellow" },
];

export function getUnitsByInstaller(installerId: string): Unit[] {
  return units.filter((u) => u.assignedInstallerId === installerId);
}

export function getRoomsByUnit(unitId: string): Room[] {
  return rooms.filter((r) => r.unitId === unitId);
}

export function getWindowsByRoom(roomId: string): Window[] {
  return windows.filter((w) => w.roomId === roomId);
}

export function getScheduleByInstaller(installerId: string): ScheduleEntry[] {
  const installerUnits = new Set(
    units.filter((u) => u.assignedInstallerId === installerId).map((u) => u.id)
  );
  return schedule.filter((s) => installerUnits.has(s.unitId));
}

export function getBuildingsByClient(clientId: string): Building[] {
  return buildings.filter((b) => b.clientId === clientId);
}

export function getUnitsByBuilding(buildingId: string): Unit[] {
  return units.filter((u) => u.buildingId === buildingId);
}
