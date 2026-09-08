/**
 * Server-only helper to insert a notification row.
 * Uses the service-role admin client so it works reliably inside `after()` callbacks
 * where the SSR cookie-based client may no longer have a valid session.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface EmitNotificationPayload {
  recipientRole: string;
  recipientId: string;
  type: string;
  title: string;
  body?: string;
  relatedUnitId?: string | null;
}

/**
 * Insert a notification. Silently swallows errors — notifications are
 * best-effort and must never cause a primary action to fail.
 */
export async function emitNotification(
  payload: EmitNotificationPayload
): Promise<void> {
  try {
    const { recipientRole, recipientId, type, title, body = "", relatedUnitId } = payload;
    const supabase = createAdminClient();

    // A scheduler who also installs is addressed by callers as an installer (their alias
    // row is the assignee), but they read notifications as a scheduler: loadNotifications
    // filters on (recipient_role, recipient_id) and the scheduler portal queries
    // ("scheduler", schedulerId). Rewrite here — the one choke point every call site goes
    // through — so the notification actually reaches them.
    let role = recipientRole;
    let id = recipientId;
    if (role === "installer") {
      const { data: alias } = await supabase
        .from("installers")
        .select("scheduler_alias_id")
        .eq("id", recipientId)
        .maybeSingle();
      if (alias?.scheduler_alias_id) {
        role = "scheduler";
        id = alias.scheduler_alias_id;
      }
    }

    await supabase.from("notifications").insert({
      id: `notif-${crypto.randomUUID()}`,
      recipient_role: role,
      recipient_id: id,
      type,
      title,
      body,
      related_unit_id: relatedUnitId ?? null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Never propagate — a notification failure must not break the parent action.
  }
}
