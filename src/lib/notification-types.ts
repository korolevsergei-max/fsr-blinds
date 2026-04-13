/**
 * Central registry of all in-app notification type constants.
 *
 * Each type maps to display metadata used by the shared NotificationsList UI.
 * Importing this file on the client is safe — no server-only code here.
 */

// ─── Scheduler types ──────────────────────────────────────────────────────────

/** Owner assigns unit(s) to this scheduler (grouped for bulk). */
export const NOTIF_UNIT_ASSIGNED_TO_SCHEDULER = "unit_assigned_to_scheduler";

/** Owner changes the "complete by" date on one of scheduler's units. */
export const NOTIF_COMPLETE_BY_DATE_CHANGED = "complete_by_date_changed";

/** Unit status milestone reached (all measured / all bracketed / all installed). */
export const NOTIF_UNIT_PROGRESS_UPDATE = "unit_progress_update";

/** Manufacturing risk flag set to yellow/red with ≤3 days until install. */
export const NOTIF_MFG_BEHIND_SCHEDULE = "mfg_behind_schedule";

/** Manufacturing work was pushed back between internal roles. */
export const NOTIF_MFG_PUSHBACK = "mfg_pushback";

/** Manufacturing pushback was resolved by rework. */
export const NOTIF_MFG_PUSHBACK_RESOLVED = "mfg_pushback_resolved";

/** Installer creates/updates a window with yellow or red risk flag. */
export const NOTIF_UNIT_ESCALATION = "unit_escalation";

// ─── Installer types ───────────────────────────────────────────────────────────

/** Scheduler/owner assigns unit(s) to this installer (grouped for bulk). */
export const NOTIF_UNIT_ASSIGNED_TO_INSTALLER = "unit_assigned_to_installer";

/** Installation date set on a unit that previously had none. */
export const NOTIF_INSTALLATION_DATE_SET = "installation_date_set";

/** Measurement, bracketing, or installation dates changed on installer's unit. */
export const NOTIF_DATES_CHANGED = "dates_changed";

/** A weekly schedule has been published (existing). */
export const NOTIF_SCHEDULE_PUBLISHED = "schedule_published";

// ─── Filter categories ────────────────────────────────────────────────────────

export type NotifCategory = {
  key: string;
  label: string;
  /** Notification types included in this category. */
  types: string[];
};

/** Filter categories shown in the Scheduler alerts page. */
export const SCHEDULER_NOTIF_CATEGORIES: NotifCategory[] = [
  {
    key: "escalations",
    label: "⚠️ Escalations",
    types: [NOTIF_UNIT_ESCALATION],
  },
  {
    key: "queue",
    label: "Queue Changes",
    types: [NOTIF_UNIT_ASSIGNED_TO_SCHEDULER],
  },
  {
    key: "dates",
    label: "Date Changes",
    types: [NOTIF_COMPLETE_BY_DATE_CHANGED],
  },
  {
    key: "progression",
    label: "Unit Progression",
    types: [NOTIF_UNIT_PROGRESS_UPDATE],
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    types: [NOTIF_MFG_BEHIND_SCHEDULE, NOTIF_MFG_PUSHBACK, NOTIF_MFG_PUSHBACK_RESOLVED],
  },
];

/** Filter categories shown in the Installer alerts page. */
export const INSTALLER_NOTIF_CATEGORIES: NotifCategory[] = [
  {
    key: "assignments",
    label: "Assignments",
    types: [NOTIF_UNIT_ASSIGNED_TO_INSTALLER],
  },
  {
    key: "dates",
    label: "Date Changes",
    types: [NOTIF_INSTALLATION_DATE_SET, NOTIF_DATES_CHANGED],
  },
  {
    key: "schedule",
    label: "Schedule",
    types: [NOTIF_SCHEDULE_PUBLISHED],
  },
  {
    key: "manufacturing",
    label: "Manufacturing",
    types: [NOTIF_MFG_PUSHBACK, NOTIF_MFG_PUSHBACK_RESOLVED],
  },
];

// ─── Icon + colour metadata (used by NotificationsList) ───────────────────────

export type NotifMeta = {
  /** Phosphor icon name to use. */
  icon: "Bell" | "CalendarBlank" | "Warning" | "CheckCircle" | "UserPlus" | "Package" | "Buildings";
  /** Tailwind accent class for icon + unread indicator. */
  accent: string;
};

export const NOTIF_META: Record<string, NotifMeta> = {
  [NOTIF_UNIT_ESCALATION]:             { icon: "Warning",       accent: "text-red-500" },
  [NOTIF_UNIT_ASSIGNED_TO_SCHEDULER]:  { icon: "Buildings",     accent: "text-accent" },
  [NOTIF_COMPLETE_BY_DATE_CHANGED]:    { icon: "CalendarBlank", accent: "text-amber-500" },
  [NOTIF_UNIT_PROGRESS_UPDATE]:        { icon: "CheckCircle",   accent: "text-emerald-500" },
  [NOTIF_MFG_BEHIND_SCHEDULE]:         { icon: "Package",       accent: "text-orange-500" },
  [NOTIF_MFG_PUSHBACK]:                { icon: "Warning",       accent: "text-orange-500" },
  [NOTIF_MFG_PUSHBACK_RESOLVED]:       { icon: "CheckCircle",   accent: "text-emerald-500" },
  [NOTIF_UNIT_ASSIGNED_TO_INSTALLER]:  { icon: "UserPlus",      accent: "text-accent" },
  [NOTIF_INSTALLATION_DATE_SET]:       { icon: "CalendarBlank", accent: "text-accent" },
  [NOTIF_DATES_CHANGED]:               { icon: "CalendarBlank", accent: "text-amber-500" },
  [NOTIF_SCHEDULE_PUBLISHED]:          { icon: "CalendarBlank", accent: "text-accent" },
};
