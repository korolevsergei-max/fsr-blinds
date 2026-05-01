"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { recomputeUnitStatus } from "@/lib/unit-progress";
import {
  requireCutter,
  requireAssembler,
  requireQc,
  getLinkedCutterId,
  getLinkedAssemblerId,
  getLinkedQcId,
} from "@/lib/auth";
import { emitNotification } from "@/lib/emit-notification";
import {
  NOTIF_MFG_BEHIND_SCHEDULE,
  NOTIF_MFG_PUSHBACK_RESOLVED,
} from "@/lib/notification-types";
import { loadManufacturingSettings, reflowManufacturingSchedules } from "@/lib/manufacturing-scheduler";
import { addWorkingDays } from "@/lib/manufacturing-calendar";
import {
  buildManufacturingPushbackResolvedBody,
  buildManufacturingRiskNotificationBody,
  type UnitNotificationContext,
} from "@/lib/notification-copy";
import { resolveManufacturingEscalationsForTarget } from "@/lib/manufacturing-escalations";

export type ActionResult = { ok: true } | { ok: false; error: string };

const REVALIDATE_PATH_BY_REASON = {
  mark_cut: "/cutter",
  mark_assembled: "/assembler",
  mark_qc: "/qc",
} as const;

function scheduleManufacturingFollowUp(args: {
  unitId: string;
  windowId?: string;
  resolvedPushbackFor?: "cutter" | "assembler" | "qc" | null;
  scheduleReason: "mark_cut" | "mark_assembled" | "mark_qc";
}) {
  after(async () => {
    const followUpSupabase = await createClient();

    if (args.windowId && args.resolvedPushbackFor) {
      await notifyManufacturingPushbackResolved(followUpSupabase, {
        unitId: args.unitId,
        windowId: args.windowId,
        targetRole: args.resolvedPushbackFor,
      });
    }

    await recomputeUnitStatus(followUpSupabase, args.unitId);
    await reflowManufacturingSchedules(args.scheduleReason);
    revalidatePath(REVALIDATE_PATH_BY_REASON[args.scheduleReason], "layout");
  });
}

async function loadManufacturingNotificationContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  unitId: string,
  windowId: string
): Promise<{
  context: UnitNotificationContext;
  roomName: string;
  windowLabel: string;
  installerId: string | null;
  schedulerId: string | null;
}> {
  const [unitRes, roomRes, assignmentRes] = await Promise.all([
    supabase
      .from("units")
      .select("client_name, building_name, unit_number, assigned_installer_id")
      .eq("id", unitId)
      .single(),
    supabase
      .from("windows")
      .select("label, rooms!inner(name)")
      .eq("id", windowId)
      .single(),
    supabase
      .from("scheduler_unit_assignments")
      .select("scheduler_id")
      .eq("unit_id", unitId)
      .maybeSingle(),
  ]);

  const room = roomRes.data?.rooms as unknown as { name?: string } | { name?: string }[] | null;
  const roomName = Array.isArray(room) ? room[0]?.name ?? "Room" : room?.name ?? "Room";

  return {
    context: {
      clientName: unitRes.data?.client_name ?? "",
      buildingName: unitRes.data?.building_name ?? "",
      unitNumber: unitRes.data?.unit_number ?? "",
    },
    roomName,
    windowLabel: roomRes.data?.label ?? "Window",
    installerId: unitRes.data?.assigned_installer_id ?? null,
    schedulerId: assignmentRes.data?.scheduler_id ?? null,
  };
}

async function notifyManufacturingPushbackResolved(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    unitId: string;
    windowId: string;
    targetRole: "cutter" | "assembler" | "qc";
  }
) {
  const details = await loadManufacturingNotificationContext(supabase, args.unitId, args.windowId);
  const body = buildManufacturingPushbackResolvedBody(details.context, {
    roomName: details.roomName,
    windowLabel: details.windowLabel,
    targetRole: args.targetRole,
  });

  if (details.schedulerId) {
    await emitNotification({
      recipientRole: "scheduler",
      recipientId: details.schedulerId,
      type: NOTIF_MFG_PUSHBACK_RESOLVED,
      title: "Manufacturing rework completed",
      body,
      relatedUnitId: args.unitId,
    });
  }

  if (details.installerId) {
    await emitNotification({
      recipientRole: "installer",
      recipientId: details.installerId,
      type: NOTIF_MFG_PUSHBACK_RESOLVED,
      title: "Manufacturing rework completed",
      body,
      relatedUnitId: args.unitId,
    });
  }
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

    const resolvedPushback = await resolveManufacturingEscalationsForTarget(supabase, {
      windowId,
      targetRole: "cutter",
      resolvedByUserId: user.id,
    });

    scheduleManufacturingFollowUp({
      unitId,
      windowId,
      resolvedPushbackFor: resolvedPushback ? "cutter" : null,
      scheduleReason: "mark_cut",
    });
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

    const { data: currentRow } = await supabase
      .from("window_production_status")
      .select("unit_id")
      .eq("window_id", windowId)
      .maybeSingle();

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

    const resolvedPushback = await resolveManufacturingEscalationsForTarget(supabase, {
      windowId,
      targetRole: "assembler",
      resolvedByUserId: user.id,
    });

    if (currentRow?.unit_id) {
      scheduleManufacturingFollowUp({
        unitId: currentRow.unit_id,
        windowId,
        resolvedPushbackFor: resolvedPushback ? "assembler" : null,
        scheduleReason: "mark_assembled",
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark window as assembled." };
  }
}

/** Mark a single window blind as built fully by the current QC user. */
export async function markWindowQCApproved(
  windowId: string,
  notes?: string
): Promise<ActionResult> {
  try {
    const user = await requireQc();
    const supabase = await createClient();

    const qcId = await getLinkedQcId(user.id);
    if (!qcId) {
      return { ok: false, error: "QC profile not found." };
    }

    const now = new Date().toISOString();
    const { data: currentRow } = await supabase
      .from("window_production_status")
      .select("unit_id")
      .eq("window_id", windowId)
      .maybeSingle();

    const { error } = await supabase
      .from("window_production_status")
      .update({
        status: "qc_approved",
        qc_approved_by_assembler_id: null,
        qc_approved_by_qc_id: qcId,
        qc_approved_at: now,
        qc_notes: notes?.trim() ?? "",
      })
      .eq("window_id", windowId)
      .eq("status", "assembled");

    if (error) return { ok: false, error: error.message };

    if (currentRow?.unit_id) {
      scheduleManufacturingFollowUp({
        unitId: currentRow.unit_id,
        resolvedPushbackFor: null,
        scheduleReason: "mark_qc",
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Failed to mark blind as built fully." };
  }
}

/**
 * Compute and update manufacturing_risk_flag for all units with an installation_date.
 * Called server-side on cutter/assembler dashboard load.
 *
 * Risk logic (per unit):
 *   - If all windows qc_approved → complete (checkmark, green)
 *   - If installation_date - today <= 0 days → red (not ready by install day)
 *   - If installation_date - today <= 2 days → yellow (1-2 day buffer)
 *   - Otherwise (3+ days) → green (on track)
 */
export async function computeAndUpdateManufacturingRisk(): Promise<void> {
  try {
    const supabase = await createClient();
    const { settings, overrides } = await loadManufacturingSettings();
    const overridesByDate = new Map(overrides.map((override) => [override.workDate, override]));

    // Load all measured units that have an installation date
    const { data: units } = await supabase
      .from("units")
      .select("id, installation_date, window_count, client_name, building_name, unit_number")
      .in("status", ["measured", "bracketed", "manufactured", "measured_and_bracketed"])
      .not("installation_date", "is", null);

    if (!units || units.length === 0) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const unit of units) {
      if (!unit.installation_date || unit.window_count === 0) continue;

      const targetReadyDate = addWorkingDays(
        unit.installation_date,
        -3,
        settings,
        overridesByDate
      );
      const readyDate = new Date(targetReadyDate);
      readyDate.setHours(0, 0, 0, 0);
      const daysUntil = Math.floor(
        (readyDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Count production statuses for this unit's windows
      const { data: statuses } = await supabase
        .from("window_production_status")
        .select("status")
        .eq("unit_id", unit.id);

      const qcApprovedCount = statuses?.filter(
        (s) => s.status === "qc_approved"
      ).length ?? 0;

      const totalWindows = unit.window_count;
      const allQCApproved = qcApprovedCount >= totalWindows;

      let flag: "green" | "yellow" | "red" | "complete" = "green";
      if (allQCApproved) {
        flag = "complete";
      } else if (daysUntil <= 0) {
        flag = "red";
      } else if (daysUntil <= 2) {
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

      // Emit scheduler notification when risk escalates inside the 2-day install buffer.
      if ((flag === "yellow" || flag === "red") && flag !== prevFlag && daysUntil <= 2) {
        const { data: assignment } = await supabase
          .from("scheduler_unit_assignments")
          .select("scheduler_id")
          .eq("unit_id", unit.id)
          .maybeSingle();
        if (assignment?.scheduler_id) {
          const context: UnitNotificationContext = {
            clientName: unit.client_name ?? "",
            buildingName: unit.building_name ?? "",
            unitNumber: unit.unit_number ?? "",
          };
          await emitNotification({
            recipientRole: "scheduler",
            recipientId: assignment.scheduler_id,
            type: NOTIF_MFG_BEHIND_SCHEDULE,
            title: flag === "red" ? "🔴 Blinds at risk for install" : "🟡 Manufacturing behind schedule",
            body: buildManufacturingRiskNotificationBody(context, daysUntil),
            relatedUnitId: unit.id,
          });
        }
      }
    }
  } catch {
    // Non-fatal — risk flags are best-effort
  }
}
