import type { createClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Unit IDs a scheduler may see and act on:
 * - rows in `scheduler_unit_assignments`, and
 * - units whose `assigned_installer_id` is an installer with `scheduler_id` = this scheduler.
 *
 * Assigning a unit to a team installer upserts the coordinator's assignment row (from the
 * installer's `scheduler_id`) so the lead keeps explicit scope; team-linked units also match
 * via `assigned_installer_id` when the installer row is wired correctly.
 */
export async function getSchedulerScopedUnitIds(
  supabase: SupabaseServerClient,
  schedulerId: string
): Promise<string[]> {
  // Both queries run fully in parallel: the installer query embeds units via the
  // assigned_installer_id FK so we avoid a sequential 3rd round-trip.
  const [{ data: assignmentRows }, { data: installerRows }] = await Promise.all([
    supabase
      .from("scheduler_unit_assignments")
      .select("unit_id")
      .eq("scheduler_id", schedulerId),
    supabase
      .from("installers")
      .select("id, units:units!assigned_installer_id(id)")
      .eq("scheduler_id", schedulerId),
  ]);

  const fromAssignments = (assignmentRows ?? []).map((r: { unit_id: string }) => r.unit_id);
  const fromTeam = (installerRows ?? []).flatMap(
    (r) => ((r as { id: string; units: { id: string }[] }).units ?? []).map((u) => u.id)
  );

  return [...new Set([...fromAssignments, ...fromTeam])];
}

/** True if the unit is in this scheduler's portal scope (assignments or team installer). */
export async function isSchedulerScopedUnit(
  supabase: SupabaseServerClient,
  schedulerId: string,
  unitId: string
): Promise<boolean> {
  const { count: assignmentCount } = await supabase
    .from("scheduler_unit_assignments")
    .select("*", { count: "exact", head: true })
    .eq("scheduler_id", schedulerId)
    .eq("unit_id", unitId);

  if ((assignmentCount ?? 0) > 0) return true;

  const { data: unit } = await supabase
    .from("units")
    .select("assigned_installer_id")
    .eq("id", unitId)
    .maybeSingle();

  if (!unit?.assigned_installer_id) return false;

  const { count: teamMatch } = await supabase
    .from("installers")
    .select("*", { count: "exact", head: true })
    .eq("id", unit.assigned_installer_id)
    .eq("scheduler_id", schedulerId);

  return (teamMatch ?? 0) > 0;
}
