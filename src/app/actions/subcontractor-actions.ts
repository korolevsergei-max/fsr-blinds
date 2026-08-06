"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getLinkedPartnerId, getLinkedSubcontractorId, requireSubcontractor } from "@/lib/auth";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import { recomputeManufacturingRiskFlags } from "@/lib/manufacturing-risk";
import { emitNotification } from "@/lib/emit-notification";
import { NOTIF_SUBCONTRACTOR_UNIT_COMPLETE } from "@/lib/notification-types";
import { buildSubcontractorUnitCompleteBody } from "@/lib/notification-copy";
import { revalidateAllPortalData } from "@/app/actions/revalidation";

export type ActionResult = { ok: true } | { ok: false; error: string };

type ScopedUnit = {
  id: string;
  client_name: string;
  building_name: string;
  unit_number: string;
  status: string;
};

type ScopedWindow = { id: string; unit_id: string };

type ScopeResult =
  | { ok: true; partnerId: string; windows: ScopedWindow[]; units: ScopedUnit[] }
  | { ok: false; error: string };

/**
 * Resolve the caller's partner and narrow `windowIds` to blinds in units that
 * partner owns.
 *
 * RLS would already hide other partners' rows, but an explicit check turns a
 * silent no-op into a real error message — and keeps the guarantee in the app
 * layer where it is testable, per the pattern in fsr-data/_shared.
 */
async function scopeWindowsToCallersPartner(
  supabase: Awaited<ReturnType<typeof createClient>>,
  authUserId: string,
  windowIds: string[]
): Promise<ScopeResult> {
  const partnerId = await getLinkedPartnerId(authUserId);
  if (!partnerId) {
    return { ok: false, error: "No manufacturer is linked to your account." };
  }

  const { data: windowRows, error: windowsError } = await supabase
    .from("windows")
    .select("id, unit_id")
    .in("id", windowIds);
  if (windowsError) return { ok: false, error: windowsError.message };

  const windows = (windowRows as ScopedWindow[] | null) ?? [];
  if (windows.length === 0) {
    return { ok: false, error: "Those blinds no longer exist. Refresh and try again." };
  }

  const { data: unitRows, error: unitsError } = await supabase
    .from("units")
    .select("id, client_name, building_name, unit_number, status")
    .in("id", [...new Set(windows.map((w) => w.unit_id))])
    .eq("manufacturing_partner_id", partnerId);
  if (unitsError) return { ok: false, error: unitsError.message };

  const units = (unitRows as ScopedUnit[] | null) ?? [];
  const ownedUnitIds = new Set(units.map((u) => u.id));
  const scopedWindows = windows.filter((w) => ownedUnitIds.has(w.unit_id));

  if (scopedWindows.length === 0) {
    return { ok: false, error: "Those blinds are not assigned to you." };
  }
  return { ok: true, partnerId, windows: scopedWindows, units };
}

/**
 * Mark selected blinds manufactured, QC'd and packaged by the subcontractor.
 *
 * Granularity is the WINDOW, matching how the partner works: they tick off rows
 * on the sheet as they finish them, rather than waiting for a whole apartment.
 * Each row becomes `qc_approved` — a state the pipeline already understands, so
 * recomputeUnitStatus and the `unit_current_stages` view report progress with no
 * new stage machinery. A unit whose blinds are only partly done reads as
 * "Assembled"; it reaches "Quality Checked" when the last one lands.
 */
export async function completeWindowsForPartner(windowIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireSubcontractor();
    if (windowIds.length === 0) {
      return { ok: false, error: "Select at least one blind." };
    }

    const supabase = await createClient();
    const scoped = await scopeWindowsToCallersPartner(supabase, user.id, windowIds);
    if (!scoped.ok) return scoped;

    const subcontractorId = await getLinkedSubcontractorId(user.id);
    const { windows, units } = scoped;

    const { data: existingRows, error: existingError } = await supabase
      .from("window_production_status")
      .select("id, window_id, status")
      .in("window_id", windows.map((w) => w.id));
    if (existingError) return { ok: false, error: existingError.message };

    const existingByWindowId = new Map(
      ((existingRows as { id: string; window_id: string; status: string }[] | null) ?? []).map(
        (r) => [r.window_id, r]
      )
    );

    const now = new Date().toISOString();
    const upserts = windows
      .filter((w) => existingByWindowId.get(w.id)?.status !== "qc_approved")
      .map((w) => {
        const existing = existingByWindowId.get(w.id);
        return {
          id: existing?.id ?? `ps-${crypto.randomUUID().slice(0, 8)}`,
          window_id: w.id,
          unit_id: w.unit_id,
          status: "qc_approved",
          // The partner cuts, assembles and QCs as one handoff, so all three
          // stamps land together rather than inventing separate events. The
          // Completed view shows qc_approved_at as "Date completed".
          cut_at: now,
          assembled_at: now,
          qc_approved_at: now,
          completed_by_subcontractor_id: subcontractorId,
          issue_status: "none",
          issue_reason: "",
          issue_notes: "",
          cut_notes: "",
          assembled_notes: "",
          qc_notes: "",
        };
      });

    if (upserts.length === 0) {
      return { ok: false, error: "Those blinds are already marked complete." };
    }

    const { error: upsertError } = await supabase
      .from("window_production_status")
      .upsert(upserts, { onConflict: "window_id" });
    if (upsertError) return { ok: false, error: upsertError.message };

    const partnerName = user.displayName;
    const touchedUnitIds = [...new Set(windows.map((w) => w.unit_id))];
    const completedCountByUnit = new Map<string, number>();
    for (const w of windows) {
      completedCountByUnit.set(w.unit_id, (completedCountByUnit.get(w.unit_id) ?? 0) + 1);
    }

    after(async () => {
      const followUpSupabase = await createClient();
      for (const unitId of touchedUnitIds) {
        await recomputeUnitStatus(followUpSupabase, unitId);
      }
      await recomputeManufacturingRiskFlags();

      // Only announce a unit once it is fully done — a per-blind notification
      // would bury the scheduler under noise on a five-window apartment.
      const { data: remaining } = await followUpSupabase
        .from("window_production_status")
        .select("unit_id")
        .in("unit_id", touchedUnitIds)
        .neq("status", "qc_approved");
      const stillOpen = new Set(
        ((remaining as { unit_id: string }[] | null) ?? []).map((r) => r.unit_id)
      );

      // Notifications are addressed to a specific recipient, and the scheduler is
      // the one who acts on "ready to install" (they also have the only alerts
      // page). Units with no scheduler simply surface on the owner dashboard.
      const { data: assignments } = await followUpSupabase
        .from("scheduler_unit_assignments")
        .select("unit_id, scheduler_id")
        .in("unit_id", touchedUnitIds);
      const schedulerByUnit = new Map(
        ((assignments as { unit_id: string; scheduler_id: string }[] | null) ?? []).map((a) => [
          a.unit_id,
          a.scheduler_id,
        ])
      );

      for (const unit of units) {
        if (stillOpen.has(unit.id)) continue;
        const schedulerId = schedulerByUnit.get(unit.id);
        if (!schedulerId) continue;
        await emitNotification({
          recipientRole: "scheduler",
          recipientId: schedulerId,
          type: NOTIF_SUBCONTRACTOR_UNIT_COMPLETE,
          title: "Manufacturing complete",
          body: buildSubcontractorUnitCompleteBody(
            {
              clientName: unit.client_name,
              buildingName: unit.building_name,
              unitNumber: unit.unit_number,
            },
            { partnerName, windowCount: completedCountByUnit.get(unit.id) ?? 0 }
          ),
          relatedUnitId: unit.id,
        });
      }

      revalidatePath("/subcontractor", "layout");
      revalidateAllPortalData();
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to mark blinds complete",
    };
  }
}

/**
 * Move blinds back to the production list. Mirrors undoWindowQC, but refuses once
 * the unit is installed — reversing then would contradict work already done on
 * site. Without this a mis-click is unrecoverable for the partner.
 */
export async function reopenWindowsForPartner(windowIds: string[]): Promise<ActionResult> {
  try {
    const user = await requireSubcontractor();
    if (windowIds.length === 0) {
      return { ok: false, error: "Select at least one blind." };
    }

    const supabase = await createClient();
    const scoped = await scopeWindowsToCallersPartner(supabase, user.id, windowIds);
    if (!scoped.ok) return scoped;

    const installed = scoped.units.filter((u) => u.status === "installed");
    if (installed.length > 0) {
      return {
        ok: false,
        error: `Unit ${installed[0]!.unit_number} is already installed and can no longer be reopened.`,
      };
    }

    const scopedWindowIds = scoped.windows.map((w) => w.id);
    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "pending",
        cut_at: null,
        assembled_at: null,
        qc_approved_at: null,
        qc_approved_by_qc_id: null,
        qc_approved_by_assembler_id: null,
        completed_by_subcontractor_id: null,
      })
      .in("window_id", scopedWindowIds)
      .eq("status", "qc_approved");

    if (error) return { ok: false, error: error.message };

    const touchedUnitIds = [...new Set(scoped.windows.map((w) => w.unit_id))];

    after(async () => {
      const followUpSupabase = await createClient();
      for (const unitId of touchedUnitIds) {
        await recomputeUnitStatus(followUpSupabase, unitId);
      }
      await recomputeManufacturingRiskFlags();
      revalidatePath("/subcontractor", "layout");
      revalidateAllPortalData();
    });

    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to reopen blinds",
    };
  }
}
