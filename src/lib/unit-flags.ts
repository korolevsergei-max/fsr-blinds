import type { Unit } from "./types";

export type UnitFlag =
  | "past_bracketing_due"
  | "past_install_due"
  | "missing_installer"
  | "missing_bracketing_date"
  | "missing_installation_date"
  | "late_schedule"
  | "at_risk";

export const DONE_STATUSES = new Set(["installed_pending_approval", "client_approved"]);

export function isUnitDone(unit: Unit): boolean {
  return DONE_STATUSES.has(unit.status);
}

/**
 * Compute operational flags for a unit based on today's date string (YYYY-MM-DD).
 * Returns an empty array for completed/approved units.
 */
export function computeUnitFlags(unit: Unit, todayStr: string): UnitFlag[] {
  if (isUnitDone(unit)) return [];

  const flags: UnitFlag[] = [];

  if (!unit.assignedInstallerId) flags.push("missing_installer");
  if (!unit.bracketingDate) flags.push("missing_bracketing_date");

  if (
    unit.bracketingDate &&
    unit.bracketingDate < todayStr &&
    unit.status === "scheduled_bracketing"
  ) {
    flags.push("past_bracketing_due");
  }

  if (!unit.installationDate) {
    if (
      unit.status === "bracketed_measured" ||
      unit.status === "install_date_scheduled"
    ) {
      flags.push("missing_installation_date");
    }
  } else {
    if (
      unit.installationDate < todayStr &&
      unit.status !== "installed_pending_approval" &&
      unit.status !== "client_approved"
    ) {
      flags.push("past_install_due");
    }

    if (unit.completeByDate && unit.installationDate > unit.completeByDate) {
      flags.push("late_schedule");
    }
  }

  if (unit.completeByDate && !flags.includes("past_install_due")) {
    const daysUntilDue = Math.floor(
      (new Date(unit.completeByDate).getTime() - new Date(todayStr).getTime()) / 86400000
    );
    if (daysUntilDue >= 0 && daysUntilDue <= 3) {
      flags.push("at_risk");
    }
  }

  return flags;
}

export type FlaggedUnit = Unit & { flags: UnitFlag[] };

export function flagUnits(units: Unit[], todayStr: string): FlaggedUnit[] {
  return units.map((u) => ({ ...u, flags: computeUnitFlags(u, todayStr) }));
}

export const FLAG_LABELS: Record<UnitFlag, string> = {
  past_bracketing_due:    "Past Bracketing Date",
  past_install_due:       "Past Install Date",
  missing_installer:      "No Installer Assigned",
  missing_bracketing_date:"No Bracket Date",
  missing_installation_date: "No Install Date",
  late_schedule:          "Install After Deadline",
  at_risk:                "At Risk",
};

export const FLAG_CLASSES: Record<UnitFlag, string> = {
  past_bracketing_due:    "bg-orange-100 text-orange-700",
  past_install_due:       "bg-red-100 text-red-700",
  missing_installer:      "bg-zinc-100 text-zinc-600",
  missing_bracketing_date:"bg-zinc-100 text-zinc-600",
  missing_installation_date: "bg-zinc-100 text-zinc-600",
  late_schedule:          "bg-amber-100 text-amber-700",
  at_risk:                "bg-orange-100 text-orange-700",
};
