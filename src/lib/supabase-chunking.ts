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
  const out: Row[] = [];
  for (let i = 0; i < ids.length; i += SUPABASE_IN_CHUNK) {
    const chunk = ids.slice(i, i + SUPABASE_IN_CHUNK) as string[];
    const { data } = await fetchChunk(chunk);
    if (data) out.push(...data);
  }
  return out;
}
