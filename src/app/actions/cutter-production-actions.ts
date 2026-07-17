"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireCutterOrOwner } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * Move a unit forward from the queue into production by setting
 * production_entered_at = NOW(). No-op if already in production.
 */
export async function moveUnitToProduction(unitId: string): Promise<ActionResult> {
  try {
    await requireCutterOrOwner();
    const supabase = await createClient();

    const { error } = await supabase
      .from("units")
      .update({ production_entered_at: new Date().toISOString() })
      .eq("id", unitId)
      .is("production_entered_at", null);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/cutter/queue", "layout");
    revalidatePath("/cutter/production", "layout");

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to move unit to production.",
    };
  }
}

/**
 * Move a unit back to the cutter queue by clearing production_entered_at.
 * Blocked if any window in the unit has already been cut (status != 'pending').
 */
export async function moveUnitBackToQueue(unitId: string): Promise<ActionResult> {
  try {
    await requireCutterOrOwner();
    const supabase = await createClient();

    // Block if any window is already cut or further along.
    const { data: cutWindows, error: checkErr } = await supabase
      .from("window_production_status")
      .select("id")
      .eq("unit_id", unitId)
      .neq("status", "pending")
      .limit(1);

    if (checkErr) return { ok: false, error: checkErr.message };

    if (cutWindows && cutWindows.length > 0) {
      return {
        ok: false,
        error: "Cannot move back — some windows are already cut. Undo the cuts first.",
      };
    }

    const { error } = await supabase
      .from("units")
      .update({ production_entered_at: null })
      .eq("id", unitId);

    if (error) return { ok: false, error: error.message };

    revalidatePath("/cutter/queue", "layout");
    revalidatePath("/cutter/production", "layout");

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to move unit back to queue.",
    };
  }
}
