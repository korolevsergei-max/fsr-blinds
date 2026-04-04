import { createClient } from "@/lib/supabase/server";
import { getUnitMilestoneCoverageWithClient } from "@/lib/unit-milestones";
import type { UnitStatus } from "@/lib/types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Derives and persists unit `status` from window measurements and stage photos.
 *
 * Measured and bracketed can complete in any order. Both must be satisfied before
 * the unit can become `installed` (all installation photos).
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

  const coverage = await getUnitMilestoneCoverageWithClient(supabase, unitId);
  const newStatus = deriveStatusFromCoverage(coverage);

  if (newStatus !== current?.status) {
    await supabase.from("units").update({ status: newStatus }).eq("id", unitId);
    await logStatusChange(
      supabase,
      unitId,
      (current?.status as string) ?? "not_started",
      newStatus
    );
  }
}

export function deriveStatusFromCoverage(
  coverage: Awaited<ReturnType<typeof getUnitMilestoneCoverageWithClient>>
): UnitStatus {
  if (coverage.totalWindows === 0) return "not_started";
  if (coverage.allInstalled) return "installed";
  if (coverage.allMeasured && coverage.allBracketed) return "measured_and_bracketed";
  if (coverage.allMeasured) return "measured";
  if (coverage.allBracketed) return "bracketed";
  return "not_started";
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
