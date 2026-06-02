"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { type ActionResult } from "./_shared";

export async function markNotificationRead(
  notificationId: string,
  userRole: string,
  userId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("notification_reads").upsert(
      {
        notification_id: notificationId,
        user_role: userRole,
        user_id: userId,
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

export async function markAllNotificationsRead(
  userRole: string,
  userId: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    // Fetch all unread notification IDs for this recipient
    const { data: notifs } = await supabase
      .from("notifications")
      .select("id")
      .eq("recipient_role", userRole)
      .eq("recipient_id", userId);
    if (!notifs || notifs.length === 0) return { ok: true };

    const rows = notifs.map((n: { id: string }) => ({
      notification_id: n.id,
      user_role: userRole,
      user_id: userId,
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
