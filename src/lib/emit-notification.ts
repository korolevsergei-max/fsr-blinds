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
    await supabase.from("notifications").insert({
      id: `notif-${crypto.randomUUID()}`,
      recipient_role: recipientRole,
      recipient_id: recipientId,
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
