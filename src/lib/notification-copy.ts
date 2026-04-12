import { UNIT_STATUS_LABELS, type RiskFlag, type UnitStatus } from "./types.ts";

export type UnitNotificationContext = {
  clientName: string;
  buildingName: string;
  unitNumber: string;
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
  return `${formatUnitContextLine(context)} • Ready-by target in ${daysUntil} day(s); blinds are not QC-approved yet.`;
}
