import { parseStoredDate } from "./created-date";
import type { Unit } from "./types";

export type UnitFlag =
  | "past_bracketing_due"
  | "past_install_due"
  | "missing_installer"
  | "missing_measurement_date"
  | "missing_bracketing_date"
  | "missing_installation_date"
  | "at_risk";

export const DONE_STATUSES = new Set(["installed", "client_approved"]);

export function isUnitDone(unit: Unit): boolean {
  return DONE_STATUSES.has(unit.status);
}

/**
 * Compute operational flags for a unit based on today's date string (YYYY-MM-DD).
 * Returns an empty array for completed/approved units.
 * Installation date is the target completion date.
 */
export function computeUnitFlags(unit: Unit, todayStr: string): UnitFlag[] {
  if (isUnitDone(unit)) return [];

  const flags: UnitFlag[] = [];

  if (!unit.assignedInstallerId) flags.push("missing_installer");
  if (!unit.measurementDate) flags.push("missing_measurement_date");
  if (!unit.bracketingDate) flags.push("missing_bracketing_date");

  if (
    unit.bracketingDate &&
    unit.bracketingDate < todayStr &&
    unit.status === "not_started"
  ) {
    flags.push("past_bracketing_due");
  }

  if (!unit.installationDate) {
    if (unit.status === "measured" || unit.status === "bracketed") {
      flags.push("missing_installation_date");
    }
  } else {
    if (
      unit.installationDate < todayStr &&
      unit.status !== "installed" &&
      unit.status !== "client_approved"
    ) {
      flags.push("past_install_due");
    }

    // Warn if installation is within 3 days and not yet installed
    const installDay = parseStoredDate(unit.installationDate);
    const todayDay = parseStoredDate(todayStr);
    const daysUntilInstall =
      installDay && todayDay
        ? Math.floor((installDay.getTime() - todayDay.getTime()) / 86400000)
        : NaN;
    if (
      daysUntilInstall >= 0 &&
      daysUntilInstall <= 3 &&
      unit.status !== "installed" &&
      unit.status !== "client_approved"
    ) {
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
  past_bracketing_due:       "Past Bracketing Date",
  past_install_due:          "Past Install Date",
  missing_installer:         "No Installer Assigned",
  missing_measurement_date:  "No Measurement Date",
  missing_bracketing_date:   "No Bracket Date",
  missing_installation_date: "No Install Date",
  at_risk:                   "Install Soon",
};

export const FLAG_CLASSES: Record<UnitFlag, string> = {
  past_bracketing_due:       "bg-orange-100 text-orange-700",
  past_install_due:          "bg-red-100 text-red-700",
  missing_installer:         "bg-zinc-100 text-zinc-600",
  missing_measurement_date:  "bg-zinc-100 text-zinc-600",
  missing_bracketing_date:   "bg-zinc-100 text-zinc-600",
  missing_installation_date: "bg-zinc-100 text-zinc-600",
  at_risk:                   "bg-orange-100 text-orange-700",
};
