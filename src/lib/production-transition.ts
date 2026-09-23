import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProductionStatus } from "./types.ts";

const STATUS_RANK: Record<ProductionStatus, number> = {
  pending: 0,
  cut: 1,
  assembled: 2,
  qc_approved: 3,
};

const STATUS_WORDING: Record<ProductionStatus, string> = {
  pending: "waiting to be cut",
  cut: "cut and waiting for assembly",
  assembled: "assembled and waiting for QC",
  qc_approved: "already QC-approved",
};

export type TransitionDirection = "forward" | "backward";

/**
 * What a compare-and-set that matched no row means. Forward marks are
 * idempotent: a blind already at or past the target was cleared by an earlier
 * tap (double-tap, second tablet), so the caller reports success without
 * repeating side effects. Anything else means the screen acted on a stale card
 * and must NOT be told it worked — that silent success is what made cleared
 * blinds reappear after a refresh.
 */
export function classifyUnappliedTransition(
  direction: TransitionDirection,
  target: ProductionStatus,
  current: ProductionStatus | null
): "already_done" | "stale" {
  if (current === null) return "stale";
  if (direction === "forward") {
    return STATUS_RANK[current] >= STATUS_RANK[target] ? "already_done" : "stale";
  }
  return current === target ? "already_done" : "stale";
}

export function describeStaleTransition(current: ProductionStatus | null): string {
  if (current === null) {
    return "This blind has no production record yet. Refresh the queue and try again.";
  }
  return `This blind is ${STATUS_WORDING[current]} — refresh to see the latest queue.`;
}

/** True when the stored status is `target` or further along the line. */
export function hasReached(current: ProductionStatus | null, target: ProductionStatus): boolean {
  return current !== null && STATUS_RANK[current] >= STATUS_RANK[target];
}

export type TransitionResult =
  | { ok: true; outcome: "applied" | "already_done" }
  | { ok: false; error: string; current: ProductionStatus | null; missingRow: boolean };

/**
 * Move one window's production status `from` → `to` atomically. The status
 * guard in the WHERE clause is the concurrency control: two taps, two tablets,
 * or an undo racing a mark can never both apply, and a stale card can never
 * regress a blind that has moved on.
 */
export async function transitionProductionStatus(
  supabase: SupabaseClient,
  args: {
    windowId: string;
    from: ProductionStatus;
    to: ProductionStatus;
    direction: TransitionDirection;
    patch: Record<string, unknown>;
  }
): Promise<TransitionResult> {
  const { error, count } = await supabase
    .from("window_production_status")
    .update({ ...args.patch, status: args.to }, { count: "exact" })
    .eq("window_id", args.windowId)
    .eq("status", args.from);

  if (error) {
    return { ok: false, error: error.message, current: null, missingRow: false };
  }
  // postgrest-js parseInt()s the Content-Range total, so an unexpected header
  // yields NaN rather than null. Only a real number is evidence of a write.
  const rowsAffected = typeof count === "number" && Number.isFinite(count) ? count : null;
  if (rowsAffected !== null && rowsAffected > 0) return { ok: true, outcome: "applied" };

  const { data, error: readError } = await supabase
    .from("window_production_status")
    .select("status")
    .eq("window_id", args.windowId)
    .maybeSingle();
  if (readError) {
    return { ok: false, error: readError.message, current: null, missingRow: false };
  }

  const current = (data?.status ?? null) as ProductionStatus | null;
  // No row count from PostgREST: the re-read is the only evidence, and running
  // the follow-up twice is harmless where skipping it is not.
  if (rowsAffected === null && current === args.to) return { ok: true, outcome: "applied" };

  if (classifyUnappliedTransition(args.direction, args.to, current) === "already_done") {
    return { ok: true, outcome: "already_done" };
  }
  return {
    ok: false,
    error: describeStaleTransition(current),
    current,
    missingRow: data === null,
  };
}
