/**
 * Lightweight in-memory per-key token bucket for expensive server actions
 * (security plan Phase 7 / M4).
 *
 * Each serverless instance keeps its own buckets, so this caps per-user
 * hammering on a warm instance — cheap defense in depth for the full-dataset
 * aggregations, not a distributed limiter. Callers should degrade gracefully
 * (return `null` / keep stale data) rather than error, because legitimate
 * realtime-driven refreshes may occasionally race the window.
 */

export type RateLimitRule = {
  /** Max burst size (bucket capacity, in tokens). */
  capacity: number;
  /** Sustained allowance, tokens per second. */
  refillPerSecond: number;
};

type Bucket = { tokens: number; refilledAt: number };

const buckets = new Map<string, Bucket>();

/** Bound memory on long-lived instances; oldest entries are evicted past this. */
const MAX_BUCKETS = 10_000;

/**
 * Take one token from `key`'s bucket. Returns `true` when the call is allowed,
 * `false` when the caller should be throttled. `nowMs` is injectable for tests.
 */
export function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  nowMs: number = Date.now()
): boolean {
  let bucket = buckets.get(key);
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) {
      let evicted = 0;
      for (const staleKey of buckets.keys()) {
        buckets.delete(staleKey);
        if (++evicted >= MAX_BUCKETS / 10) break;
      }
    }
    bucket = { tokens: rule.capacity, refilledAt: nowMs };
    buckets.set(key, bucket);
  }

  const elapsedSeconds = Math.max(0, (nowMs - bucket.refilledAt) / 1000);
  bucket.tokens = Math.min(
    rule.capacity,
    bucket.tokens + elapsedSeconds * rule.refillPerSecond
  );
  bucket.refilledAt = nowMs;

  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
