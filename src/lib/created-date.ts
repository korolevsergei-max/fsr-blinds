/** "all" or local calendar day as `YYYY-MM-DD` (from `<input type="date">`). */
export type AddedDateFilter = "all" | string;

/** Local calendar day (`YYYY-MM-DD`) for an ISO `created_at` timestamp. */
export function createdAtToLocalYmd(createdAt: string | null | undefined): string | null {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const YMD_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse stored dates the same way as `DateInput`: plain `YYYY-MM-DD` is a local calendar day,
 * not UTC midnight (which would shift the displayed day behind UTC-0 in many timezones).
 * Any other string is parsed as a full ISO timestamp.
 */
export function parseStoredDate(value: string): Date | null {
  const v = value.trim();
  if (YMD_ONLY.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  const t = new Date(v);
  return Number.isNaN(t.getTime()) ? null : t;
}

const DEFAULT_STORED_DATE_DISPLAY: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  year: "numeric",
};

/** Short label for scheduled (`YYYY-MM-DD`) or completion (ISO) timestamps. */
export function formatStoredDateForDisplay(
  value: string | null | undefined,
  locale: string | undefined = "en-CA",
  options: Intl.DateTimeFormatOptions = DEFAULT_STORED_DATE_DISPLAY
): string | null {
  if (!value) return null;
  const parsed = parseStoredDate(value);
  if (!parsed) return null;
  return parsed.toLocaleDateString(locale, options);
}

/**
 * True if `createdAt` falls on the given calendar day in the user's local timezone.
 */
export function isCreatedOnLocalDay(createdAt: string | null, ymd: string): boolean {
  if (!createdAt) return false;
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return local === ymd;
}

export function formatAddedDateLabel(ymd: string): string {
  return formatStoredDateForDisplay(ymd, undefined, DEFAULT_STORED_DATE_DISPLAY) ?? ymd;
}

/**
 * True if a `YYYY-MM-DD` stored date string matches the filter day.
 * Uses `parseStoredDate` so plain date strings are treated as local calendar days.
 */
export function isStoredDateOnLocalDay(storedDate: string | null | undefined, ymd: string): boolean {
  if (!storedDate) return false;
  const parsed = parseStoredDate(storedDate);
  if (!parsed) return false;
  const pad = (n: number) => String(n).padStart(2, "0");
  const local = `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  return local === ymd;
}
