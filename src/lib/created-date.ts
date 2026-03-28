/** "all" or local calendar day as `YYYY-MM-DD` (from `<input type="date">`). */
export type AddedDateFilter = "all" | string;

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
  const parts = ymd.split("-").map(Number);
  const y = parts[0];
  const m = parts[1];
  const day = parts[2];
  if (!y || !m || !day) return ymd;
  return new Date(y, m - 1, day).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
