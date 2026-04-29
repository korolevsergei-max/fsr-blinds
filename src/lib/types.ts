export const UNIT_STATUSES = [
  "not_started",
  "measured",
  "bracketed",
  "manufactured",
  "installed",
] as const;

export type UnitStatus = (typeof UNIT_STATUSES)[number];

export const UNIT_STATUS_LABELS: Record<UnitStatus, string> = {
  not_started: "Not Yet Started",
  measured: "Measured",
  bracketed: "Bracketed",
  manufactured: "Manufactured",
  installed: "Installed",
};

/** Progress depth for simple comparisons (measured and bracketed remain parallel at 1). */
export const UNIT_STATUS_ORDER: Record<UnitStatus, number> = {
  not_started: 0,
  measured: 1,
  bracketed: 1,
  manufactured: 2,
  installed: 3,
};

/**
 * Current-stage taxonomy for the new pipeline display.
 * Computed per-unit from window-level production data.
 * Measurement and bracketing are parallel — both must complete before cutting starts.
 */
export const CURRENT_STAGES = [
  "not_started",
  "measurement",
  "bracketing",
  "cutting",
  "assembling",
  "qc",
  "installation",
  "post_install_issue",
] as const;

export type CurrentStage = (typeof CURRENT_STAGES)[number];

export const CURRENT_STAGE_LABELS: Record<CurrentStage, string> = {
  not_started: "Not Yet Started",
  measurement: "Measured",
  bracketing: "Bracketed",
  cutting: "Cut",
  assembling: "Assembled",
  qc: "Quality Checked",
  installation: "Installed",
  post_install_issue: "Post-Install Issue",
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

export type RiskFlag = "green" | "yellow" | "red" | "complete";

export type ProductionStatus = "pending" | "cut" | "assembled" | "qc_approved";

export type ManufacturingIssueStatus = "none" | "open" | "resolved";

export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  pending: "Pending",
  cut: "Cut",
  assembled: "Assembled",
  qc_approved: "Built fully",
};

export interface WindowProductionStatus {
  id: string;
  windowId: string;
  unitId: string;
  status: ProductionStatus;
  cutByCutterId: string | null;
  cutAt: string | null;
  cutNotes: string;
  assembledByAssemblerId: string | null;
  assembledAt: string | null;
  assembledNotes: string;
  qcApprovedByAssemblerId: string | null;
  qcApprovedByQcId: string | null;
  qcApprovedAt: string | null;
  qcNotes: string;
  issueStatus: ManufacturingIssueStatus;
  issueReason: string;
  issueNotes: string;
  issueReportedByRole: string | null;
  issueReportedAt: string | null;
  issueResolvedAt: string | null;
  manufacturingLabelPrintedAt: string | null;
  packagingLabelPrintedAt: string | null;
  createdAt: string;
}

export interface ManufacturingSettings {
  id: string;
  cutterDailyCapacity: number;
  assemblerDailyCapacity: number;
  qcDailyCapacity: number;
  applyOntarioHolidays: boolean;
}

export interface ManufacturingCalendarOverride {
  id: string;
  workDate: string;
  isWorking: boolean;
  label: string;
}

export interface WindowManufacturingSchedule {
  id: string;
  windowId: string;
  unitId: string;
  targetReadyDate: string | null;
  scheduledCutDate: string | null;
  scheduledAssemblyDate: string | null;
  scheduledQcDate: string | null;
  manualPriority: number;
  isScheduleLocked: boolean;
  lockReason: string;
  lastRescheduleReason: string;
  overCapacityOverride: boolean;
  movedByUserId: string | null;
  movedAt: string | null;
}

export const RISK_LABELS: Record<RiskFlag, string> = {
  green: "On Track",
  yellow: "Needs Escalation",
  red: "Timeline at Risk",
  complete: "MFG Complete",
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
  /** New 7-stage taxonomy derived from window-level production data. Populated by server-data finalizer. */
  currentStage?: CurrentStage;
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
  hasOpenPostInstallIssue?: boolean;
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

export type ChainSide = "left" | "right";

export type WindowInstallation = "inside" | "outside";
export type WandChain = 30 | 40 | 50;
export type FabricAdjustmentSide = "none" | "left" | "right" | "centred";

export interface Window {
  id: string;
  roomId: string;
  label: string;
  blindType: BlindType;
  chainSide: ChainSide | null;
  riskFlag: RiskFlag;
  width: number | null;
  height: number | null;
  depth: number | null;
  windowInstallation: WindowInstallation;
  wandChain: WandChain | null;
  fabricAdjustmentSide: FabricAdjustmentSide;
  fabricAdjustmentInches: number | null;
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

export interface Cutter {
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

export interface Assembler {
  id: string;
  name: string;
  email: string;
  phone: string;
  authUserId: string | null;
}

export interface Qc {
  id: string;
  name: string;
  email: string;
  phone: string;
  authUserId: string | null;
}

export interface WindowManufacturingEscalation {
  id: string;
  windowId: string;
  unitId: string;
  sourceRole: "cutter" | "assembler" | "qc";
  targetRole: "cutter" | "assembler" | "qc";
  escalationType: "pushback" | "blocker";
  status: "open" | "resolved";
  reason: string;
  notes: string;
  openedByUserId: string | null;
  openedAt: string;
  resolvedByUserId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export type PostInstallIssueStatus = "open" | "resolved";

export interface WindowPostInstallIssueNote {
  id: string;
  issueId: string;
  authorUserId: string;
  authorRole: string;
  authorName: string | null;
  body: string;
  createdAt: string;
}

export interface WindowPostInstallIssue {
  id: string;
  windowId: string;
  unitId: string;
  openedByUserId: string;
  openedByRole: "owner" | "scheduler";
  openedByName: string | null;
  openedAt: string;
  resolvedByUserId: string | null;
  resolvedByName: string | null;
  resolvedAt: string | null;
  status: PostInstallIssueStatus;
  createdAt: string;
  notes: WindowPostInstallIssueNote[];
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
  /** Unit id for deep-link navigation (e.g. /scheduler/units/[id]). */
  relatedUnitId: string | null;
  createdAt: string;
  read: boolean;
}

export const PROGRESS_STAGES = [
  "measurement",
  "bracketing",
  "cutting",
  "assembling",
  "qc",
  "installation",
  "post_install_issue",
] as const;
export type ProgressStage = (typeof PROGRESS_STAGES)[number];

export const PROGRESS_STAGE_LETTERS: Record<ProgressStage, string> = {
  measurement: "M",
  bracketing: "B",
  cutting: "C",
  assembling: "A",
  qc: "Q",
  installation: "I",
  post_install_issue: "PI",
};

export const PROGRESS_STAGE_LABELS: Record<ProgressStage, string> = {
  measurement: "Measured",
  bracketing: "Bracketed",
  cutting: "Cut",
  assembling: "Assembled",
  qc: "Quality Checked",
  installation: "Installed",
  post_install_issue: "Post-Install Issue",
};
