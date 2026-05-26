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

  // Batch all reads across all unitIds in three parallel-friendly round-trips.
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id, unit_id")
    .in("unit_id", unitIds);
  if (!rooms || rooms.length === 0) return;

  const allRoomIds = rooms.map((r) => r.id as string);

  const [{ data: windows }, { data: units }] = await Promise.all([
    supabase.from("windows").select("id, room_id").in("room_id", allRoomIds),
    supabase
      .from("units")
      .select("id, production_entered_at")
      .in("id", unitIds),
  ]);

  if (!windows || windows.length === 0) return;

  const allWindowIds = windows.map((w) => w.id as string);
  const { data: statuses } = await supabase
    .from("window_production_status")
    .select("window_id, manufacturing_label_printed_at, packaging_label_printed_at, cut_list_printed_at")
    .in("window_id", allWindowIds);

  const statusMap = new Map(
    (statuses ?? []).map((s) => [s.window_id as string, s])
  );

  // Group rooms and windows by unit
  const roomsByUnit = new Map<string, string[]>();
  for (const r of rooms) {
    const list = roomsByUnit.get(r.unit_id as string) ?? [];
    list.push(r.id as string);
    roomsByUnit.set(r.unit_id as string, list);
  }

  const windowsByRoom = new Map<string, string[]>();
  for (const w of windows) {
    const list = windowsByRoom.get(w.room_id as string) ?? [];
    list.push(w.id as string);
    windowsByRoom.set(w.room_id as string, list);
  }

  const unitsWithNoProductionEntry = new Set(
    (units ?? [])
      .filter((u) => !u.production_entered_at)
      .map((u) => u.id as string)
  );

  const readyUnitIds: string[] = [];
  for (const unitId of unitIds) {
    if (!unitsWithNoProductionEntry.has(unitId)) continue;

    const unitRoomIds = roomsByUnit.get(unitId) ?? [];
    const unitWindowIds = unitRoomIds.flatMap(
      (rid) => windowsByRoom.get(rid) ?? []
    );
    if (unitWindowIds.length === 0) continue;

    const allComplete = unitWindowIds.every((id) => {
      const s = statusMap.get(id);
      return (
        s &&
        s.manufacturing_label_printed_at &&
        s.packaging_label_printed_at &&
        s.cut_list_printed_at
      );
    });

    if (allComplete) readyUnitIds.push(unitId);
  }

  if (readyUnitIds.length === 0) return;

  await supabase
    .from("units")
    .update({ production_entered_at: new Date().toISOString() })
    .in("id", readyUnitIds);
}
