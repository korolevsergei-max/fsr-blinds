import type { AppDataset } from "./app-dataset";
import type { RiskFlag } from "./types";

export type EscalationRiskFlag = "green" | "yellow" | "red";
type ManufacturingRole = "cutter" | "assembler" | "qc";
const ROLE_LABELS: Record<ManufacturingRole, string> = {
  cutter: "Cutter",
  assembler: "Assembly",
  qc: "Quality Control",
};

export type UnitEscalationSummary = {
  roomId: string;
  roomName: string;
  windowId: string;
  windowLabel: string;
  riskFlag: RiskFlag;
  issueType: "manufacturing" | "client_approval" | "manufacturing_pushback";
  note: string;
  reason?: string;
  sourceRole?: ManufacturingRole;
  targetRole?: ManufacturingRole;
  openedAt?: string;
};

export type OpenPostInstallIssueTarget = {
  issueId: string;
  roomId: string;
  roomName: string;
  windowId: string;
  windowLabel: string;
  openedAt: string;
};

export function describeRiskFlag(flag: RiskFlag): string {
  if (flag === "yellow") {
    return "Can proceed with concern or additional work.";
  }
  if (flag === "red") {
    return "Cannot proceed without escalation.";
  }
  return "No issues.";
}

export function formatManufacturingRoleLabel(role: ManufacturingRole): string {
  return ROLE_LABELS[role];
}

export function getHighestEscalationRiskFlag(flags: readonly RiskFlag[]): EscalationRiskFlag {
  if (flags.includes("red")) return "red";
  if (flags.includes("yellow")) return "yellow";
  return "green";
}

export function getRoomEscalationRiskFlag(
  windows: ReadonlyArray<{ riskFlag: RiskFlag }>
): EscalationRiskFlag {
  return getHighestEscalationRiskFlag(windows.map((window) => window.riskFlag));
}

export function getEscalationSurfaceClasses(
  flag: EscalationRiskFlag,
  variant: "card" | "room"
): string {
  if (variant === "room") {
    return flag === "red"
      ? "bg-red-600 text-white hover:bg-red-700"
      : flag === "yellow"
        ? "bg-amber-500 text-white hover:bg-amber-600"
        : "bg-accent text-white hover:opacity-90";
  }

  return flag === "red"
    ? "border-red-300 bg-red-50"
    : flag === "yellow"
      ? "border-amber-300 bg-amber-50"
      : "border-border bg-white";
}

export function getOpenPostInstallIssueTargets(
  data: AppDataset,
  unitId: string
): OpenPostInstallIssueTarget[] {
  const roomsById = new Map(
    data.rooms
      .filter((room) => room.unitId === unitId)
      .map((room) => [room.id, room])
  );
  const windowsById = new Map(
    data.windows
      .filter((window) => roomsById.has(window.roomId))
      .map((window) => [window.id, window])
  );

  return data.postInstallIssues
    .filter((issue) => issue.unitId === unitId && issue.status === "open")
    .flatMap((issue) => {
      const window = windowsById.get(issue.windowId);
      const room = window ? roomsById.get(window.roomId) : undefined;
      if (!window || !room) return [];
      return {
        issueId: issue.id,
        roomId: room.id,
        roomName: room.name,
        windowId: issue.windowId,
        windowLabel: window.label,
        openedAt: issue.openedAt,
      };
    })
    .sort((a, b) => {
      const roomCompare = a.roomName.localeCompare(b.roomName);
      if (roomCompare !== 0) return roomCompare;
      const windowCompare = a.windowLabel.localeCompare(b.windowLabel);
      return windowCompare !== 0 ? windowCompare : b.openedAt.localeCompare(a.openedAt);
    });
}

export function getUnitEscalations(
  data: AppDataset,
  unitId: string
): UnitEscalationSummary[] {
  const roomMap = new Map(
    data.rooms
      .filter((room) => room.unitId === unitId)
      .map((room) => [room.id, room.name])
  );
  const windowMap = new Map(
    data.windows
      .filter((window) => roomMap.has(window.roomId))
      .map((window) => [window.id, window])
  );

  const fieldEscalations = data.windows
    .filter((window) => roomMap.has(window.roomId) && window.riskFlag !== "green")
    .map((window) => ({
      roomId: window.roomId,
      roomName: roomMap.get(window.roomId) ?? "Room",
      windowId: window.id,
      windowLabel: window.label,
      riskFlag: window.riskFlag,
      issueType: (window.installed && window.riskFlag === "red"
        ? "client_approval"
        : "manufacturing") as "manufacturing" | "client_approval",
      note: window.notes.trim() || describeRiskFlag(window.riskFlag),
    }));

  const manufacturingEscalations = data.manufacturingEscalations
    .filter((escalation) => escalation.unitId === unitId && escalation.status === "open")
    .map((escalation) => {
      const window = windowMap.get(escalation.windowId);
      const roomId = window?.roomId ?? "";
      const roomName = roomId ? roomMap.get(roomId) ?? "Room" : "Manufacturing";
      const reason = escalation.reason.trim();
      const notes = escalation.notes.trim();
      return {
        roomId,
        roomName,
        windowId: escalation.windowId,
        windowLabel: window?.label ?? "Window",
        riskFlag: "red" as const,
        issueType: "manufacturing_pushback" as const,
        note: notes || reason || "Returned for manufacturing rework.",
        reason,
        sourceRole: escalation.sourceRole,
        targetRole: escalation.targetRole,
        openedAt: escalation.openedAt,
      };
    });

  return [...manufacturingEscalations, ...fieldEscalations]
    .sort((a, b) => {
      if (a.issueType !== b.issueType) {
        return a.issueType === "manufacturing_pushback" ? -1 : 1;
      }
      const roomCompare = a.roomName.localeCompare(b.roomName);
      return roomCompare !== 0 ? roomCompare : a.windowLabel.localeCompare(b.windowLabel);
    });
}

export function formatUnitEscalationDetail(item: UnitEscalationSummary): string {
  if (item.issueType === "manufacturing_pushback") {
    const route =
      item.sourceRole && item.targetRole
        ? `${formatManufacturingRoleLabel(item.sourceRole)} to ${formatManufacturingRoleLabel(item.targetRole)}`
        : "Manufacturing pushback";
    const reason = item.reason ? ` (${item.reason})` : "";
    const notes = item.note ? ` - ${item.note}` : "";
    return `${route}${reason}${notes}`;
  }

  return item.note;
}
