import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Derives and persists the progress status of a unit from underlying window/media data.
 *
 * Derivation ladder:
 *  not_started  → measured     (every window is measured)
 *  measured     → bracketed    (every window has a post-bracketing photo)
 *  bracketed    → installed    (every window has an installed photo)
 *  installed    → client_approved  (owner-only — never auto-derived here)
 *
 * A unit that is already "client_approved" is never touched by this function.
 */
export async function recomputeUnitStatus(
  supabase: SupabaseClient,
  unitId: string
): Promise<void> {
  const { data: current } = await supabase
    .from("units")
    .select("status")
    .eq("id", unitId)
    .single();

  if (current?.status === "client_approved") return;

  const newStatus = await deriveUnitStatus(supabase, unitId);
  if (newStatus !== current?.status) {
    await supabase.from("units").update({ status: newStatus }).eq("id", unitId);
    await logStatusChange(supabase, unitId, current?.status ?? "not_started", newStatus);
  }
}

async function deriveUnitStatus(
  supabase: SupabaseClient,
  unitId: string
): Promise<string> {
  const { data: rooms } = await supabase
    .from("rooms")
    .select("id")
    .eq("unit_id", unitId);
  const roomIds = (rooms ?? []).map((r) => r.id);

  if (roomIds.length === 0) return "not_started";

  const { data: windows } = await supabase
    .from("windows")
    .select("id")
    .in("room_id", roomIds);
  const windowIds = (windows ?? []).map((w) => w.id);

  if (windowIds.length === 0) return "not_started";

  // Gate 1: all windows measured?
  const { count: measuredCount } = await supabase
    .from("windows")
    .select("*", { count: "exact", head: true })
    .in("id", windowIds)
    .eq("measured", true);

  if ((measuredCount ?? 0) < windowIds.length) return "not_started";

  // Gate 2: all windows have a post-bracketing photo?
  const { data: bracketedMedia } = await supabase
    .from("media_uploads")
    .select("window_id")
    .eq("unit_id", unitId)
    .eq("stage", "bracketed_measured")
    .eq("upload_kind", "window_measure")
    .not("window_id", "is", null);

  const bracketedWindowIds = new Set(
    (bracketedMedia ?? []).map((m: { window_id: string }) => m.window_id)
  );
  const allBracketed = windowIds.every((id) => bracketedWindowIds.has(id));
  if (!allBracketed) return "measured";

  // Gate 3: all windows have an installed photo?
  const { data: installedMedia } = await supabase
    .from("media_uploads")
    .select("window_id")
    .eq("unit_id", unitId)
    .eq("stage", "installed_pending_approval")
    .eq("upload_kind", "window_measure")
    .not("window_id", "is", null);

  const installedWindowIds = new Set(
    (installedMedia ?? []).map((m: { window_id: string }) => m.window_id)
  );
  const allInstalled = windowIds.every((id) => installedWindowIds.has(id));
  if (!allInstalled) return "bracketed";

  return "installed";
}

async function logStatusChange(
  supabase: SupabaseClient,
  unitId: string,
  from: string,
  to: string
) {
  await supabase.from("unit_activity_log").insert({
    id: `log-${crypto.randomUUID()}`,
    unit_id: unitId,
    actor_role: "system",
    actor_name: "System",
    action: "status_changed",
    details: { from, to },
    created_at: new Date().toISOString(),
  });
}
