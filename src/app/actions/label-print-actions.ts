"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function markLabelsPrinted(input: {
  windows: Array<{ windowId: string; unitId: string }>;
  kind: "manufacturing" | "packaging";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (input.windows.length === 0) return { ok: true };

  const supabase = await createClient();
  const column =
    input.kind === "manufacturing"
      ? "manufacturing_label_printed_at"
      : "packaging_label_printed_at";
  const now = new Date().toISOString();

  const windowIds = input.windows.map((w) => w.windowId);

  const { data: existing, error: selErr } = await supabase
    .from("window_production_status")
    .select("window_id")
    .in("window_id", windowIds);

  if (selErr) return { ok: false, error: selErr.message };

  const existingIds = new Set((existing ?? []).map((r) => r.window_id as string));
  const toInsert = input.windows.filter((w) => !existingIds.has(w.windowId));
  const toUpdateIds = windowIds.filter((id) => existingIds.has(id));

  if (toUpdateIds.length > 0) {
    const { error } = await supabase
      .from("window_production_status")
      .update({ [column]: now })
      .in("window_id", toUpdateIds);
    if (error) return { ok: false, error: error.message };
  }

  if (toInsert.length > 0) {
    const rows = toInsert.map((w) => ({
      id: `wps-${crypto.randomUUID().slice(0, 8)}`,
      window_id: w.windowId,
      unit_id: w.unitId,
      status: "pending" as const,
      [column]: now,
    }));
    const { error } = await supabase.from("window_production_status").insert(rows);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath("/cutter/queue");
  return { ok: true };
}
