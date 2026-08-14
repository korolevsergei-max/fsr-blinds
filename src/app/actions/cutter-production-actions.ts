"use server";

import { revalidatePath } from "next/cache";
import { INTERNAL_PARTNER_ID } from "@/lib/manufacturing-partners";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireCutterOrOwner, requireStationId } from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

// Revalidate the cutter queue/production layouts AFTER the response is sent, so
// the action returns in one auth-check + one UPDATE. The client updates the unit
// optimistically at the call site; the next navigation (or the coalesced
// refresh) picks up server truth. Revalidating synchronously here would re-run
// the multi-second queue read inside the action response (B1 / roadmap Phase 2).
function revalidateCutterQueuesAfterResponse() {
  after(() => {
    revalidatePath("/cutter/queue", "layout");
    revalidatePath("/cutter/production", "layout");
  });
}

/**
 * Move a unit forward from the queue into production by setting
 * production_entered_at = NOW(). No-op if already in production.
 */
export async function moveUnitToProduction(unitId: string): Promise<ActionResult> {
  try {
    const actor = await requireCutterOrOwner();
    const supabase = await createClient();

    // Exclusivity: a unit must never enter a production floor that is not the
    // one building it — a subcontractor's, or the OTHER station's. The queue no
    // longer lists them, so reaching here means a stale tab or a unit that was
    // relocated while it was open.
    //
    // The owner is exempt from the station comparison (they have no station and
    // legitimately act across the whole floor) but not from the subcontractor
    // check, which is why the two cases are separate below.
    const { data: unitRow } = await supabase
      .from("units")
      .select("manufacturing_partner_id, unit_number, manufacturing_partners(name, is_internal)")
      .eq("id", unitId)
      .maybeSingle();
    const unit = unitRow as
      | {
          manufacturing_partner_id: string | null;
          unit_number: string;
          manufacturing_partners?: { name: string; is_internal: boolean } | null;
        }
      | null;

    if (unit) {
      const partnerId = unit.manufacturing_partner_id ?? INTERNAL_PARTNER_ID;
      const partner = unit.manufacturing_partners;
      // Absent embed reads as in-house, matching resolveFactoryManufacturer:
      // the DB trigger is the real guard and locking the floor out of its own
      // work would be the worse failure.
      if (!(partner?.is_internal ?? partnerId === INTERNAL_PARTNER_ID)) {
        return {
          ok: false,
          error: `Unit ${unit.unit_number} is manufactured by a subcontractor. Refresh — it has left the in-house queue.`,
        };
      }
      if (actor.role === "cutter") {
        const stationId = await requireStationId();
        if (partnerId !== stationId) {
          return {
            ok: false,
            error: `Unit ${unit.unit_number} is now built at ${partner?.name ?? "another station"}. Refresh — it has left your queue.`,
          };
        }
      }
    }

    const { error } = await supabase
      .from("units")
      .update({ production_entered_at: new Date().toISOString() })
      .eq("id", unitId)
      .is("production_entered_at", null);

    if (error) return { ok: false, error: error.message };

    revalidateCutterQueuesAfterResponse();

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

    revalidateCutterQueuesAfterResponse();

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to move unit back to queue.",
    };
  }
}
