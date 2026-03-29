import type { Unit } from "./types";

/** Primary date for year/month dashboard filters (installation-first). */
export function getUnitFilterDate(unit: Unit): string | null {
  return (
    unit.installationDate ??
    unit.earliestInstallationDate ??
    unit.bracketingDate ??
    unit.measurementDate ??
    null
  );
}

export function unitMatchesYearMonth(
  unit: Unit,
  yearFilter: string,
  monthFilter: string
): boolean {
  if (yearFilter === "all") return true;
  const raw = getUnitFilterDate(unit);
  if (!raw) return false;
  const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getFullYear() !== parseInt(yearFilter, 10)) return false;
  if (monthFilter !== "all" && date.getMonth() + 1 !== parseInt(monthFilter, 10)) {
    return false;
  }
  return true;
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function buildMonthFilterOptions(): { value: string; label: string }[] {
  return [
    { value: "all", label: "All months" },
    ...MONTH_NAMES.map((label, i) => ({ value: String(i + 1), label })),
  ];
}

export function buildYearOptions(units: Unit[]): { value: string; label: string }[] {
  const years = new Set<number>();
  for (const u of units) {
    const raw = getUnitFilterDate(u);
    if (!raw) continue;
    const date = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
    if (!Number.isNaN(date.getTime())) years.add(date.getFullYear());
  }
  years.add(new Date().getFullYear());
  const sorted = Array.from(years).sort((a, b) => b - a);
  return [{ value: "all", label: "All years" }, ...sorted.map((y) => ({ value: String(y), label: String(y) }))];
}
