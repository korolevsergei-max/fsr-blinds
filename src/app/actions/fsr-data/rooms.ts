"use server";
import { createClient } from "@/lib/supabase/server";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import { type ActionResult, revalidateUnit, refreshUnitAggregates } from "./_shared";

type CreatedRoom = { id: string; unitId: string; name: string; windowCount: number; completedWindows: number };

export async function createRoomsForUnit(
  unitId: string,
  names: string[]
): Promise<ActionResult & { rooms?: CreatedRoom[] }> {
  try {
    if (names.length === 0) {
      return { ok: true, rooms: [] };
    }
    const supabase = await createClient();
    const rows = names.map((name) => ({
      id: `room-${crypto.randomUUID()}`,
      unit_id: unitId,
      name: name.trim(),
      window_count: 0,
      completed_windows: 0,
    }));
    const { data: inserted, error } = await supabase.from("rooms").insert(rows).select();
    if (error) {
      return { ok: false, error: error.message };
    }
    await refreshUnitAggregates(supabase, unitId);
    revalidateUnit(unitId);
    const rooms: CreatedRoom[] = (inserted ?? []).map((r: { id: string; unit_id: string; name: string; window_count: number; completed_windows: number }) => ({
      id: r.id,
      unitId: r.unit_id,
      name: r.name,
      windowCount: r.window_count,
      completedWindows: r.completed_windows,
    }));
    return { ok: true, rooms };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function updateRoomName(
  roomId: string,
  unitId: string,
  name: string
): Promise<ActionResult> {
  try {
    const nextName = name.trim();
    if (!roomId || !unitId) {
      return { ok: false, error: "Missing room or unit." };
    }
    if (!nextName) {
      return { ok: false, error: "Room name is required." };
    }

    const supabase = await createClient();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, unit_id")
      .eq("id", roomId)
      .single();
    if (roomError || !room || room.unit_id !== unitId) {
      return { ok: false, error: "Room not found for this unit." };
    }

    const { data: duplicate } = await supabase
      .from("rooms")
      .select("id")
      .eq("unit_id", unitId)
      .ilike("name", nextName)
      .neq("id", roomId)
      .limit(1);
    if ((duplicate ?? []).length > 0) {
      return { ok: false, error: "A room with this name already exists." };
    }

    const { error } = await supabase.from("rooms").update({ name: nextName }).eq("id", roomId);
    if (error) {
      return { ok: false, error: error.message };
    }

    revalidateUnit(unitId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}

export async function deleteRoom(
  roomId: string,
  unitId: string
): Promise<ActionResult> {
  try {
    if (!roomId || !unitId) {
      return { ok: false, error: "Missing room or unit." };
    }

    const supabase = await createClient();
    const { data: room, error: roomError } = await supabase
      .from("rooms")
      .select("id, unit_id")
      .eq("id", roomId)
      .single();
    if (roomError || !room || room.unit_id !== unitId) {
      return { ok: false, error: "Room not found for this unit." };
    }

    const { count: windowCount } = await supabase
      .from("windows")
      .select("*", { count: "exact", head: true })
      .eq("room_id", roomId);
    if ((windowCount ?? 0) > 0) {
      return {
        ok: false,
        error:
          "This room already has windows. Remove or reassign its windows before deleting the room.",
      };
    }

    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) {
      return { ok: false, error: error.message };
    }

    await refreshUnitAggregates(supabase, unitId);
    await recomputeUnitStatus(supabase, unitId);
    revalidateUnit(unitId);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return { ok: false, error: msg };
  }
}
