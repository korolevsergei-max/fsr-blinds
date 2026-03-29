import { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export type UnitMilestoneCoverage = {
  totalWindows: number;
  measuredCount: number;
  bracketedCount: number;
  installedCount: number;
  allMeasured: boolean;
  allBracketed: boolean;
  allInstalled: boolean;
  /** ISO timestamp of when the last required window was measured (or null). */
  measuredCompletedAt: string | null;
  /** ISO timestamp of when the last qualifying bracketed photo was uploaded (or null). */
  bracketedCompletedAt: string | null;
  /** ISO timestamp of when the last qualifying installed photo was uploaded (or null). */
  installedCompletedAt: string | null;
};

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
    .select("id, measured")
    .in("room_id", roomIds);
  const windowRows = windows ?? [];
  const windowIds = windowRows.map((w: { id: string; measured: boolean }) => w.id);
  if (windowIds.length === 0) return empty;

  const totalWindows = windowIds.length;

  // Measurement coverage: windows.measured = true
  const measuredWindows = windowRows.filter(
    (w: { id: string; measured: boolean }) => w.measured
  );
  const measuredCount = measuredWindows.length;
  const allMeasured = measuredCount >= totalWindows;

  // Use updated_at on the windows table as the measurement timestamp proxy.
  // If the column isn't present yet, fall back to null.
  let measuredCompletedAt: string | null = null;
  if (allMeasured) {
    const { data: measuredWithTs } = await supabase
      .from("windows")
      .select("updated_at")
      .in("id", windowIds)
      .eq("measured", true)
      .order("updated_at", { ascending: false })
      .limit(1);
    measuredCompletedAt = (measuredWithTs ?? [])[0]?.updated_at ?? null;
  }

  // Bracketed coverage: every window has a qualifying bracketed media row.
  const { data: bracketedMedia } = await supabase
    .from("media_uploads")
    .select("window_id, created_at")
    .eq("unit_id", unitId)
    .eq("stage", "bracketed_measured")
    .eq("upload_kind", "window_measure")
    .not("window_id", "is", null);

  const bracketedByWindow = new Map<string, string>(); // window_id → latest created_at
  for (const row of bracketedMedia ?? []) {
    const existing = bracketedByWindow.get(row.window_id);
    if (!existing || row.created_at > existing) {
      bracketedByWindow.set(row.window_id, row.created_at);
    }
  }

  const bracketedWindowIds = [...bracketedByWindow.keys()].filter((wid) =>
    windowIds.includes(wid)
  );
  const bracketedCount = bracketedWindowIds.length;
  const allBracketed = windowIds.every((id) => bracketedByWindow.has(id));

  let bracketedCompletedAt: string | null = null;
  if (allBracketed) {
    // Latest timestamp across all windows' bracketing photos
    const timestamps = windowIds.map((id) => bracketedByWindow.get(id) ?? "");
    bracketedCompletedAt = timestamps.sort().reverse()[0] ?? null;
  }

  // Installed coverage: every window has a qualifying installed media row.
  const { data: installedMedia } = await supabase
    .from("media_uploads")
    .select("window_id, created_at")
    .eq("unit_id", unitId)
    .eq("stage", "installed_pending_approval")
    .eq("upload_kind", "window_measure")
    .not("window_id", "is", null);

  const installedByWindow = new Map<string, string>(); // window_id → latest created_at
  for (const row of installedMedia ?? []) {
    const existing = installedByWindow.get(row.window_id);
    if (!existing || row.created_at > existing) {
      installedByWindow.set(row.window_id, row.created_at);
    }
  }

  const installedWindowIds = [...installedByWindow.keys()].filter((wid) =>
    windowIds.includes(wid)
  );
  const installedCount = installedWindowIds.length;
  const allInstalled = windowIds.every((id) => installedByWindow.has(id));

  let installedCompletedAt: string | null = null;
  if (allInstalled) {
    const timestamps = windowIds.map((id) => installedByWindow.get(id) ?? "");
    installedCompletedAt = timestamps.sort().reverse()[0] ?? null;
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
