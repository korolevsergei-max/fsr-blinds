// Supabase routes long URLs through edge proxies that reject requests above
// ~8KB. `.in("col", ids)` puts every id in the URL, so a single 600+ id query
// 400s and supabase-js silently returns { data: null }. Use selectInChunks
// whenever the id list is sized by dataset volume (windows, rooms, schedules)
// rather than a small bounded set.

const SUPABASE_IN_CHUNK = 100;

// Max chunk requests in flight per call. Chunks run concurrently (much faster
// than the old one-at-a-time loop) but capped so a large scope — or many users
// loading at once — can't open enough simultaneous connections to exhaust the
// Supabase pooler. An unbounded Promise.all here took prod down via
// MIDDLEWARE_INVOCATION_TIMEOUT when auth queries couldn't get a connection.
const SUPABASE_IN_CONCURRENCY = 4;

export async function selectInChunks<Row>(
  ids: readonly string[],
  fetchChunk: (chunk: string[]) => PromiseLike<{ data: Row[] | null; error: unknown }>
): Promise<Row[]> {
  if (ids.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += SUPABASE_IN_CHUNK) {
    chunks.push(ids.slice(i, i + SUPABASE_IN_CHUNK) as string[]);
  }

  // Bounded worker pool: SUPABASE_IN_CONCURRENCY workers pull from a shared
  // index, so at most that many requests are in flight at once. Results are
  // written back by index to preserve chunk order.
  const results: (Row[] | null)[] = new Array(chunks.length).fill(null);
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const i = next++;
      const { data } = await fetchChunk(chunks[i]);
      results[i] = data;
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(SUPABASE_IN_CONCURRENCY, chunks.length) }, worker)
  );

  const out: Row[] = [];
  for (const data of results) {
    if (data) out.push(...data);
  }
  return out;
}
