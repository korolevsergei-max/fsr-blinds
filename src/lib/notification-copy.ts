import { UNIT_STATUS_LABELS, type RiskFlag, type UnitStatus } from "./types.ts";

export type UnitNotificationContext = {
  clientName: string;
  buildingName: string;
  unitNumber: string;
};

export type UnitDatesNotificationInput = {
  measurementDate?: string | null;
  bracketingDate?: string | null;
  installationDate?: string | null;
  completeByDate?: string | null;
};

function clean(value: string | null | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export function formatUnitContextLine(context: UnitNotificationContext): string {
  const clientName = clean(context.clientName, "Unknown client");
  const buildingName = clean(context.buildingName, "Unknown building");
  const unitNumber = clean(context.unitNumber, "Unknown unit");
  return `${clientName} • ${buildingName} • Unit ${unitNumber}`;
}

export function buildUnitProgressNotificationBody(
  context: UnitNotificationContext,
  status: UnitStatus
): string {
  const statusLabel = UNIT_STATUS_LABELS[status].toLowerCase();
  return `${formatUnitContextLine(context)} is now ${statusLabel}.`;
}

export function buildUnitAssignedNotificationBody(
  context: UnitNotificationContext,
  assignedBy: string
): string {
  return `${formatUnitContextLine(context)}\nAssigned by ${clean(assignedBy, "System")}.`;
}

export function buildUnitDatesNotificationBody(
  context: UnitNotificationContext,
  dates: UnitDatesNotificationInput
): string {
  const lines = [formatUnitContextLine(context)];

  if (dates.measurementDate) {
    lines.push(`Measurement: ${dates.measurementDate}`);
  }
  if (dates.bracketingDate) {
    lines.push(`Bracketing: ${dates.bracketingDate}`);
  }
  if (dates.installationDate) {
    lines.push(`Installation: ${dates.installationDate}`);
  }
  if (dates.completeByDate) {
    lines.push(`Complete by: ${dates.completeByDate}`);
  }

  return lines.join("\n");
}

export function buildCompleteByDateChangedNotificationBody(
  context: UnitNotificationContext,
  completeByDate: string | null
): string {
  return [formatUnitContextLine(context), completeByDate ? `Complete by: ${completeByDate}` : "Complete by date removed."]
    .join("\n");
}

export function buildWindowEscalationNotificationBody(
  context: UnitNotificationContext,
  {
    roomName,
    windowLabel,
    riskFlag,
  }: {
    roomName: string;
    windowLabel: string;
    riskFlag: Exclude<RiskFlag, "green" | "complete">;
  }
): string {
  const room = clean(roomName, "Room");
  const window = clean(windowLabel, "Window");
  return `${formatUnitContextLine(context)} • ${room} • ${window} flagged ${riskFlag}.`;
}

export function buildManufacturingRiskNotificationBody(
  context: UnitNotificationContext,
  daysUntil: number
): string {
  return `${formatUnitContextLine(context)} • Ready-by target in ${daysUntil} day(s); blinds are not built fully yet.`;
}

export function buildManufacturingPushbackNotificationBody(
  context: UnitNotificationContext,
  {
    roomName,
    windowLabel,
    sourceRole,
    targetRole,
    reason,
    notes,
  }: {
    roomName: string;
    windowLabel: string;
    sourceRole: string;
    targetRole: string;
    reason: string;
    notes?: string;
  }
): string {
  const room = clean(roomName, "Room");
  const window = clean(windowLabel, "Window");
  const summary = clean(reason, "Manufacturing pushback");
  const extra = clean(notes, "");
  return `${formatUnitContextLine(context)} • ${room} • ${window} returned ${sourceRole} -> ${targetRole}: ${summary}${extra ? ` (${extra})` : ""}.`;
}

export function buildManufacturingPushbackResolvedBody(
  context: UnitNotificationContext,
  {
    roomName,
    windowLabel,
    targetRole,
  }: {
    roomName: string;
    windowLabel: string;
    targetRole: string;
  }
): string {
  const room = clean(roomName, "Room");
  const window = clean(windowLabel, "Window");
  return `${formatUnitContextLine(context)} • ${room} • ${window} rework for ${targetRole} has been completed.`;
}
