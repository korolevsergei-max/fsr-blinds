import type { AppDataset } from "./app-dataset";
import type { RiskFlag } from "./types";

export type UnitEscalationSummary = {
  roomId: string;
  roomName: string;
  windowId: string;
  windowLabel: string;
  riskFlag: RiskFlag;
  issueType: "manufacturing" | "client_approval";
  note: string;
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

export function getUnitEscalations(
  data: AppDataset,
  unitId: string
): UnitEscalationSummary[] {
  const roomMap = new Map(
    data.rooms
      .filter((room) => room.unitId === unitId)
      .map((room) => [room.id, room.name])
  );

  return data.windows
    .filter((window) => roomMap.has(window.roomId) && window.riskFlag !== "green")
    .map((window) => ({
      roomId: window.roomId,
      roomName: roomMap.get(window.roomId) ?? "Room",
      windowId: window.id,
      windowLabel: window.label,
      riskFlag: window.riskFlag,
      issueType:
        window.installed && window.riskFlag === "red"
          ? "client_approval"
          : "manufacturing",
      note: window.notes.trim() || describeRiskFlag(window.riskFlag),
    }))
    .sort((a, b) => {
      const roomCompare = a.roomName.localeCompare(b.roomName);
      return roomCompare !== 0 ? roomCompare : a.windowLabel.localeCompare(b.windowLabel);
    });
}
