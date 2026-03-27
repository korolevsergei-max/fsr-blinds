export type DateRange = "all" | "today" | "7d" | "14d" | "30d";

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  all: "Any time",
  today: "Today",
  "7d": "Last 7 days",
  "14d": "Last 14 days",
  "30d": "Last 30 days",
};

export function isWithinRange(dateStr: string | null, range: DateRange): boolean {
  if (range === "all" || !dateStr) return range === "all";

  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (range === "today") return diffDays < 1;
  if (range === "7d") return diffDays <= 7;
  if (range === "14d") return diffDays <= 14;
  if (range === "30d") return diffDays <= 30;

  return true;
}
