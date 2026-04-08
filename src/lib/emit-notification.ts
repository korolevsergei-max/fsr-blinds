/**
 * Server-only helper to insert a notification row.
 * Import only from server actions / server components.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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
  // Accept supabase client typed as any SupabaseClient to avoid importing
  // the server-specific createClient at this call-site.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  payload: EmitNotificationPayload
): Promise<void> {
  try {
    const { recipientRole, recipientId, type, title, body = "", relatedUnitId } = payload;
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
