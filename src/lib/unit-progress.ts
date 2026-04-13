import { createClient } from "@/lib/supabase/server";
import { getUnitMilestoneCoverageWithClient } from "@/lib/unit-milestones";
import type { UnitStatus } from "@/lib/types";
import { deriveUnitStatusFromCounts } from "@/lib/unit-status-helpers";

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

  await supabase.from("schedule_entries").update({ status: newStatus }).eq("unit_id", unitId);
}

export function deriveStatusFromCoverage(
  coverage: Awaited<ReturnType<typeof getUnitMilestoneCoverageWithClient>>
): UnitStatus {
  return deriveUnitStatusFromCounts({
    totalWindows: coverage.totalWindows,
    measuredCount: coverage.measuredCount,
    bracketedCount: coverage.bracketedCount,
    manufacturedCount: coverage.manufacturedCount,
    installedCount: coverage.installedCount,
  });
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
