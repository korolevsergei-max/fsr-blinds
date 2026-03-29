export const UNIT_STATUSES = [
  "not_started",
  "measured",
  "bracketed",
  "installed",
  "client_approved",
] as const;

export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  not_started: "Not Yet Started",
  measured: "Measured",
  bracketed: "Bracketed",
  installed: "Installed",
  client_approved: "Approved",
};

export const UNIT_STATUS_ORDER: Record<UnitStatus, number> = {
  not_started: 0,
  measured: 1,
  bracketed: 2,
  installed: 3,
  client_approved: 4,
};

export const UNIT_PHOTO_STAGES = [
  "scheduled_bracketing",
  "bracketed_measured",
  "installed_pending_approval",
] as const;

export type UnitPhotoStage = (typeof UNIT_PHOTO_STAGES)[number];

export const UNIT_PHOTO_STAGE_LABELS: Record<UnitPhotoStage, string> = {
  scheduled_bracketing: "Scheduled for Bracketing",
  bracketed_measured: "Bracketed & Measured",
  installed_pending_approval: "Installed, Awaiting Approval",
};

export const UNIT_PHOTO_STAGE_HELPERS: Record<UnitPhotoStage, string> = {
  scheduled_bracketing: "Before-bracketing photos (first set).",
  bracketed_measured: "After-bracketing photos (second set).",
  installed_pending_approval: "Completion photos waiting for client approval.",
};

export type RiskFlag = "green" | "yellow" | "red";

export const RISK_LABELS: Record<RiskFlag, string> = {
  green: "No Issue",
  yellow: "Needs Escalation",
  red: "Timeline at Risk",
};

export type BlindType = "screen" | "blackout";

export const UNIT_PRIORITIES = ["low", "medium", "high"] as const;

export type UnitPriority = (typeof UNIT_PRIORITIES)[number];

export const UNIT_PRIORITY_LABELS: Record<UnitPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

export interface Client {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
}

export interface Building {
  id: string;
  clientId: string;
  name: string;
  address: string;
}

export interface Unit {
  id: string;
  buildingId: string;
  clientId: string;
  clientName: string;
  buildingName: string;
  unitNumber: string;
  status: UnitStatus;
  assignedInstallerId: string | null;
  assignedInstallerName: string | null;
  measurementDate: string | null;
  bracketingDate: string | null;
  installationDate: string | null;
  earliestBracketingDate: string | null;
  earliestInstallationDate?: string | null;
  /** @deprecated kept for historical activity logs only; not actively scheduled */
  completeByDate?: string | null;
  roomCount: number;
  windowCount: number;
  photosUploaded: number;
  notesCount: number;
  createdAt: string | null;
}

export interface UnitActivityLog {
  id: string;
  unitId: string;
  actorRole: string;
  actorName: string;
  action: string;
  details: Record<string, unknown> | null;
  createdAt: string;
}

export interface Room {
  id: string;
  unitId: string;
  name: string;
  windowCount: number;
  completedWindows: number;
}

export interface Window {
  id: string;
  roomId: string;
  label: string;
  blindType: BlindType;
  riskFlag: RiskFlag;
  width: number | null;
  height: number | null;
  depth: number | null;
  blindWidth: number | null;
  blindHeight: number | null;
  blindDepth: number | null;
  notes: string;
  photoUrl: string | null;
  measured: boolean;
}

export interface Installer {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatarUrl: string;
  authUserId: string | null;
}

export interface Manufacturer {
  id: string;
  name: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  authUserId: string | null;
}

export interface Scheduler {
  id: string;
  name: string;
  email: string;
  phone: string;
  authUserId: string | null;
}

export interface ScheduleEntry {
  id: string;
  unitId: string;
  unitNumber: string;
  buildingName: string;
  clientName: string;
  ownerUserId: string | null;
  ownerName: string | null;
  taskType: "measurement" | "bracketing" | "installation";
  date: string;
  /** Derived unit progress status; kept as string to handle legacy DB values safely. */
  status: string;
}

export interface Notification {
  id: string;
  recipientRole: string;
  recipientId: string;
  type: string;
  title: string;
  body: string;
  relatedWeekStart: string | null;
  createdAt: string;
  read: boolean;
}
