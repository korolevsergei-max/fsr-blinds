import { createClient } from "@/lib/supabase/server";
import type { Notification, UnitActivityLog } from "@/lib/types";
import { mapActivityLog, type UnitActivityLogRow } from "@/lib/dataset-mappers";

export async function loadNotifications(
  recipientRole: string,
  recipientId: string
): Promise<Notification[]> {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_role", recipientRole)
    .eq("recipient_id", recipientId)
    .order("created_at", { ascending: false });
  if (error) return [];

  const ids = (rows ?? []).map((r) => r.id);
  let readSet = new Set<string>();
  if (ids.length > 0) {
    const { data: reads } = await supabase
      .from("notification_reads")
      .select("notification_id")
      .eq("user_role", recipientRole)
      .eq("user_id", recipientId)
      .in("notification_id", ids);
    readSet = new Set((reads ?? []).map((r) => r.notification_id));
  }

  return (rows ?? []).map((r) => ({
    id: r.id,
    recipientRole: r.recipient_role,
    recipientId: r.recipient_id,
    type: r.type,
    title: r.title,
    body: r.body,
    relatedWeekStart: r.related_week_start,
    relatedUnitId: r.related_unit_id ?? null,
    createdAt: r.created_at,
    read: readSet.has(r.id),
  }));
}

export async function loadUnitActivityLog(
  unitId: string
): Promise<UnitActivityLog[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unit_activity_log")
    .select("*")
    .eq("unit_id", unitId)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data as UnitActivityLogRow[]).map(mapActivityLog);
}

export async function getUnreadNotificationCount(
  recipientRole: string,
  recipientId: string
): Promise<number> {
  const supabase = await createClient();
  const { count: total } = await supabase
    .from("notifications")
    .select("*", { count: "exact", head: true })
    .eq("recipient_role", recipientRole)
    .eq("recipient_id", recipientId);
  const { count: readCount } = await supabase
    .from("notification_reads")
    .select("*", { count: "exact", head: true })
    .eq("user_role", recipientRole)
    .eq("user_id", recipientId);
  return Math.max(0, (total ?? 0) - (readCount ?? 0));
}
