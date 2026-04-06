"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireManufacturer,
  requireQC,
  getLinkedManufacturerId,
  getLinkedQCPersonId,
} from "@/lib/auth";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/manufacturer", "layout");
  revalidatePath("/qc", "layout");
  revalidatePath("/management", "layout");
}

/** Mark a single window blind as built by the current manufacturer. */
export async function markWindowBuilt(
  windowId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requireManufacturer();
    const supabase = await createClient();

    const manufacturerId = await getLinkedManufacturerId(user.id);
    if (!manufacturerId) {
      return { ok: false, error: "Manufacturer profile not found." };
    }

    // Get the unit_id for this window (via room)
    const { data: window, error: windowErr } = await supabase
      .from("windows")
      .select("id, room_id, rooms!inner(unit_id)")
      .eq("id", windowId)
      .single();

    if (windowErr || !window) {
      return { ok: false, error: "Window not found." };
    }

    const rooms = window.rooms as unknown as { unit_id: string } | { unit_id: string }[];
    const unitId = Array.isArray(rooms) ? rooms[0]?.unit_id : rooms?.unit_id;

    if (!unitId) {
      return { ok: false, error: "Unit ID not found for this window." };
    }
    const now = new Date().toISOString();

    const { error } = await supabase.from("window_production_status").upsert(
      {
        id: `wps-${crypto.randomUUID().slice(0, 8)}`,
        window_id: windowId,
        unit_id: unitId,
        status: "built",
        built_by_manufacturer_id: manufacturerId,
        built_at: now,
        built_notes: notes?.trim() ?? "",
      },
      { onConflict: "window_id" }
    );

    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark window as built." };
  }
}

/** Mark a single window blind as QC approved by the current QC person. */
export async function markWindowQCApproved(
  windowId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requireQC();
    const supabase = await createClient();

    const qcId = await getLinkedQCPersonId(user.id);
    if (!qcId) {
      return { ok: false, error: "QC profile not found." };
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "qc_approved",
        qc_approved_by_qc_id: qcId,
        qc_approved_at: now,
        qc_notes: notes?.trim() ?? "",
      })
      .eq("window_id", windowId)
      .eq("status", "built");

    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark QC approved." };
  }
}

/**
 * Compute and update manufacturing_risk_flag for all units with an installation_date.
 * Called server-side on manufacturer/QC dashboard load.
 *
 * Risk logic (per unit):
 *   - If all windows qc_approved → green
 *   - If installation_date - today <= 3 days AND not all qc_approved → red
 *   - If installation_date - today <= 5 days AND not all built → yellow
 *   - Otherwise → green
 */
export async function computeAndUpdateManufacturingRisk(): Promise<void> {
  try {
    const supabase = await createClient();

    // Load all measured units that have an installation date
    const { data: units } = await supabase
      .from("units")
      .select("id, installation_date, window_count")
      .eq("status", "measured")
      .not("installation_date", "is", null);

    if (!units || units.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const unit of units) {
      if (!unit.installation_date || unit.window_count === 0) continue;

      const installDate = new Date(unit.installation_date);
      installDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.floor(
        (installDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Count production statuses for this unit's windows
      const { data: statuses } = await supabase
        .from("window_production_status")
        .select("status")
        .eq("unit_id", unit.id);

      const builtCount = statuses?.filter(
        (s) => s.status === "built" || s.status === "qc_approved"
      ).length ?? 0;
      const qcApprovedCount = statuses?.filter(
        (s) => s.status === "qc_approved"
      ).length ?? 0;

      const totalWindows = unit.window_count;
      const allQCApproved = qcApprovedCount >= totalWindows;
      const allBuilt = builtCount >= totalWindows;

      let flag: "green" | "yellow" | "red" = "green";
      if (allQCApproved) {
        flag = "green";
      } else if (daysUntil <= 3) {
        flag = "red";
      } else if (daysUntil <= 5 && !allBuilt) {
        flag = "yellow";
      }

      await supabase
        .from("units")
        .update({ manufacturing_risk_flag: flag })
        .eq("id", unit.id);
    }
  } catch {
    // Non-fatal — risk flags are best-effort
  }
}
