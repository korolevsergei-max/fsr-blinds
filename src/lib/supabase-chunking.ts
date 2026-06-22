// Supabase routes long URLs through edge proxies that reject requests above
// ~8KB. `.in("col", ids)` puts every id in the URL, so a single 600+ id query
// 400s and supabase-js silently returns { data: null }. Use selectInChunks
// whenever the id list is sized by dataset volume (windows, rooms, schedules)
// rather than a small bounded set.

const SUPABASE_IN_CHUNK = 100;

export async function selectInChunks<Row>(
  ids: readonly string[],
  fetchChunk: (chunk: string[]) => PromiseLike<{ data: Row[] | null; error: unknown }>
): Promise<Row[]> {
  if (ids.length === 0) return [];

  // Fire every chunk in parallel rather than awaiting them one at a time: the
  // chunks are independent reads, so total latency is one round-trip instead of
  // N. This matters most for scope-sized lists (windows by room, rooms by unit)
  // where a busy scheduler/installer can span many chunks. Chunk order is
  // preserved so callers see the same ordering as the old serial loop.
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += SUPABASE_IN_CHUNK) {
    chunks.push(ids.slice(i, i + SUPABASE_IN_CHUNK) as string[]);
  }
  const results = await Promise.all(chunks.map((chunk) => fetchChunk(chunk)));
  const out: Row[] = [];
  for (const { data } of results) {
    if (data) out.push(...data);
  }
  return out;
}
