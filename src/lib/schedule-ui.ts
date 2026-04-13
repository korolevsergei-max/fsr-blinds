export type ScheduleScope = "today" | "week" | "month";
export type ScheduleInstallDateFilter = "all" | "today" | "week" | "month";

export const SCHEDULE_SCOPE_LABELS: Record<ScheduleScope, string> = {
  today: "Today",
  week: "Week",
  month: "Month",
};

export const SCHEDULE_INSTALL_DATE_FILTER_LABELS: Record<ScheduleInstallDateFilter, string> = {
  all: "All dates",
  today: "Today",
  week: "This week",
  month: "This month",
};

export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

export function getWeekStart(baseDate: Date): Date {
  const monday = new Date(baseDate);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export function getWeekDays(baseDate: Date): Date[] {
  const monday = getWeekStart(baseDate);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + index);
    return day;
  });
}

export function getMonthDays(year: number, monthIndex: number): Date[] {
  const firstDay = new Date(year, monthIndex, 1);
  const startDow = firstDay.getDay();
  const startOffset = startDow === 0 ? -6 : 1 - startDow;
  const start = new Date(year, monthIndex, 1 + startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

export function isDateWithinInterval(
  dateKey: string | null | undefined,
  startKey: string,
  endKey: string
): boolean {
  if (!dateKey) return false;
  return dateKey >= startKey && dateKey <= endKey;
}

export function getScopeInterval(
  scope: ScheduleScope,
  today: Date,
  weekOffset: number,
  monthOffset: number
): { startKey: string; endKey: string; label: string; days: Date[]; monthBase: Date } {
  const todayKey = formatDateKey(today);

  if (scope === "today") {
    const day = new Date(today);
    day.setHours(0, 0, 0, 0);
    return {
      startKey: todayKey,
      endKey: todayKey,
      label: day.toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" }),
      days: [day],
      monthBase: new Date(day.getFullYear(), day.getMonth(), 1),
    };
  }

  if (scope === "week") {
    const baseWeek = new Date(today);
    baseWeek.setDate(today.getDate() + weekOffset * 7);
    const days = getWeekDays(baseWeek);
    return {
      startKey: formatDateKey(days[0]),
      endKey: formatDateKey(days[6]),
      label: `${days[0].toLocaleDateString("en-CA", { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString("en-CA", { month: "short", day: "numeric" })}`,
      days,
      monthBase: new Date(days[0].getFullYear(), days[0].getMonth(), 1),
    };
  }

  const monthBase = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  const days = getMonthDays(monthBase.getFullYear(), monthBase.getMonth());
  const monthEnd = new Date(monthBase.getFullYear(), monthBase.getMonth() + 1, 0);
  return {
    startKey: formatDateKey(monthBase),
    endKey: formatDateKey(monthEnd),
    label: monthBase.toLocaleDateString("en-CA", { month: "long", year: "numeric" }),
    days,
    monthBase,
  };
}

export function matchesInstallDateFilter(
  dateKey: string | null | undefined,
  filter: ScheduleInstallDateFilter,
  today: Date
): boolean {
  if (filter === "all") return true;
  if (!dateKey) return false;

  const todayKey = formatDateKey(today);
  if (filter === "today") {
    return dateKey === todayKey;
  }

  if (filter === "week") {
    const weekDays = getWeekDays(today);
    return isDateWithinInterval(dateKey, formatDateKey(weekDays[0]), formatDateKey(weekDays[6]));
  }

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return isDateWithinInterval(dateKey, formatDateKey(monthStart), formatDateKey(monthEnd));
}
