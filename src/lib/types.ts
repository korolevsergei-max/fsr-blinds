export const UNIT_STATUSES = [
  "not_started",
  "measured",
  "bracketed",
  "measured_and_bracketed",
  "installed",
] as const;

export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  not_started: "Not Yet Started",
  measured: "Measured",
  bracketed: "Bracketed",
  measured_and_bracketed: "Measured & Bracketed",
  installed: "Installed",
};

/** Progress depth for simple comparisons (measured and bracketed are parallel at 1). */
export const UNIT_STATUS_ORDER: Record<UnitStatus, number> = {
  not_started: 0,
  measured: 1,
  bracketed: 1,
  measured_and_bracketed: 2,
  installed: 3,
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

export type ProductionStatus = "pending" | "built" | "qc_approved";

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  pending: "Pending",
  built: "Built",
  qc_approved: "QC Approved",
};

export interface WindowProductionStatus {
  id: string;
  windowId: string;
  unitId: string;
  status: ProductionStatus;
  builtByManufacturerId: string | null;
  builtAt: string | null;
  builtNotes: string;
  qcApprovedByQcId: string | null;
  qcApprovedAt: string | null;
  qcNotes: string;
  createdAt: string;
}

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
  assignedSchedulerId?: string | null;
  assignedSchedulerName?: string | null;
  measurementDate: string | null;
  bracketingDate: string | null;
  installationDate: string | null;
  earliestBracketingDate: string | null;
  earliestInstallationDate?: string | null;
  /** Static client deadline set by owner or scheduler; does not drive status or flags. */
  completeByDate?: string | null;
  roomCount: number;
  windowCount: number;
  photosUploaded: number;
  notesCount: number;
  createdAt: string | null;
  assignedAt?: string | null;
  manufacturingRiskFlag?: RiskFlag;
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
  bracketed: boolean;
  installed: boolean;
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

export interface QCPerson {
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
