import { createClient } from "@/lib/supabase/server";
import { getUnitMilestoneCoverageWithClient } from "@/lib/unit-milestones";

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

  const coverage = await getUnitMilestoneCoverageWithClient(supabase, unitId);
  const newStatus = deriveStatusFromCoverage(coverage);

  if (newStatus !== current?.status) {
    await supabase.from("units").update({ status: newStatus }).eq("id", unitId);
    await logStatusChange(supabase, unitId, current?.status ?? "not_started", newStatus);
  }
}

function deriveStatusFromCoverage(
  coverage: Awaited<ReturnType<typeof getUnitMilestoneCoverageWithClient>>
): string {
  if (coverage.totalWindows === 0) return "not_started";
  if (!coverage.allMeasured) return "not_started";
  if (!coverage.allBracketed) return "measured";
  if (!coverage.allInstalled) return "bracketed";
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
