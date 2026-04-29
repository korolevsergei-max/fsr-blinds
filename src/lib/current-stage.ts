import type { CurrentStage, UnitStatus } from "./types";

export function deriveCurrentStageFromCounts({
  totalWindows,
  measuredCount,
  bracketedCount,
  cutCount,
  assembledCount,
  qcCount,
  installedCount,
  hasOpenPostInstallIssue = false,
}: {
  totalWindows: number;
  measuredCount: number;
  bracketedCount: number;
  cutCount: number;
  assembledCount: number;
  qcCount: number;
  installedCount: number;
  hasOpenPostInstallIssue?: boolean;
}): CurrentStage {
  if (hasOpenPostInstallIssue) return "post_install_issue";
  if (totalWindows === 0) return "not_started";
  if (installedCount >= totalWindows) return "installation";
  if (qcCount >= totalWindows) return "qc";
  if (assembledCount > 0) return "assembling";
  if (cutCount > 0) return "cutting";

  const measuredAll = measuredCount >= totalWindows;
  const bracketedAll = bracketedCount >= totalWindows;
  if (bracketedAll) return "bracketing";
  if (measuredAll) return "measurement";
  if (bracketedCount > 0) return "bracketing";
  if (measuredCount > 0) return "measurement";
  return "not_started";
}

export function getUnitCurrentStage(unit: {
  currentStage?: CurrentStage;
  status: UnitStatus;
  hasOpenPostInstallIssue?: boolean;
}): CurrentStage {
  if (unit.currentStage) return unit.currentStage;
  if (unit.hasOpenPostInstallIssue) return "post_install_issue";

  switch (unit.status) {
    case "installed":
      return "installation";
    case "manufactured":
      return "qc";
    case "bracketed":
      return "bracketing";
    case "measured":
      return "measurement";
    default:
      return "not_started";
  }
}
