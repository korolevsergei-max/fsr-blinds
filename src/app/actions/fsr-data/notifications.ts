"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  getCurrentUser,
  getLinkedInstallerId,
  getLinkedSchedulerId,
} from "@/lib/auth";
import { type ActionResult } from "./_shared";

/**
 * Notification recipients are addressed by linked entity id (schedulers.id /
 * installers.id), not auth user id — resolve it from the session so a caller
 * can only ever mark their own notifications read.
 */
async function resolveNotificationRecipient(): Promise<
  { role: "scheduler" | "installer"; id: string } | null
> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (user.role === "scheduler") {
    const id = await getLinkedSchedulerId(user.id);
    return id ? { role: "scheduler", id } : null;
  }
  if (user.role === "installer") {
    const id = await getLinkedInstallerId(user.id);
    return id ? { role: "installer", id } : null;
  }
  return null;
}

export async function markNotificationRead(
  notificationId: string
): Promise<ActionResult> {
  try {
    const recipient = await resolveNotificationRecipient();
    if (!recipient) return { ok: false, error: "Unauthorized" };

    const supabase = await createClient();
    const { error } = await supabase.from("notification_reads").upsert(
      {
        notification_id: notificationId,
        user_role: recipient.role,
        user_id: recipient.id,
        read_at: new Date().toISOString(),
      },
      { onConflict: "notification_id,user_role,user_id" }
    );
    if (error) return { ok: false, error: error.message };
    revalidatePath("/installer/notifications");
    revalidatePath("/scheduler/notifications");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  try {
    const recipient = await resolveNotificationRecipient();
    if (!recipient) return { ok: false, error: "Unauthorized" };

    const supabase = await createClient();
    // Fetch all unread notification IDs for this recipient
    const { data: notifs } = await supabase
      .from("notifications")
      .select("id")
      .eq("recipient_role", recipient.role)
      .eq("recipient_id", recipient.id);
    if (!notifs || notifs.length === 0) return { ok: true };

    const rows = notifs.map((n: { id: string }) => ({
      notification_id: n.id,
      user_role: recipient.role,
      user_id: recipient.id,
      read_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("notification_reads")
      .upsert(rows, { onConflict: "notification_id,user_role,user_id" });
    if (error) return { ok: false, error: error.message };
    revalidatePath("/installer/notifications");
    revalidatePath("/scheduler/notifications");
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
