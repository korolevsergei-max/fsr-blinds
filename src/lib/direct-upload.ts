"use client";

import { createClient } from "@/lib/supabase/client";

export type SignedUploadTarget = { path: string; token: string };

/** Cap on simultaneous signed-URL uploads so a slow uplink isn't saturated. */
export const UPLOAD_CONCURRENCY = 3;

/**
 * Runs `fn` over `items` with at most `limit` in flight at once, preserving
 * result order. Use for parallel uploads/compression where unbounded
 * Promise.all could overwhelm the connection.
 */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/**
 * Uploads a file straight to Supabase Storage using a signed upload URL minted by the server.
 * Bytes go client → Supabase directly (no Vercel double-hop). The `token` authorizes the write,
 * so no storage RLS upload grant is required on the client.
 *
 * Returns a structured result so callers can fall back to the legacy server-action upload path
 * if a direct upload fails (e.g. transient storage error on a flaky connection).
 */
export async function uploadViaSignedUrl(
  bucket: string,
  target: SignedUploadTarget,
  file: File
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const supabase = createClient();
    const { error } = await supabase.storage
      .from(bucket)
      .uploadToSignedUrl(target.path, target.token, file, {
        contentType: file.type || "image/jpeg",
      });
    if (error) {
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Upload failed." };
  }
}
