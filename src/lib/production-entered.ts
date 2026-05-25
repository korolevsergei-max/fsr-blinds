import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * After any label-print timestamp is written, checks each affected unit to see
 * if every window now has manufacturing_label_printed_at, packaging_label_printed_at,
 * and cut_list_printed_at set. If so and production_entered_at is still null,
 * stamps it to NOW().
 */
export async function maybeSetProductionEnteredAt(
  supabase: SupabaseClient,
  unitIds: string[]
): Promise<void> {
  if (unitIds.length === 0) return;

  for (const unitId of unitIds) {
    const { data: rooms } = await supabase
      .from("rooms")
      .select("id")
      .eq("unit_id", unitId);
    if (!rooms || rooms.length === 0) continue;

    const roomIds = rooms.map((r) => r.id as string);
    const { data: windows } = await supabase
      .from("windows")
      .select("id")
      .in("room_id", roomIds);
    if (!windows || windows.length === 0) continue;

    const windowIds = windows.map((w) => w.id as string);
    const { data: statuses } = await supabase
      .from("window_production_status")
      .select("window_id, manufacturing_label_printed_at, packaging_label_printed_at, cut_list_printed_at")
      .in("window_id", windowIds);

    const statusMap = new Map(
      (statuses ?? []).map((s) => [s.window_id as string, s])
    );
    const allComplete = windowIds.every((id) => {
      const s = statusMap.get(id);
      return (
        s &&
        s.manufacturing_label_printed_at &&
        s.packaging_label_printed_at &&
        s.cut_list_printed_at
      );
    });

    if (!allComplete) continue;

    const { data: unit } = await supabase
      .from("units")
      .select("production_entered_at")
      .eq("id", unitId)
      .single();
    if (unit && !unit.production_entered_at) {
      await supabase
        .from("units")
        .update({ production_entered_at: new Date().toISOString() })
        .eq("id", unitId);
    }
  }
}
