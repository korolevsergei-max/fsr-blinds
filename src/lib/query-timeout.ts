/**
 * Tail-latency guard for Supabase calls (quality floor, D2).
 *
 * No Supabase call in the app was time-bounded: a hung connection (a dropped
 * socket mid-query, a stuck pooler) would stall an RSC render on its skeleton
 * forever, or hold a Server Action open indefinitely. AbortSignal.timeout bounds
 * that — the query rejects after the deadline, so the caller's existing error
 * path runs (the dataset/queue RPCs fall back to their chunked path; an action
 * returns its error result) instead of hanging.
 *
 * The deadline is deliberately generous. The queue-read RPC is < 500 ms and the
 * owner dataset ~500 ms in prod, so 15 s is ~30x headroom: it never fires on a
 * slow-but-progressing query, only on a genuinely stuck one. Apply it via the
 * PostgREST builder's .abortSignal():
 *
 *   supabase.rpc("get_role_schedule", args).abortSignal(queryTimeoutSignal())
 */
export const SUPABASE_QUERY_TIMEOUT_MS = 15_000;

export function queryTimeoutSignal(ms: number = SUPABASE_QUERY_TIMEOUT_MS): AbortSignal {
  return AbortSignal.timeout(ms);
}
