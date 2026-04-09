"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  requireCutter,
  requireAssembler,
  getLinkedCutterId,
  getLinkedAssemblerId,
} from "@/lib/auth";
import { emitNotification } from "@/lib/emit-notification";
import { NOTIF_MFG_BEHIND_SCHEDULE } from "@/lib/notification-types";

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateAll() {
  revalidatePath("/cutter", "layout");
  revalidatePath("/assembler", "layout");
  revalidatePath("/management", "layout");
}

/** Mark a single window blind as cut by the current cutter. */
export async function markWindowCut(
  windowId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requireCutter();
    const supabase = await createClient();

    const cutterId = await getLinkedCutterId(user.id);
    if (!cutterId) {
      return { ok: false, error: "Cutter profile not found." };
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
        status: "cut",
        cut_by_cutter_id: cutterId,
        cut_at: now,
        cut_notes: notes?.trim() ?? "",
      },
      { onConflict: "window_id" }
    );

    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark window as cut." };
  }
}

/** Mark a single window blind as assembled by the current assembler. */
export async function markWindowAssembled(
  windowId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requireAssembler();
    const supabase = await createClient();

    const assemblerId = await getLinkedAssemblerId(user.id);
    if (!assemblerId) {
      return { ok: false, error: "Assembler profile not found." };
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "assembled",
        assembled_by_assembler_id: assemblerId,
        assembled_at: now,
        assembled_notes: notes?.trim() ?? "",
      })
      .eq("window_id", windowId)
      .eq("status", "cut");

    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark window as assembled." };
  }
}

/** Mark a single window blind as QC approved by the current assembler. */
export async function markWindowQCApproved(
  windowId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requireAssembler();
    const supabase = await createClient();

    const assemblerId = await getLinkedAssemblerId(user.id);
    if (!assemblerId) {
      return { ok: false, error: "Assembler profile not found." };
    }

    const now = new Date().toISOString();

    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "qc_approved",
        qc_approved_by_assembler_id: assemblerId,
        qc_approved_at: now,
        qc_notes: notes?.trim() ?? "",
      })
      .eq("window_id", windowId)
      .eq("status", "assembled");

    if (error) return { ok: false, error: error.message };

    revalidateAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark QC approved." };
  }
}

/**
 * Compute and update manufacturing_risk_flag for all units with an installation_date.
 * Called server-side on cutter/assembler dashboard load.
 *
 * Risk logic (per unit):
 *   - If all windows qc_approved → complete
 *   - If installation_date - today <= 3 days AND not all qc_approved → red
 *   - If installation_date - today <= 5 days AND not all cut → yellow
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

      const cutCount = statuses?.filter(
        (s) => s.status === "cut" || s.status === "assembled" || s.status === "qc_approved"
      ).length ?? 0;
      const qcApprovedCount = statuses?.filter(
        (s) => s.status === "qc_approved"
      ).length ?? 0;

      const totalWindows = unit.window_count;
      const allQCApproved = qcApprovedCount >= totalWindows;
      const allCut = cutCount >= totalWindows;

      let flag: "green" | "yellow" | "red" | "complete" = "green";
      if (allQCApproved) {
        flag = "complete";
      } else if (daysUntil <= 3) {
        flag = "red";
      } else if (daysUntil <= 5 && !allCut) {
        flag = "yellow";
      }

      const { data: prevRow } = await supabase
        .from("units")
        .select("manufacturing_risk_flag")
        .eq("id", unit.id)
        .maybeSingle();
      const prevFlag = prevRow?.manufacturing_risk_flag ?? "green";

      await supabase
        .from("units")
        .update({ manufacturing_risk_flag: flag })
        .eq("id", unit.id);

      // Emit scheduler notification when risk escalates to yellow/red within 3 days of install
      if ((flag === "yellow" || flag === "red") && flag !== prevFlag && daysUntil <= 3) {
        const { data: assignment } = await supabase
          .from("scheduler_unit_assignments")
          .select("scheduler_id")
          .eq("unit_id", unit.id)
          .maybeSingle();
        if (assignment?.scheduler_id) {
          await emitNotification({
            recipientRole: "scheduler",
            recipientId: assignment.scheduler_id,
            type: NOTIF_MFG_BEHIND_SCHEDULE,
            title: flag === "red" ? "🔴 Blinds at risk for install" : "🟡 Manufacturing behind schedule",
            body: `Installation in ${daysUntil} day(s) — blinds not yet ${flag === "red" ? "QC approved" : "fully cut"}.`,
            relatedUnitId: unit.id,
          });
        }
      }
    }
  } catch {
    // Non-fatal — risk flags are best-effort
  }
}
