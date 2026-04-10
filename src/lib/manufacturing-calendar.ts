export interface ManufacturingCalendarSettings {
  applyOntarioHolidays: boolean;
}

export interface ManufacturingCalendarOverride {
  workDate: string;
  isWorking: boolean;
  label: string;
}

const HOLIDAY_NAMES: Record<string, string> = {
  new_years_day: "New Year's Day",
  family_day: "Family Day",
  good_friday: "Good Friday",
  victoria_day: "Victoria Day",
  canada_day: "Canada Day",
  civic_holiday: "Civic Holiday",
  labour_day: "Labour Day",
  thanksgiving: "Thanksgiving",
  christmas_day: "Christmas Day",
  boxing_day: "Boxing Day",
};

function formatDateKey(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function parseDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T00:00:00`);
}

export function addDays(dateKey: string, amount: number): string {
  const date = parseDateKey(dateKey);
  date.setDate(date.getDate() + amount);
  return formatDateKey(date);
}

export function isWeekend(dateKey: string): boolean {
  const day = parseDateKey(dateKey).getDay();
  return day === 0 || day === 6;
}

function nthWeekdayOfMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  ordinal: number
): Date {
  const first = new Date(year, monthIndex, 1);
  const offset = (7 + weekday - first.getDay()) % 7;
  return new Date(year, monthIndex, 1 + offset + (ordinal - 1) * 7);
}

function lastWeekdayBeforeDay(
  year: number,
  monthIndex: number,
  weekday: number,
  dayOfMonthExclusive: number
): Date {
  const date = new Date(year, monthIndex, dayOfMonthExclusive - 1);
  while (date.getDay() !== weekday) {
    date.setDate(date.getDate() - 1);
  }
  return date;
}

function calculateEasterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function observeFixedHoliday(year: number, monthIndex: number, dayOfMonth: number): Date {
  const date = new Date(year, monthIndex, dayOfMonth);
  const dow = date.getDay();
  if (dow === 0) {
    date.setDate(date.getDate() + 1);
  } else if (dow === 6) {
    date.setDate(date.getDate() + 2);
  }
  return date;
}

export function getOntarioHolidayMap(year: number): Map<string, string> {
  const holidays = new Map<string, string>();
  const add = (date: Date, key: keyof typeof HOLIDAY_NAMES) => {
    holidays.set(formatDateKey(date), HOLIDAY_NAMES[key]);
  };

  add(observeFixedHoliday(year, 0, 1), "new_years_day");
  add(nthWeekdayOfMonth(year, 1, 1, 3), "family_day");

  const easter = calculateEasterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setDate(easter.getDate() - 2);
  add(goodFriday, "good_friday");

  add(lastWeekdayBeforeDay(year, 4, 1, 25), "victoria_day");
  add(observeFixedHoliday(year, 6, 1), "canada_day");
  add(nthWeekdayOfMonth(year, 7, 1, 1), "civic_holiday");
  add(nthWeekdayOfMonth(year, 8, 1, 1), "labour_day");
  add(nthWeekdayOfMonth(year, 9, 1, 2), "thanksgiving");
  add(observeFixedHoliday(year, 11, 25), "christmas_day");

  const christmasObserved = observeFixedHoliday(year, 11, 25);
  const boxingBase = new Date(year, 11, 26);
  const boxingObserved = new Date(boxingBase);
  const boxingDow = boxingBase.getDay();
  if (boxingDow === 0) {
    boxingObserved.setDate(27);
  } else if (boxingDow === 6) {
    boxingObserved.setDate(28);
  }
  if (formatDateKey(boxingObserved) === formatDateKey(christmasObserved)) {
    boxingObserved.setDate(boxingObserved.getDate() + 1);
  }
  add(boxingObserved, "boxing_day");

  return holidays;
}

export function getOntarioHolidayName(dateKey: string): string | null {
  const year = parseDateKey(dateKey).getFullYear();
  return getOntarioHolidayMap(year).get(dateKey) ?? null;
}

export function isWorkingDay(
  dateKey: string,
  settings: ManufacturingCalendarSettings,
  overrides: Map<string, ManufacturingCalendarOverride>
): boolean {
  const override = overrides.get(dateKey);
  if (override) return override.isWorking;
  if (isWeekend(dateKey)) return false;
  if (settings.applyOntarioHolidays && getOntarioHolidayName(dateKey)) return false;
  return true;
}

export function addWorkingDays(
  dateKey: string,
  amount: number,
  settings: ManufacturingCalendarSettings,
  overrides: Map<string, ManufacturingCalendarOverride>
): string {
  if (amount === 0) return dateKey;

  let current = dateKey;
  const step = amount > 0 ? 1 : -1;
  let remaining = Math.abs(amount);

  while (remaining > 0) {
    current = addDays(current, step);
    if (isWorkingDay(current, settings, overrides)) {
      remaining -= 1;
    }
  }

  return current;
}

export function listMonthDays(year: number, monthIndex: number): string[] {
  const first = new Date(year, monthIndex, 1);
  const start = new Date(first);
  const offset = first.getDay() === 0 ? -6 : 1 - first.getDay();
  start.setDate(first.getDate() + offset);

  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return formatDateKey(day);
  });
}
