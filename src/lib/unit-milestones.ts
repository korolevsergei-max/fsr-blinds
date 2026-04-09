import { createClient } from "@/lib/supabase/server";
import type { UnitMilestoneCoverage } from "@/lib/unit-milestone-types";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** When `windows.updated_at` is missing, infer measurement completion time. */
async function resolveMeasuredCompletedAt(
  supabase: SupabaseClient,
  unitId: string,
  windowIds: string[]
): Promise<string | null> {
  const { data: measuredWithTs, error } = await supabase
    .from("windows")
    .select("updated_at")
    .in("id", windowIds)
    .eq("measured", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  const row = measuredWithTs?.[0] as { updated_at?: string } | undefined;
  const fromColumn = !error && row?.updated_at ? row.updated_at : null;
  if (fromColumn) return fromColumn;

  const { data: logs } = await supabase
    .from("unit_activity_log")
    .select("created_at, details")
    .eq("unit_id", unitId)
    .eq("action", "status_changed")
    .order("created_at", { ascending: false })
    .limit(80);
  const toMeasured = logs?.find(
    (row) => (row.details as { to?: string } | null)?.to === "measured"
  );
  if (toMeasured?.created_at) return toMeasured.created_at;

  const { data: preBracket } = await supabase
    .from("media_uploads")
    .select("created_at")
    .eq("unit_id", unitId)
    .eq("stage", "scheduled_bracketing")
    .order("created_at", { ascending: false })
    .limit(1);
  if (preBracket?.[0]?.created_at) return preBracket[0].created_at;

  return null;
}

/** If media timestamps are empty but status is installed, use activity log. */
async function resolveInstalledCompletedAtFallback(
  supabase: SupabaseClient,
  unitId: string,
  fromMedia: string | null
): Promise<string | null> {
  if (fromMedia) return fromMedia;

  const { data: logs } = await supabase
    .from("unit_activity_log")
    .select("created_at, details")
    .eq("unit_id", unitId)
    .eq("action", "status_changed")
    .order("created_at", { ascending: false })
    .limit(80);
  const toInstalled = logs?.find(
    (row) => (row.details as { to?: string } | null)?.to === "installed"
  );
  return toInstalled?.created_at ?? null;
}

export type { UnitMilestoneCoverage } from "@/lib/unit-milestone-types";

/**
 * Fetches window-level coverage and evidence-based completion timestamps for a unit.
 *
 * This is the single source of truth consumed by:
 *  - recomputeUnitStatus (unit-progress.ts) for status derivation
 *  - unit detail views for Scheduled/Completed milestone display
 */
export async function getUnitMilestoneCoverage(
  unitId: string
): Promise<UnitMilestoneCoverage> {
  const supabase = await createClient();
  return getUnitMilestoneCoverageWithClient(supabase, unitId);
}

export async function getUnitMilestoneCoverageWithClient(
  supabase: SupabaseClient,
  unitId: string
): Promise<UnitMilestoneCoverage> {
  const empty: UnitMilestoneCoverage = {
    totalWindows: 0,
    measuredCount: 0,
    bracketedCount: 0,
    installedCount: 0,
    allMeasured: false,
    allBracketed: false,
    allInstalled: false,
    measuredCompletedAt: null,
    bracketedCompletedAt: null,
    installedCompletedAt: null,
  };

  const { data: rooms } = await supabase
    .from("rooms")
    .select("id")
    .eq("unit_id", unitId);
  const roomIds = (rooms ?? []).map((r: { id: string }) => r.id);
  if (roomIds.length === 0) return empty;

  const { data: windows } = await supabase
    .from("windows")
    .select("id, measured, bracketed, installed, updated_at")
    .in("room_id", roomIds);
  const windowRows = windows ?? [];
  const windowIds = windowRows.map((w) => w.id);
  if (windowIds.length === 0) return empty;

  const totalWindows = windowIds.length;

  // Measurement coverage: windows.measured = true
  const measuredWindows = windowRows.filter((w) => w.measured);
  const measuredCount = measuredWindows.length;
  const allMeasured = measuredCount >= totalWindows;

  let measuredCompletedAt: string | null = null;
  if (allMeasured) {
    measuredCompletedAt = await resolveMeasuredCompletedAt(supabase, unitId, windowIds);
  }

  // Bracketed coverage
  const bracketedWindows = windowRows.filter((w) => w.bracketed);
  const bracketedCount = bracketedWindows.length;
  const allBracketed = bracketedCount >= totalWindows;

  let bracketedCompletedAt: string | null = null;
  if (allBracketed) {
    // Try to get latest media timestamp first
    const { data: latestMedia } = await supabase
      .from("media_uploads")
      .select("created_at")
      .eq("unit_id", unitId)
      .eq("stage", "bracketed_measured")
      .order("created_at", { ascending: false })
      .limit(1);
    
    if (latestMedia?.[0]?.created_at) {
      bracketedCompletedAt = latestMedia[0].created_at;
    } else {
      // Fallback to latest window update
      const latestUpdate = [...windowRows].sort((a, b) => 
        (b.updated_at || "").localeCompare(a.updated_at || "")
      )[0]?.updated_at;
      bracketedCompletedAt = latestUpdate || null;
    }
  }

  // Installed coverage
  const installedWindows = windowRows.filter((w) => w.installed);
  const installedCount = installedWindows.length;
  const allInstalled = installedCount >= totalWindows;

  let installedCompletedAt: string | null = null;
  if (allInstalled) {
    // Try to get latest media timestamp first
    const { data: latestMedia } = await supabase
      .from("media_uploads")
      .select("created_at")
      .eq("unit_id", unitId)
      .eq("stage", "installed_pending_approval")
      .order("created_at", { ascending: false })
      .limit(1);

    const fromMedia = latestMedia?.[0]?.created_at || null;
    if (fromMedia) {
      installedCompletedAt = await resolveInstalledCompletedAtFallback(supabase, unitId, fromMedia);
    } else {
      // Fallback to latest window update
      const latestUpdate = [...windowRows].sort((a, b) => 
        (b.updated_at || "").localeCompare(a.updated_at || "")
      )[0]?.updated_at;
      installedCompletedAt = await resolveInstalledCompletedAtFallback(supabase, unitId, latestUpdate || null);
    }
  }

  return {
    totalWindows,
    measuredCount,
    bracketedCount,
    installedCount,
    allMeasured,
    allBracketed,
    allInstalled,
    measuredCompletedAt,
    bracketedCompletedAt,
    installedCompletedAt,
  };
}
