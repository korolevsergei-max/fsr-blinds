import assert from "node:assert/strict";
import test from "node:test";
import { selectInChunks } from "./supabase-chunking.ts";

test("selectInChunks splits a 600-id query into chunks of 100 and merges", async () => {
  const ids = Array.from({ length: 600 }, (_, i) => `id-${i}`);
  const seenChunks: string[][] = [];

  const result = await selectInChunks<{ id: string }>(ids, async (chunk) => {
    seenChunks.push(chunk);
    return { data: chunk.map((id) => ({ id })), error: null };
  });

  assert.equal(seenChunks.length, 6, "should issue six requests for 600 ids");
  for (const chunk of seenChunks) {
    assert.ok(chunk.length <= 100, `chunk size ${chunk.length} exceeded 100`);
  }
  assert.equal(result.length, 600);
  assert.equal(result[0]!.id, "id-0");
  assert.equal(result[599]!.id, "id-599");
});

test("selectInChunks short-circuits empty input without issuing a request", async () => {
  let calls = 0;
  const result = await selectInChunks<{ id: string }>([], async () => {
    calls += 1;
    return { data: [], error: null };
  });

  assert.equal(calls, 0);
  assert.deepEqual(result, []);
});

test("selectInChunks tolerates a single failed chunk and still returns the rest", async () => {
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  let call = 0;

  const result = await selectInChunks<{ id: string }>(ids, async (chunk) => {
    call += 1;
    if (call === 2) return { data: null, error: new Error("boom") };
    return { data: chunk.map((id) => ({ id })), error: null };
  });

  // chunks 1 and 3 succeed (100 + 50 ids), chunk 2 yields no rows
  assert.equal(result.length, 150);
});
